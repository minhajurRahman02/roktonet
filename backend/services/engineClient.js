// Bridges Postgres and the Python optimization service.
// This module never talks to the frontend directly -- it's called by
// route handlers (immediate trigger) or a scheduler (batch trigger).

const pool = require('../db');

const ENGINE_URL = process.env.ENGINE_URL || 'http://127.0.0.1:5001';

async function runAllocationBatch() {
  // "Pending" = hasn't been through the engine yet.
  const requestsResult = await pool.query(
    `SELECT request_id, org_id, blood_type, component, quantity, urgency_tier
     FROM requests WHERE fulfillment_path IS NULL`
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

  const response = await fetch(`${ENGINE_URL}/engine/allocate`, {
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
  // Requests still in `shortfalls` are left NULL (still pending) --
  // the donor-fallback trigger (Section 7A) isn't built yet; that's
  // separate work, not silently faked here.
  const shortfallRequestIds = new Set(Object.keys(result.shortfalls));
  const processedRequestIds = requestsResult.rows.map((r) => r.request_id);

  for (const request_id of processedRequestIds) {
    if (!shortfallRequestIds.has(request_id)) {
      await pool.query(`UPDATE requests SET fulfillment_path = 'inventory' WHERE request_id = $1`, [
        request_id,
      ]);
    }
  }

  return {
    processed: processedRequestIds.length,
    assignments: result.assignments.length,
    shortfalls: result.shortfalls,
  };
}

module.exports = { runAllocationBatch };
