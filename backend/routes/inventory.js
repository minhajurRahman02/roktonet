const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyOrg } = require('../services/notificationService');
const { logRequestEvent } = require('../services/requestEvents');

// GET /api/inventory - list inventory, filterable by org, blood_type, component
// Example: /api/inventory?org_id=xxx&component=whole_blood
router.get('/', async (req, res) => {
  const { org_id, blood_type, component } = req.query;

  // Build the WHERE clause dynamically based on which filters were passed.
  // $1, $2, $3 are placeholders -- pg fills these in safely, which prevents
  // SQL injection (never build a query by directly pasting user input into it).
  const conditions = [];
  const values = [];

  if (org_id) {
    values.push(org_id);
    conditions.push(`org_id = $${values.length}`);
  }
  if (blood_type) {
    values.push(blood_type);
    conditions.push(`blood_type = $${values.length}`);
  }
  if (component) {
    values.push(component);
    conditions.push(`component = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT * FROM inventory_units ${whereClause} ORDER BY expiry_date`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory - log a new inventory unit.
// Role-gated to bank/ngo (fixed this session) -- enforces the rule that
// hospitals never hold inventory in practice (see project_memory.md
// Section 6), which previously wasn't enforced anywhere in code. A bank/
// ngo user can only log units under their own org, same ownership pattern
// already used on POST /api/requests for hospitals.
router.post('/', requireAuth, requireRole('bank', 'ngo', 'admin'), async (req, res) => {
  const { org_id, donor_id, blood_type, component, collection_date, expiry_date } = req.body;

  if (!org_id || !blood_type || !component || !collection_date || !expiry_date) {
    return res.status(400).json({
      error: 'org_id, blood_type, component, collection_date, and expiry_date are required',
    });
  }

  if (req.user.role !== 'admin' && req.user.org_id !== org_id) {
    return res.status(403).json({ error: 'You can only log inventory for your own organization' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO inventory_units (org_id, donor_id, blood_type, component, collection_date, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [org_id, donor_id || null, blood_type, component, collection_date, expiry_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/:unit_id/dispatch - source org confirms physical
// dispatch of a unit already allocated to a request (reserved -> dispatched).
// Part of the fulfillment/delivery workflow decided this session. Notifies
// the requesting hospital; "confirming" and "dispatching" were confirmed
// to be the same action, so there's no separate acknowledgement step.
router.post('/:unit_id/dispatch', requireAuth, requireRole('bank', 'ngo', 'admin'), async (req, res) => {
  try {
    const unitResult = await pool.query(
      'SELECT unit_id, org_id, status FROM inventory_units WHERE unit_id = $1',
      [req.params.unit_id]
    );
    if (unitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory unit not found' });
    }
    const unit = unitResult.rows[0];

    if (req.user.role !== 'admin' && req.user.org_id !== unit.org_id) {
      return res.status(403).json({ error: 'You do not own this inventory unit' });
    }
    if (unit.status !== 'reserved') {
      return res.status(400).json({
        error: `Unit must be 'reserved' to dispatch (currently '${unit.status}')`,
      });
    }

    await pool.query(`UPDATE inventory_units SET status = 'dispatched' WHERE unit_id = $1`, [
      unit.unit_id,
    ]);

    // Find which request(s) this unit fulfills, to notify the right
    // hospital and log the event on the right request. A unit is
    // allocated to at most one request in practice (allocation_records
    // ties a unit to the request it was assigned to).
    const allocationResult = await pool.query(
      `SELECT ar.request_id, r.org_id AS hospital_org_id, r.urgency_tier
       FROM allocation_records ar
       JOIN requests r ON r.request_id = ar.request_id
       WHERE ar.unit_id = $1`,
      [unit.unit_id]
    );

    for (const allocation of allocationResult.rows) {
      await logRequestEvent(
        allocation.request_id,
        'dispatch_needed', // reusing the planned event_type name from the notifications design
        'A unit has been dispatched and is on its way'
      );
      await notifyOrg(
        allocation.hospital_org_id,
        'dispatch_needed',
        'A blood unit for your request has been dispatched.',
        allocation.request_id,
        allocation.urgency_tier
      );
    }

    res.json({ unit_id: unit.unit_id, status: 'dispatched' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;