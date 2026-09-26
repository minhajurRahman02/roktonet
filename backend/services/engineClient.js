// Bridges Postgres and the Python optimization service.
// This module never talks to the frontend directly -- it's called by
// route handlers (immediate trigger) or a scheduler (batch trigger).

const pool = require('../db');
const { triggerDonorFallback } = require('./donorFallback');
const { logRequestEvent } = require('./requestEvents');
const { SUPPLIER_ORG_TYPES } = require('../constants/supplierOrgTypes');
const { notifyOrg } = require('./notificationService');

const ENGINE_URL = process.env.ENGINE_URL || 'http://127.0.0.1:5001';

// How close to its needed_by_date an elective request has to be before
// the system will call donors for it.
//
// Elective means planned surgery, often weeks out. Inviting donors the
// moment such a request is filed would burn through the donor pool and
// their annual donation caps for blood that is not needed yet, and the
// cooldown it starts would make those donors unavailable for the
// critical requests that arrive in the meantime. Outside this window an
// elective request keeps whatever inventory it was given and waits.
const ELECTIVE_MOBILIZATION_WINDOW_DAYS = Number(
  process.env.ELECTIVE_MOBILIZATION_WINDOW_DAYS || 7
);

// ---------------------------------------------------------------------
// 7.7a: single-flight batching.
//
// THE BUG THIS FIXES. runAllocationBatch used to run
// SELECT-pending -> solve -> INSERT with no lock and no transaction,
// while THREE things could call it concurrently:
//   1. the synchronous critical/urgent path in routes/requests.js
//   2. the 60-second setInterval in scheduler.js
//   3. the admin "Run batch now" button
//
// Two overlapping runs both saw the same pending request, both sent the
// same inventory to the engine, and both wrote the answer back. The
// engine itself was never at fault -- engine.py constrains
// lpSum(assigned) + shortfall == quantity and caps each unit to one
// request, so a single solve cannot over-allocate. The damage was
// entirely in this file's read-solve-write being non-atomic.
//
// Observed symptoms: "4 / 2 allocated" on the admin Requests page (a raw
// COUNT over allocation_records, which had no unique constraint), and the
// same "Matched with N unit(s) ... request resolved" event logged twice,
// since that event is written exactly once per batch run per request.
//
// THE FIX IS THE ADVISORY LOCK, not the transaction. A transaction alone
// would not have helped: both runs read committed data and wrote rows
// that did not conflict with each other, so nothing would have aborted.
// What was needed was mutual exclusion across the whole read-solve-write,
// which is what a session-level advisory lock gives.
//
// The lock is NOT held across the engine HTTP call's transaction. A cold
// Render free-tier engine can take 75 seconds to answer, and holding an
// open Postgres transaction that long would pin a pooled connection and
// its row locks for the duration. So: hold the advisory lock for the
// whole batch (cheap, it is just a lock table entry), but only open the
// real transaction once the engine has answered and we are ready to
// write.
// ---------------------------------------------------------------------

// Arbitrary but fixed. Any process calling pg_advisory_lock with this
// same key contends with us; nothing else in the system uses advisory
// locks, so collision is not a concern.
const ALLOCATION_LOCK_KEY = 4711002;

// If another batch holds the lock, wait a little rather than giving up
// immediately. Usually the running batch already has our request in its
// pending set and will resolve it for us, but not always: if it took its
// snapshot microseconds before our INSERT committed, our request is not
// in it. For a critical request submitted synchronously, waiting a few
// seconds is far better than silently deferring to the 60s scheduler.
const LOCK_RETRY_ATTEMPTS = 4;
const LOCK_RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Acquires the batch lock, runs `work`, and always releases.
 *
 * pg_try_advisory_lock is session-scoped, so the lock lives on the
 * specific pooled connection we grab here and must be released on that
 * same connection -- hence holding the client for the whole call rather
 * than going through pool.query(). If the process dies mid-batch the
 * connection closes and Postgres drops the lock automatically, so a crash
 * cannot wedge the system.
 */
