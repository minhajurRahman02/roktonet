const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { runAllocationBatch } = require('../services/engineClient');
const { logRequestEvent } = require('../services/requestEvents');
const { notifyOrg } = require('../services/notificationService');

// POST /api/requests - submit a new blood request
// Role-gated (Phase 7.7 -- closes a real security gap flagged during
// dashboard planning: this endpoint previously had NO role restriction at
// all). Hospital submits for their own org only; Admin can submit for any
// org. Blood bank/NGO/donor rejected here for now -- blood bank's
// "restock" submission is Phase 7.8 work, not yet wired up.
router.post('/', requireAuth, requireRole('hospital', 'admin'), async (req, res) => {
  const { org_id, blood_type, component, quantity, urgency_tier, needed_by_date } = req.body;

  if (!org_id || !blood_type || !component || !quantity || !urgency_tier) {
    return res.status(400).json({
      error: 'org_id, blood_type, component, quantity, and urgency_tier are required',
    });
  }

  if (req.user.role === 'hospital' && org_id !== req.user.org_id) {
    return res.status(403).json({ error: 'Hospitals may only submit requests for their own organization' });
  }

  const ALLOWED_URGENCY = ['critical', 'urgent', 'routine', 'elective'];
  if (!ALLOWED_URGENCY.includes(urgency_tier)) {
    return res.status(400).json({ error: `urgency_tier must be one of: ${ALLOWED_URGENCY.join(', ')}` });
  }

  if (urgency_tier === 'elective' && !needed_by_date) {
    return res.status(400).json({ error: 'needed_by_date is required for elective requests' });
  }

  try {
    const insertResult = await pool.query(
      `INSERT INTO requests (org_id, blood_type, component, quantity, urgency_tier, needed_by_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [org_id, blood_type, component, quantity, urgency_tier, needed_by_date || null]
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
router.get('/', requireAuth, requireRole('hospital', 'admin'), async (req, res) => {
  const { urgency_tier, fulfillment_path } = req.query;
  let { org_id } = req.query;

  if (req.user.role === 'hospital') {
    org_id = req.user.org_id;
  }

  const conditions = [];
  const values = [];

  if (org_id) {
    values.push(org_id);
    conditions.push(`org_id = $${values.length}`);
  }
  if (urgency_tier) {
    values.push(urgency_tier);
    conditions.push(`urgency_tier = $${values.length}`);
  }
  if (fulfillment_path) {
    values.push(fulfillment_path);
    conditions.push(`fulfillment_path = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT * FROM requests ${whereClause} ORDER BY created_at DESC`,
      values
    );
    res.json(result.rows);
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

module.exports = router;