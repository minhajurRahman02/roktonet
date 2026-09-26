const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { runAllocationBatch } = require('../services/engineClient');
const { logRequestEvent } = require('../services/requestEvents');
const { logAdminAction } = require('../services/adminAudit');
const { notifyOrg } = require('../services/notificationService');
const { parsePagination, queryPage } = require('../utils/pagination');

// POST /api/requests - submit a new blood request.
// Hospital submits for their own org, any urgency except restock (that's
// a blood-bank-only concept). Blood bank submits for their own org,
// restock ONLY -- a bank has no business filing a critical patient
// request. Admin can submit anything for any org.
router.post('/', requireAuth, requireRole('hospital', 'bank', 'admin'), async (req, res) => {
  const { org_id, blood_type, component, quantity, urgency_tier, needed_by_date } = req.body;

  if (!org_id || !blood_type || !component || !quantity || !urgency_tier) {
    return res.status(400).json({
      error: 'org_id, blood_type, component, quantity, and urgency_tier are required',
    });
  }

  if (req.user.role !== 'admin' && org_id !== req.user.org_id) {
    return res.status(403).json({ error: 'You may only submit requests for your own organization' });
  }

  if (req.user.role === 'hospital' && urgency_tier === 'restock') {
    return res.status(403).json({ error: "'restock' is a blood-bank-only urgency tier" });
  }
  if (req.user.role === 'bank' && urgency_tier !== 'restock') {
    return res.status(403).json({ error: "Blood banks may only submit 'restock' requests" });
  }

  const ALLOWED_URGENCY = ['critical', 'urgent', 'routine', 'elective', 'restock'];
  if (!ALLOWED_URGENCY.includes(urgency_tier)) {
    return res.status(400).json({ error: `urgency_tier must be one of: ${ALLOWED_URGENCY.join(', ')}` });
  }

  if (urgency_tier === 'elective' && !needed_by_date) {
    return res.status(400).json({ error: 'needed_by_date is required for elective requests' });
  }

  // --- Patient identification -------------------------------------------
  //
  // Required for every patient request; NOT required for restock, because a
  // blood bank restocking its own shelves has no patient. That is why the
  // condition is on the tier rather than on the caller's role -- an admin
  // filing a restock on a bank's behalf must not be asked for one either.
  //
  // These fields are DISPLAY ONLY. They exist so hospital staff can tell at
  // a glance which units are for which patient, and they never influence a
  // decision anywhere in the system. The guarantee is structural, not a
  // convention: engineClient.js selects an explicit column list that does
  // not include them, so the solver cannot read them.
  const patient_name = (req.body.patient_name || '').trim();
  const patient_phone = (req.body.patient_phone || '').trim();
  const patient_note = (req.body.patient_note || '').trim();

  if (urgency_tier !== 'restock') {
    if (!patient_name) {
      return res.status(400).json({ error: 'patient_name is required' });
    }
    if (!patient_phone) {
      return res.status(400).json({ error: 'patient_phone is required' });
    }
    // Deliberately loose. A hard format rule on Bangladeshi numbers would
    // reject ward extensions, an attendant's number, or a number typed with
    // spaces -- and the cost of blocking a critical request over phone
    // formatting is far higher than the cost of storing a messy string that
    // a human will read anyway.
    if (patient_name.length > 200 || patient_phone.length > 40 || patient_note.length > 1000) {
      return res.status(400).json({ error: 'patient_name, patient_phone or patient_note is too long' });
    }
  }

  try {
    const insertResult = await pool.query(
      `INSERT INTO requests (org_id, blood_type, component, quantity, urgency_tier, needed_by_date,
                             patient_name, patient_phone, patient_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [org_id, blood_type, component, quantity, urgency_tier, needed_by_date || null,
       patient_name || null, patient_phone || null, patient_note || null]
    );
    let request = insertResult.rows[0];

    await logRequestEvent(
      request.request_id,
      'posted',
      `Request posted for ${quantity} unit(s) of ${blood_type} ${component.replace('_', ' ')}`
    );

    if (urgency_tier === 'critical' || urgency_tier === 'urgent') {
      // Real counts, not placeholders -- exact-type-match only (the engine's
      // full cross-compatibility matrix isn't duplicated here just for a
      // log message, so this number is accurate for what it claims: exact
      // blood-type matches currently available, not the full compatible set).
      const compatResult = await pool.query(
        `SELECT COUNT(*) AS unit_count, COUNT(DISTINCT org_id) AS org_count
         FROM inventory_units WHERE blood_type = $1 AND component = $2 AND status = 'available'`,
        [blood_type, component]
      );
      const { unit_count, org_count } = compatResult.rows[0];
      await logRequestEvent(
        request.request_id,
        'engine_invoked',
        `Optimization engine evaluating ${unit_count} matching unit(s) across ${org_count} organization(s)`,
        { unit_count: Number(unit_count), org_count: Number(org_count) }
      );

      await runAllocationBatch();
      const refetch = await pool.query('SELECT * FROM requests WHERE request_id = $1', [
        request.request_id,
      ]);
      request = refetch.rows[0];
    }

    res.status(201).json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests - list + filter (Phase 7.7)
router.get('/', requireAuth, requireRole('hospital', 'bank', 'admin'), async (req, res) => {
  const { urgency_tier, fulfillment_path, district, from, to, cancelled, blood_type } = req.query;
  let { org_id } = req.query;

  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  // Both hospital and bank users are auto-scoped to their own org -- a
  // bank's restock requests live in this same table, so it needs the
  // same self-scoping hospital already has, not a separate endpoint.
  if (req.user.role === 'hospital' || req.user.role === 'bank') {
    org_id = req.user.org_id;
  }

  const conditions = [];
  const values = [];

  if (org_id) {
    values.push(org_id);
    conditions.push(`r.org_id = $${values.length}`);
  }
  if (urgency_tier) {
    values.push(urgency_tier);
    conditions.push(`r.urgency_tier = $${values.length}`);
  }
  // 7.7a: 'pending' is a real filter value now, not a client-side
  // afterthought. It means "the engine has not resolved this yet", which
  // is fulfillment_path IS NULL -- and it excludes cancelled rows, because
  // a cancelled request is not waiting for anything.
  //
  // This had to move server-side for pagination to be correct. Filtering a
  // page of 25 down to 3 in the browser and then reporting "3 of 143" is
  // not a display bug, it is the page lying about what it searched.
  if (fulfillment_path === 'pending') {
    conditions.push('r.fulfillment_path IS NULL AND r.cancelled_at IS NULL');
  } else if (fulfillment_path === 'resolved') {
    // The mirror of 'pending'. Hospital My Requests and Bank Restock both
    // offer a resolved/pending toggle and both were fetching everything
    // and filtering in the browser, which server-side paging turns into a
    // page that lies about what it searched.
    //
    // Cancelled rows are NOT excluded here, deliberately. A cancelled
    // request can still carry the fulfillment_path it had before it was
    // cancelled, and hiding it would make "resolved" and "pending" fail to
    // add up to the unfiltered total -- the sum check that caught nothing
    // last time precisely because the counts did reconcile.
    conditions.push('r.fulfillment_path IS NOT NULL');
  } else if (fulfillment_path) {
    values.push(fulfillment_path);
    conditions.push(`r.fulfillment_path = $${values.length}`);
  }
  if (blood_type) {
    values.push(blood_type);
    conditions.push(`r.blood_type = $${values.length}`);
  }
  // Admin-only cross-org filters (7.7). Harmless for scoped roles -- they
  // just narrow within their own org.
  if (district) {
    values.push(district);
    conditions.push(`o.district = $${values.length}`);
  }
  if (from) {
    values.push(from);
    conditions.push(`r.created_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`r.created_at <= ($${values.length}::date + INTERVAL '1 day')`);
  }
  // ?cancelled=true -> only cancelled; ?cancelled=false -> exclude cancelled;
  // omitted -> everything (existing behaviour, cancelled rows carry the column).
  if (cancelled === 'true') conditions.push('r.cancelled_at IS NOT NULL');
  if (cancelled === 'false') conditions.push('r.cancelled_at IS NULL');

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Joined with the org so every row carries hospital name/district and a
  // units_allocated count -- the admin system-wide table needs both, and
  // the existing role pages simply ignore the extra columns.
  //
  // COUNT(DISTINCT unit_id) rather than COUNT(*). The unique constraint from
  // migration_dedupe_allocations.sql makes those equivalent now, but this is
  // the exact column that displayed "4 / 2" for a 2-unit request, and a count
  // that cannot over-report even if a duplicate somehow lands again costs
  // nothing.
  const rowsSql = `SELECT r.*, o.name AS org_name, o.district AS org_district, o.org_type,
              COALESCE(a.units_allocated, 0)::int AS units_allocated
       FROM requests r
       JOIN organizations o ON o.org_id = r.org_id
       LEFT JOIN (SELECT request_id, COUNT(DISTINCT unit_id) AS units_allocated FROM allocation_records GROUP BY request_id) a
         ON a.request_id = r.request_id
       ${whereClause} ORDER BY r.created_at DESC`;

  try {
    if (!pagination.paginated) {
      const result = await pool.query(rowsSql, values);
      return res.json(result.rows);
    }
    // The count repeats the same FROM and WHERE minus the allocation join,
    // which cannot change the row count: it is a LEFT JOIN against a grouped
    // subquery, so at most one row per request.
    const page = await queryPage(pool, {
      countSql: `SELECT COUNT(*)::int AS total FROM requests r
                 JOIN organizations o ON o.org_id = r.org_id ${whereClause}`,
      rowsSql,
      values,
      pagination,
    });
    res.json(page);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:id - check a single request's status
router.get('/:id', requireAuth, async (req, res) => {
  try {
    // Now also joins the requesting org's name/district -- needed by the
    // request-tracking mini-map (frontend) to label the hospital node with
    // real data, without a second round-trip.
    const result = await pool.query(
      `SELECT r.*, o.name AS org_name, o.district AS org_district
       FROM requests r
       JOIN organizations o ON o.org_id = r.org_id
       WHERE r.request_id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = result.rows[0];
    const isOwner = req.user.org_id === request.org_id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this request' });
    }

    res.json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:id/allocation - which real org(s)/unit(s) fulfilled
// this request, if resolved via inventory. Ownership-checked like /:id.
// Now also returns each unit's status (reserved/dispatched/delivered) --
// added for the fulfillment/delivery workflow, so the frontend can group
// by org and show per-org delivery state without a second endpoint.
router.get('/:id/allocation', requireAuth, async (req, res) => {
  try {
    const requestResult = await pool.query('SELECT org_id FROM requests WHERE request_id = $1', [
      req.params.id,
    ]);
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = req.user.org_id === requestResult.rows[0].org_id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this request' });
    }

    const allocationResult = await pool.query(
      `SELECT ar.unit_id, iu.org_id, o.name AS org_name, o.district, iu.blood_type, iu.component, iu.status
       FROM allocation_records ar
       JOIN inventory_units iu ON iu.unit_id = ar.unit_id
       JOIN organizations o ON o.org_id = iu.org_id
       WHERE ar.request_id = $1`,
      [req.params.id]
    );
    res.json(allocationResult.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/:id/confirm-delivery - hospital confirms physical
// arrival of the units dispatched by ONE specific source org. Scoped per
// org (not the whole request at once), since a request can be fulfilled
// by multiple banks/NGOs arriving separately -- each gets its own
// confirmation. Only units already 'dispatched' for that org are moved to
// 'delivered'; anything still 'reserved' (not yet dispatched by that org)
// is left untouched.
router.post('/:id/confirm-delivery', requireAuth, requireRole('hospital', 'admin'), async (req, res) => {
  const { org_id } = req.body;
  if (!org_id) {
    return res.status(400).json({ error: 'org_id (the source org whose delivery you are confirming) is required' });
  }

  try {
    const requestResult = await pool.query('SELECT org_id, urgency_tier FROM requests WHERE request_id = $1', [
      req.params.id,
    ]);
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const request = requestResult.rows[0];

    const isOwner = req.user.org_id === request.org_id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this request' });
    }

    const updateResult = await pool.query(
      `UPDATE inventory_units iu
       SET status = 'delivered'
       FROM allocation_records ar
       WHERE ar.unit_id = iu.unit_id
         AND ar.request_id = $1
         AND iu.org_id = $2
         AND iu.status = 'dispatched'
       RETURNING iu.unit_id`,
      [req.params.id, org_id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(400).json({
        error: 'No dispatched units found for that organization on this request -- nothing to confirm',
      });
    }

    await logRequestEvent(
      req.params.id,
      'delivery_confirmed',
      `Hospital confirmed receipt of ${updateResult.rows.length} unit(s)`,
      { unit_count: updateResult.rows.length, org_id }
    );

    await notifyOrg(
      org_id,
      'delivery_confirmed',
      'The hospital has confirmed receipt of your dispatched unit(s).',
      req.params.id,
      request.urgency_tier
    );

    res.json({ request_id: req.params.id, org_id, delivered_units: updateResult.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:id/events - the real, live tracking log for a request.
// Ownership-checked the same way as GET /:id -- must confirm access to the
// parent request before exposing its event history.
router.get('/:id/events', requireAuth, async (req, res) => {
  try {
    const requestResult = await pool.query('SELECT org_id FROM requests WHERE request_id = $1', [
      req.params.id,
    ]);
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = req.user.org_id === requestResult.rows[0].org_id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this request' });
    }

    const eventsResult = await pool.query(
      'SELECT * FROM request_events WHERE request_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(eventsResult.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/:id/cancel -- admin only (Phase 7.7, spec 2.3).
// Cancels a request and releases anything still reserved for it back to
// 'available'. Units already 'dispatched'/'delivered' are left alone --
// those physically left the building. The engine's pending query excludes
// cancelled rows (engineClient.js), so a cancelled request is never solved.
router.post('/:id/cancel', requireAuth, requireRole('admin'), async (req, res) => {
  const reason = (req.body?.reason || '').trim() || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT request_id, org_id, urgency_tier, fulfillment_path, cancelled_at FROM requests WHERE request_id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }
    const request = existing.rows[0];
    if (request.cancelled_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Request is already cancelled' });
    }

    // 7.7a: a request whose blood has physically moved cannot be cancelled.
    //
    // There was no check here at all. An admin could cancel a request that
    // a bank had already dispatched and a hospital had already received:
    // cancelled_at was set, the hospital was notified their request was
    // cancelled, and the row disappeared from the default "Hide cancelled"
    // view, while the units sat in their fridge. The state machine had no
    // terminal state.
    //
    // Blocked outright rather than allowed-with-a-warning. Cancelling is
    // meant to mean "this need went away before we acted on it". Once blood
    // has moved, the thing that needs recording is a return, which is a
    // different action with different inventory consequences, and pretending
    // it is a cancellation would put the database in a state that does not
    // describe anything that really happened.
    const moved = await client.query(
      `SELECT iu.unit_id, iu.status
       FROM allocation_records ar
       JOIN inventory_units iu ON iu.unit_id = ar.unit_id
       WHERE ar.request_id = $1 AND iu.status IN ('dispatched', 'delivered')`,
      [request.request_id]
    );
    if (moved.rows.length > 0) {
      await client.query('ROLLBACK');
      const counts = moved.rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
      const detail = Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(' and ');
      return res.status(409).json({
        error: `This request cannot be cancelled: ${detail} unit(s) have already left the source organization. `
          + `Cancelling would not bring them back. Record what physically happened to those units instead.`,
        units_already_moved: moved.rows,
      });
    }

    const released = await client.query(
      `UPDATE inventory_units SET status = 'available'
       WHERE status = 'reserved'
         AND unit_id IN (SELECT unit_id FROM allocation_records WHERE request_id = $1)
       RETURNING unit_id`,
      [request.request_id]
    );
    await client.query(
      'UPDATE requests SET cancelled_at = NOW(), cancelled_by = $1 WHERE request_id = $2',
      [req.user.user_id, request.request_id]
    );
    await client.query('COMMIT');

    await logRequestEvent(
      request.request_id,
      'request_cancelled',
      `Request cancelled by an administrator${released.rows.length ? ` — ${released.rows.length} reserved unit(s) released back to inventory` : ''}`,
      { released_units: released.rows.length, reason }
    );
    await logAdminAction(req.user.user_id, 'request_cancelled', {
      targetType: 'request', targetId: request.request_id,
      details: { reason, released_units: released.rows.length, urgency_tier: request.urgency_tier, previous_path: request.fulfillment_path },
    });
    // urgency_tier passed so this follows the same channel rule as every
    // other notification. It was omitted before, which meant cancelling a
    // critical request, the one case where the hospital most needs to
    // know immediately, sent in-app only and never emailed.
    await notifyOrg(
      request.org_id,
      'request_cancelled',
      'One of your requests was cancelled by an administrator.',
      request.request_id,
      request.urgency_tier
    );

    res.json({ request_id: request.request_id, cancelled: true, released_units: released.rows.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