/**
 * True when an elective request is close enough to its date to justify
 * calling donors. A request with no date is treated as due now, which is
 * the safe reading: an elective request is supposed to carry a date, and
 * if one somehow lacks it, waiting forever is worse than acting early.
 */
function isWithinMobilizationWindow(neededByDate) {
  if (!neededByDate) return true;
  const due = new Date(neededByDate);
  if (Number.isNaN(due.getTime())) return true;
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  return days <= ELECTIVE_MOBILIZATION_WINDOW_DAYS;
}

/**
 * Tells each supplying organization that the engine has reserved units of
 * theirs and they need to dispatch.
 *
 * Nothing did this before. The engine reserved units and wrote allocation
 * records, and the bank or NGO holding them found out only by opening
 * its Outgoing Allocations page unprompted. Every unit in the system has
 * to pass through a human pressing Dispatch, so a dispatch step nobody is
 * told about is a dispatch step that does not happen.
 *
 * One notification per organization per batch rather than one per unit:
 * a bank that just had nine units taken wants to know that, not to
 * receive nine messages saying the same thing.
 */
async function notifySuppliers(applied) {
  if (applied.length === 0) return;
  try {
    const { rows } = await pool.query(
      `SELECT iu.org_id, COUNT(*)::int AS units,
              COUNT(DISTINCT ar.request_id)::int AS requests,
              MAX(r.urgency_tier) FILTER (WHERE r.urgency_tier = 'critical') AS has_critical,
              MAX(r.urgency_tier) FILTER (WHERE r.urgency_tier = 'urgent')   AS has_urgent
         FROM allocation_records ar
         JOIN inventory_units iu ON iu.unit_id = ar.unit_id
         JOIN requests r         ON r.request_id = ar.request_id
        WHERE ar.unit_id = ANY($1)
        GROUP BY iu.org_id`,
      [applied.map((a) => a.unit_id)]
    );

    for (const row of rows) {
      // Urgency here decides the email channel, exactly as it does
      // everywhere else. A critical request in the batch makes the whole
      // notification urgent, because that is the unit that needs moving
      // first.
      const tier = row.has_critical || row.has_urgent || null;
      const unitWord = row.units === 1 ? 'unit' : 'units';
      const reqWord = row.requests === 1 ? 'request' : 'requests';
      await notifyOrg(
        row.org_id,
        'dispatch_needed',
        `${row.units} ${unitWord} of your stock have been matched to ${row.requests} ${reqWord} `
        + 'and are waiting for you to dispatch them.',
        null,
        tier
      );
    }
  } catch (err) {
    // Same reasoning as notifyOrg's own email catch: the allocation is
    // already durable and correct. A failed notification must not roll
    // back or fail a batch that did its job.
    console.error('[engineClient] supplier notification failed:', err.message);
  }
}

async function withBatchLock(work) {
  const lockClient = await pool.connect();
  let acquired = false;
  try {
    for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt += 1) {
      const { rows } = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [
        ALLOCATION_LOCK_KEY,
      ]);
      if (rows[0].locked) {
        acquired = true;
        break;
      }
      if (attempt < LOCK_RETRY_ATTEMPTS - 1) await sleep(LOCK_RETRY_DELAY_MS);
    }

    if (!acquired) {
      // Deliberately not an error. Another batch is genuinely running and
      // will almost certainly cover these requests; anything it misses the
      // scheduler picks up within 60 seconds. Callers surface this as
      // "queued", not "failed".
      return {
        skipped: true,
        reason: 'Another allocation batch is already running; this request stays queued.',
      };
    }

    return await work(lockClient);
  } finally {
    if (acquired) {
      await lockClient
        .query('SELECT pg_advisory_unlock($1)', [ALLOCATION_LOCK_KEY])
        .catch((err) => console.error('[engineClient] advisory unlock failed:', err.message));
    }
    lockClient.release();
  }
}

