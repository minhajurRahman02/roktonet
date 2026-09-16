// Bridges Postgres and the Python optimization service.
// This module never talks to the frontend directly -- it's called by
// route handlers (immediate trigger) or a scheduler (batch trigger).

const pool = require('../db');
const { triggerDonorFallback } = require('./donorFallback');
const { logRequestEvent } = require('./requestEvents');

const ENGINE_URL = process.env.ENGINE_URL || 'http://127.0.0.1:5001';

// On Render's free tier, the engine sleeps after 15 minutes idle. Observed
// behaviour on wake is a 429 for the first request or two during the
// ~30-60s boot window -- not a slow response that eventually succeeds, an
// outright rejection. The frontend's warmEngine() ping (api/engine.js)
// covers the common case of someone actively using the site, but this
// scheduler runs on its own timer regardless of whether anyone has the
// site open, so it needs its own protection against hitting the engine
// cold with no one around to have warmed it first.
//
// Three attempts, waiting longer each time, capped around 75s total added
// latency in the worst case. That's a real wait for a hospital submitting
// a critical request synchronously (see routes/requests.js), but it's the
// honest cost of a free-tier cold start -- and far better than surfacing a
// raw 429 to someone trying to get blood allocated.
async function fetchWithColdStartRetry(url, options, attempts = 3, delaysMs = [5000, 15000, 30000]) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, options);
      // Only 429 gets retried -- it's the specific cold-start symptom
      // observed. Any other status (400, 500, etc.) is a real answer from
      // a running engine and should surface immediately, not be masked
      // behind a retry loop.
      if (response.status !== 429) return response;
      lastError = new Error(`Engine service responded with status ${response.status}`);
    } catch (err) {
      // Network-level failure (connection refused, DNS not ready yet) --
      // same treatment as a 429, since it's the same underlying cause.
      lastError = err;
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delaysMs[i]));
    }
  }
  throw lastError;
}

async function runAllocationBatch() {
  // "Pending" = hasn't been through the engine yet.
  const requestsResult = await pool.query(
    `SELECT request_id, org_id, blood_type, component, quantity, urgency_tier
     FROM requests WHERE fulfillment_path IS NULL AND cancelled_at IS NULL`
  );

  if (requestsResult.rows.length === 0) {
    return { message: 'No pending requests to process.' };
  }

  // "Eligible stock" = currently available. Convert expiry_date into
  // days_until_expiry here, since that's the shape the engine expects
  // (Postgres can subtract two dates directly and get a day count).
  const inventoryResult = await pool.query(
    `SELECT unit_id, org_id, blood_type, component,
            (expiry_date - CURRENT_DATE) AS days_until_expiry
     FROM inventory_units WHERE status = 'available'`
  );

  const orgsResult = await pool.query(`SELECT org_id, district FROM organizations`);
  const organizations = {};
  orgsResult.rows.forEach((o) => {
    organizations[o.org_id] = o.district;
  });

  const payload = {
    requests: requestsResult.rows,
    inventory: inventoryResult.rows,
    organizations,
  };

  const response = await fetchWithColdStartRetry(`${ENGINE_URL}/engine/allocate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Engine service responded with status ${response.status}`);
  }

  const result = await response.json();

  // Write assignments back: one allocation_record per (request, unit) pair,
  // and mark that unit as no longer available for future batches.
  for (const { request_id, unit_id } of result.assignments) {
    await pool.query(
      `INSERT INTO allocation_records (request_id, unit_id) VALUES ($1, $2)`,
      [request_id, unit_id]
    );
    await pool.query(`UPDATE inventory_units SET status = 'reserved' WHERE unit_id = $1`, [
      unit_id,
    ]);
  }

  // Requests fully covered get marked fulfilled via inventory.
  // Requests still short escalate to the Section 7A donor-fallback flow --
  // except elective, which needs the proper 7B feasibility+risk-check
  // pipeline (depends on the forecasting model, not built yet -- future
  // phase). Elective shortfalls are left untouched for now.
  const shortfallRequestIds = new Set(Object.keys(result.shortfalls));
  const processedRequestIds = requestsResult.rows.map((r) => r.request_id);
  const fallbackResults = [];

  for (const req of requestsResult.rows) {
    if (!shortfallRequestIds.has(req.request_id)) {
      await pool.query(`UPDATE requests SET fulfillment_path = 'inventory' WHERE request_id = $1`, [
        req.request_id,
      ]);

      // Real count, not a placeholder -- how many of THIS request's units
      // came from this specific batch's assignments.
      const unitsMatched = result.assignments.filter((a) => a.request_id === req.request_id).length;
      await logRequestEvent(
        req.request_id,
        'engine_resolved_inventory',
        `Matched with ${unitsMatched} unit(s) from existing inventory — request resolved`,
        { units_matched: unitsMatched }
      );
    } else if (req.urgency_tier !== 'elective') {
      await logRequestEvent(
        req.request_id,
        'engine_shortfall',
        'Inventory alone could not fully cover this request',
        { shortfall: result.shortfalls[req.request_id] }
      );

      const outcome = await triggerDonorFallback(req);
      fallbackResults.push(outcome);
    }
  }

  return {
    processed: processedRequestIds.length,
    assignments: result.assignments.length,
    shortfalls: result.shortfalls,
    donor_fallback_triggered: fallbackResults,
  };
}

module.exports = { runAllocationBatch };