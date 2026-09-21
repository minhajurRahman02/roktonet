const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAdminAction } = require('../services/adminAudit');
const { notifyOrg } = require('../services/notificationService');
const { logRequestEvent } = require('../services/requestEvents');
const { parsePagination, queryPage } = require('../utils/pagination');

// GET /api/inventory - list inventory, filterable by blood_type, component.
// Auto-scoped to the caller's own org for bank/ngo, same pattern as
// GET /api/requests for hospital -- previously had no auth at all, which
// meant any org's org_id could be passed in the query string to see
// another bank's full stock. Admin can pass org_id explicitly to view any
// org's inventory.
//
// Donor is a genuinely different case, fixed here: donors aren't scoped
// by org at all (their own org_id can be null for unaffiliated donors),
// they're scoped by donor_id -- which of these unit rows they personally
// gave. The previous org-based logic would have silently applied NO
// filter at all for a donor with a null org_id, returning every unit in
// the entire system to their Donation History page.
router.get('/', requireAuth, async (req, res) => {
  const { blood_type, component } = req.query;
  let { org_id } = req.query;

  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  if (req.user.role === 'donor') {
    const donorResult = await pool.query('SELECT donor_id FROM donors WHERE user_id = $1', [
      req.user.user_id,
    ]);
    if (donorResult.rows.length === 0) {
      return res.status(400).json({ error: 'No donor record linked to this account' });
    }

    const conditions = ['donor_id = $1'];
    const values = [donorResult.rows[0].donor_id];
    if (blood_type) {
      values.push(blood_type);
      conditions.push(`blood_type = $${values.length}`);
    }
    if (component) {
      values.push(component);
      conditions.push(`component = $${values.length}`);
    }

    const donorRowsSql = `SELECT * FROM inventory_units WHERE ${conditions.join(' AND ')} ORDER BY collection_date DESC`;
    try {
      if (!pagination.paginated) {
        const result = await pool.query(donorRowsSql, values);
        return res.json(result.rows);
      }
      return res.json(await queryPage(pool, {
        countSql: `SELECT COUNT(*)::int AS total FROM inventory_units WHERE ${conditions.join(' AND ')}`,
        rowsSql: donorRowsSql,
        values,
        pagination,
      }));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.user.role !== 'admin') {
    org_id = req.user.org_id;
  }

  const { status, expiring_within_days, district } = req.query;
  const conditions = [];
  const values = [];

  if (org_id) {
    values.push(org_id);
    conditions.push(`iu.org_id = $${values.length}`);
  }
  if (blood_type) {
    values.push(blood_type);
    conditions.push(`iu.blood_type = $${values.length}`);
  }
  if (component) {
    values.push(component);
    conditions.push(`iu.component = $${values.length}`);
  }
  // Admin-scale filters (7.7). Scoped roles can use them too -- they just
  // narrow within their own org.
  if (status) {
    values.push(status);
    conditions.push(`iu.status = $${values.length}`);
  }
  if (district) {
    values.push(district);
    conditions.push(`o.district = $${values.length}`);
  }
  if (expiring_within_days !== undefined && expiring_within_days !== '') {
    const days = parseInt(expiring_within_days, 10);
    if (Number.isNaN(days) || days < 0) {
      return res.status(400).json({ error: 'expiring_within_days must be a non-negative integer' });
    }
    values.push(days);
    conditions.push(`iu.status = 'available' AND iu.expiry_date <= CURRENT_DATE + ($${values.length} || ' days')::interval`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Joined with the source org so admin's system-wide table can show
  // where every unit lives; role pages ignore the extra columns.
  const rowsSql = `SELECT iu.*, o.name AS org_name, o.org_type, o.district AS org_district,
              (iu.expiry_date - CURRENT_DATE)::int AS days_to_expiry
       FROM inventory_units iu
       JOIN organizations o ON o.org_id = iu.org_id
       ${whereClause} ORDER BY iu.expiry_date`;

  try {
    if (!pagination.paginated) {
      const result = await pool.query(rowsSql, values);
      return res.json(result.rows);
    }
    // The org JOIN stays in the count. It is an inner join, so it CAN drop
    // rows (a unit whose org row is gone), and counting without it would
    // report a total the page query can never reach.
    res.json(await queryPage(pool, {
      countSql: `SELECT COUNT(*)::int AS total FROM inventory_units iu
                 JOIN organizations o ON o.org_id = iu.org_id ${whereClause}`,
      rowsSql,
      values,
      pagination,
    }));
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

// PATCH /api/inventory/:unit_id -- admin only (Phase 7.7, spec 4.3).
// Editable: expiry_date; status (forward-only past dispatch); blood_type
// and component ONLY while the unit is still 'available' -- once allocated,
// its type was a solver input, and changing it would silently invalidate
// the allocation that depends on it.
const STATUS_ORDER = ['available', 'reserved', 'dispatched', 'delivered', 'expired'];
const TERMINAL_STATUSES = ['dispatched', 'delivered'];
const VALID_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_COMPONENTS = ['whole_blood', 'platelets', 'plasma'];

router.patch('/:unit_id', requireAuth, requireRole('admin'), async (req, res) => {
  const { expiry_date, status, blood_type, component } = req.body;
  try {
    const existing = await pool.query(
      'SELECT unit_id, org_id, blood_type, component, status, expiry_date FROM inventory_units WHERE unit_id = $1',
      [req.params.unit_id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Inventory unit not found' });
    const unit = existing.rows[0];

    const sets = [];
    const values = [];
    const changes = {};

    if (status !== undefined) {
      if (!STATUS_ORDER.includes(status)) {
        return res.status(400).json({ error: `status must be one of ${STATUS_ORDER.join(', ')}` });
      }
      if (TERMINAL_STATUSES.includes(unit.status) && STATUS_ORDER.indexOf(status) < STATUS_ORDER.indexOf(unit.status)) {
        return res.status(400).json({ error: `A ${unit.status} unit cannot be moved back to ${status}` });
      }
      values.push(status); sets.push(`status = $${values.length}`); changes.status = { from: unit.status, to: status };
    }
    if (expiry_date !== undefined) {
      if (Number.isNaN(new Date(expiry_date).getTime())) return res.status(400).json({ error: 'expiry_date must be a valid date' });
      values.push(expiry_date); sets.push(`expiry_date = $${values.length}`); changes.expiry_date = { from: unit.expiry_date, to: expiry_date };
    }
    if (blood_type !== undefined || component !== undefined) {
      if (unit.status !== 'available') {
        return res.status(400).json({ error: `blood_type/component can only be changed while the unit is 'available' (currently '${unit.status}')` });
      }
      if (blood_type !== undefined) {
        if (!VALID_BLOOD_TYPES.includes(blood_type)) return res.status(400).json({ error: `blood_type must be one of ${VALID_BLOOD_TYPES.join(', ')}` });
        values.push(blood_type); sets.push(`blood_type = $${values.length}`); changes.blood_type = { from: unit.blood_type, to: blood_type };
      }
      if (component !== undefined) {
        if (!VALID_COMPONENTS.includes(component)) return res.status(400).json({ error: `component must be one of ${VALID_COMPONENTS.join(', ')}` });
        values.push(component); sets.push(`component = $${values.length}`); changes.component = { from: unit.component, to: component };
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(unit.unit_id);
    const result = await pool.query(
      `UPDATE inventory_units SET ${sets.join(', ')} WHERE unit_id = $${values.length} RETURNING *`,
      values
    );
    await logAdminAction(req.user.user_id, 'inventory_updated', {
      targetType: 'inventory_unit', targetId: unit.unit_id, details: { org_id: unit.org_id, changes },
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