async function runAllocationBatch() {
  return withBatchLock(async () => {
    // Reconcile first: a request whose allocations already cover it in
    // full, but whose fulfillment_path was never set.
    //
    // This closes a hole the remaining-quantity query would otherwise
    // open. Such a request has a remaining need of zero, so the pending
    // query below skips it, so nothing would ever resolve it and it
    // would sit "pending" forever while holding units. The old elective
    // bug produced exactly this shape, and so would any future crash
    // between the INSERT into allocation_records and the UPDATE of
    // fulfillment_path.
    //
    // It is a no-op on a healthy database.
    await pool.query(
      `UPDATE requests r SET fulfillment_path = 'inventory'
        WHERE r.fulfillment_path IS NULL
          AND r.cancelled_at IS NULL
          AND (SELECT COUNT(DISTINCT ar.unit_id) FROM allocation_records ar
                WHERE ar.request_id = r.request_id) >= r.quantity`
    );

    // "Pending" = hasn't been through the engine yet.
    const requestsResult = await pool.query(
      // THE COLUMN LIST IS EXPLICIT ON PURPOSE -- DO NOT CHANGE IT TO r.* .
      //
      // requests also carries patient_name, patient_phone and patient_note.
      // Those are display-only fields that exist so hospital staff can track
      // which units went to which patient, and the project's commitment is
      // that they never influence an allocation decision.
      //
      // That commitment is kept structurally rather than by discipline: this
      // list is the only path from the requests table into the solver, so if
      // the columns are not named here the engine cannot read them, and no
      // amount of later editing inside engine.py could make it depend on
      // them. Widening this to SELECT * would silently hand patient
      // identifiers to the optimizer and break the guarantee without any
      // test failing.
      //
      // QUANTITY IS THE REMAINING NEED, NOT THE ORIGINAL ASK.
      //
      // This is the fix for requests showing "allocated: 3/2". Previously
      // this selected r.quantity, so a request that came back through the
      // batch a second time asked for its full original quantity again,
      // while its own already-allocated units were excluded from the
      // available pool for being 'reserved'. The engine therefore picked
      // DIFFERENT units, and the (request_id, unit_id) unique constraint
      // cannot catch a different unit. Each pass added more.
      //
      // Subtracting what is already allocated means an over-allocation is
      // arithmetically impossible, whatever route takes a request back
      // into the pool. That matters more than fixing the one path that
      // caused it, because it holds for paths nobody has thought of yet.
      //
      // THE ::int CASTS ARE REQUIRED, NOT TIDINESS. COUNT() returns
      // bigint, and node-pg hands bigint to JavaScript as a STRING to
      // avoid silent precision loss. Without the cast, quantity arrives
      // at the Python solver as "2" rather than 2, and PuLP fails with
      // "maximum recursion depth exceeded in comparison" while building
      // the constraint, which looks nothing like a type error and takes
      // down every allocation in the batch.
      `SELECT r.request_id, r.org_id, r.blood_type, r.component,
              GREATEST(r.quantity - COALESCE(a.allocated, 0), 0)::int AS quantity,
              r.quantity::int AS original_quantity,
              r.urgency_tier, r.needed_by_date
       FROM requests r
       LEFT JOIN (
         SELECT request_id, COUNT(DISTINCT unit_id) AS allocated
         FROM allocation_records GROUP BY request_id
       ) a ON a.request_id = r.request_id
       WHERE r.cancelled_at IS NULL
         AND (
           r.fulfillment_path IS NULL
           -- An elective request held for a future date comes back into
           -- the pool once that date is near, to top up its reservation
           -- and, if still short, mobilize donors.
           OR (r.fulfillment_path = 'scheduled_reservation'
               AND r.urgency_tier = 'elective'
               AND r.needed_by_date IS NOT NULL
               AND r.needed_by_date <= CURRENT_DATE + $1::int)
         )
         AND GREATEST(r.quantity - COALESCE(a.allocated, 0), 0) > 0`,
      [ELECTIVE_MOBILIZATION_WINDOW_DAYS]
    );

    if (requestsResult.rows.length === 0) {
      return { message: 'No pending requests to process.' };
    }

    // "Eligible stock" = currently available, AND held by an organization
    // that is allowed to supply blood. Convert expiry_date into
    // days_until_expiry here, since that's the shape the engine expects
    // (Postgres can subtract two dates directly and get a day count).
    //
    // THE org_type JOIN IS LOAD-BEARING. Hospitals consume blood, they do
    // not supply it: a hospital cannot fulfil another hospital's request,
    // and a hospital's own blood bank is a separately registered
    // organization with org_type 'blood_bank'. Before this filter existed
    // the engine treated hospital stock as allocatable and routinely
    // sourced from it.
    //
    // Filtering here rather than in engine.py is deliberate. The engine
    // solves whatever inventory it is handed and should stay a pure
    // optimizer; eligibility is a domain rule, so it belongs on the
    // database side of the wire where it cannot be bypassed by calling
    // the engine directly.
    const inventoryResult = await pool.query(
      `SELECT iu.unit_id, iu.org_id, iu.blood_type, iu.component,
              (iu.expiry_date - CURRENT_DATE) AS days_until_expiry
       FROM inventory_units iu
       JOIN organizations o ON o.org_id = iu.org_id
       WHERE iu.status = 'available'
         AND o.org_type = ANY($1)`,
      [SUPPLIER_ORG_TYPES]
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

    // -----------------------------------------------------------------
    // Write-back, atomically.
    //
    // The advisory lock already guarantees no other batch is running, so
    // this transaction is not about batch-vs-batch. It is about the write
    // being all-or-nothing, and about the world having moved on WHILE the
    // engine was thinking: during a 75-second cold start a bank can
    // dispatch a unit, an admin can cancel a request. So every unit is
    // re-checked under FOR UPDATE before it is reserved, and any that is
    // no longer 'available' is dropped from the assignment rather than
    // blindly overwritten.
    // -----------------------------------------------------------------
    const client = await pool.connect();
    const applied = [];
    const stale = [];
    try {
      await client.query('BEGIN');

      for (const { request_id, unit_id } of result.assignments) {
        const unit = await client.query(
          `SELECT unit_id, status FROM inventory_units WHERE unit_id = $1 FOR UPDATE`,
          [unit_id]
        );
        if (!unit.rows.length || unit.rows[0].status !== 'available') {
          // Taken, dispatched or expired while the engine was solving.
          stale.push({ request_id, unit_id, status: unit.rows[0]?.status || 'missing' });
          continue;
        }

        // ON CONFLICT is belt-and-braces now that
        // allocation_records_request_unit_unique exists: the lock should
        // already make a duplicate impossible, and if one somehow arrives
        // we want it ignored rather than aborting the whole batch.
        await client.query(
          `INSERT INTO allocation_records (request_id, unit_id) VALUES ($1, $2)
           ON CONFLICT (request_id, unit_id) DO NOTHING`,
          [request_id, unit_id]
        );
        await client.query(`UPDATE inventory_units SET status = 'reserved' WHERE unit_id = $1`, [
          unit_id,
        ]);
        applied.push({ request_id, unit_id });
      }

      // A request is only marked resolved if its allocations actually
      // landed. Counting from `applied` rather than from the engine's
      // answer is the difference between reporting what we did and
      // reporting what we intended to do.
      const appliedByRequest = new Map();
      for (const a of applied) {
        appliedByRequest.set(a.request_id, (appliedByRequest.get(a.request_id) || 0) + 1);
      }

      const resolved = [];
      const shortfallRequestIds = new Set(Object.keys(result.shortfalls));

      for (const req of requestsResult.rows) {
        const got = appliedByRequest.get(req.request_id) || 0;
        const fullyCovered = !shortfallRequestIds.has(req.request_id) && got >= req.quantity;

        if (fullyCovered) {
          await client.query(
            // 'scheduled_reservation' is allowed to advance to 'inventory'
            // here: that is an elective request whose date came near and
            // whose remaining units have now been found. Any other
            // non-null path means something else already resolved this
            // request and must not be overwritten.
            `UPDATE requests SET fulfillment_path = 'inventory'
             WHERE request_id = $1 AND cancelled_at IS NULL
               AND (fulfillment_path IS NULL OR fulfillment_path = 'scheduled_reservation')`,
            [req.request_id]
          );
          resolved.push({ request_id: req.request_id, units: got });
        }
      }

      await client.query('COMMIT');

      // Events and donor fallback are deliberately OUTSIDE the
      // transaction. Both do their own multi-statement work (fallback
      // writes mobilizations and sends notifications), and holding the
      // allocation transaction open across all of that would pin a
      // connection for no benefit -- the allocation itself is already
      // durable at this point.
      for (const { request_id, units } of resolved) {
        await logRequestEvent(
          request_id,
          'engine_resolved_inventory',
          `Matched with ${units} unit(s) from existing inventory — request resolved`,
          { units_matched: units }
        );
      }

      // Requests still short escalate to the Section 7A donor-fallback
      // flow. Elective requests take the same route, but only once their
      // needed_by_date is close; further out they are held instead.
      //
      // Elective used to be skipped here entirely, and that skip was the
      // bug. Nothing else set fulfillment_path for an elective request,
      // so it stayed NULL, stayed pending, and came back every 60 seconds
      // forever, accumulating allocations and leaving units reserved
      // against a request that could never resolve. Every path out of
      // this loop now sets fulfillment_path to something.
      const resolvedIds = new Set(resolved.map((r) => r.request_id));
      const fallbackResults = [];
      const held = [];

      for (const req of requestsResult.rows) {
        if (resolvedIds.has(req.request_id)) continue;

        if (req.urgency_tier === 'elective' && !isWithinMobilizationWindow(req.needed_by_date)) {
          // Hold it. The partial allocation stands, the units stay
          // reserved for this patient, and the request drops out of the
          // pending pool until its date comes near.
          // pool, not client: the transaction above is already committed,
          // and this belongs with the other post-commit bookkeeping.
          await pool.query(
            `UPDATE requests SET fulfillment_path = 'scheduled_reservation'
             WHERE request_id = $1 AND fulfillment_path IS NULL AND cancelled_at IS NULL`,
            [req.request_id]
          );
          const reserved = appliedByRequest.get(req.request_id) || 0;
          const stillNeeded = req.quantity - reserved;
          await logRequestEvent(
            req.request_id,
            'engine_shortfall',
            reserved > 0
              ? `Reserved ${reserved} unit(s) and holding them for the scheduled date. `
                + `${stillNeeded} still to find, and donors will be contacted closer to the date.`
              : 'Nothing available to reserve yet. Donors will be contacted closer to the scheduled date.',
            {
              shortfall: stillNeeded,
              reserved,
              needed_by_date: req.needed_by_date,
              mobilization_window_days: ELECTIVE_MOBILIZATION_WINDOW_DAYS,
            }
          );
          held.push({ request_id: req.request_id, reserved, still_needed: stillNeeded });
          continue;
        }

        await logRequestEvent(
          req.request_id,
          'engine_shortfall',
          'Inventory alone could not fully cover this request',
          { shortfall: result.shortfalls[req.request_id] ?? req.quantity - (appliedByRequest.get(req.request_id) || 0) }
        );

        const outcome = await triggerDonorFallback(req);
        fallbackResults.push(outcome);
      }

      await notifySuppliers(applied);

      return {
        processed: requestsResult.rows.length,
        assignments: applied.length,
        // Elective requests parked until their date comes near. Surfaced
        // so the admin batch result distinguishes "held on purpose" from
        // "could not be filled".
        held_for_schedule: held,
        // Surfaced rather than swallowed: a non-empty list means the
        // engine's answer was partly out of date by the time it arrived,
        // which is worth seeing in the admin batch result.
        stale_assignments: stale,
        shortfalls: result.shortfalls,
        donor_fallback_triggered: fallbackResults,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
}

module.exports = { runAllocationBatch };