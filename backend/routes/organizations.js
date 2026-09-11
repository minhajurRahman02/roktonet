const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { resolveThana } = require('../services/locationResolver');

// Never selected in any query below -- invite_code should never come back
// from a GET at all. It's typed in once, by whoever was told it offline,
// at registration time; an org's own staff don't need it echoed back to
// them, and no one else should ever see it.
const SAFE_COLUMNS = 'org_id, name, org_type, district, thana, contact_phone, contact_email';

// GET /api/organizations - list, optionally filtered. Previously had NO
// auth at all and did SELECT * -- meaning invite_code (needed to
// register as staff for ANY org) was fully public. Fixed: auth required,
// explicit column list, invite_code never selected.
// ?org_type=ngo&search=name powers the donor-facing NGO browse page.
router.get('/', requireAuth, async (req, res) => {
  const { org_type, search } = req.query;
  const conditions = [];
  const values = [];

  if (org_type) {
    values.push(org_type);
    conditions.push(`org_type = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`name ILIKE $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT ${SAFE_COLUMNS} FROM organizations ${whereClause} ORDER BY name`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/organizations/:id - single org detail, e.g. for the donor-
// facing NGO Detail page.
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${SAFE_COLUMNS} FROM organizations WHERE org_id = $1`, [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/organizations - create a new organization. Previously had no
// auth at all either; tightened to admin-only while this file was
// already being fixed for the leak above. Full org-creation UI (setting
// thana/invite_code at creation) remains a separate, already-disclosed
// gap -- not rebuilt here, just no longer wide open to anyone.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, org_type, district } = req.body;

  if (!name || !org_type || !district) {
    return res.status(400).json({ error: 'name, org_type, and district are all required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO organizations (name, org_type, district)
       VALUES ($1, $2, $3)
       RETURNING ${SAFE_COLUMNS}`,
      [name, org_type, district]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/organizations/:id - edit contact info. Any authenticated
// staff member of that org, or admin -- this project has no concept of
// "org admin vs staff" distinction, so any member can update it.
router.patch('/:id', requireAuth, async (req, res) => {
  const { contact_phone, contact_email, district, thana } = req.body;

  try {
    const existing = await pool.query('SELECT org_id FROM organizations WHERE org_id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    if (req.user.role !== 'admin' && req.user.org_id !== req.params.id) {
      return res.status(403).json({ error: 'You do not have access to this organization' });
    }

    let result;
    if (district !== undefined) {
      // district is NOT NULL at the schema level -- an update that
      // touches location at all must include a real district; thana
      // stays optional (many areas are outside the metro-police thana
      // coverage added during the location-precision work, see
      // locationResolver.js).
      if (!district) {
        return res.status(400).json({ error: 'district is required' });
      }
      const resolved = thana ? await resolveThana(thana, district) : null;
      result = await pool.query(
        `UPDATE organizations SET
           contact_phone = COALESCE($1, contact_phone),
           contact_email = COALESCE($2, contact_email),
           district = $3,
           thana = $4,
           thana_id = $5
         WHERE org_id = $6
         RETURNING ${SAFE_COLUMNS}`,
        [contact_phone, contact_email, district, thana || null, resolved ? resolved.thana_id : null, req.params.id]
      );
    } else {
      result = await pool.query(
        `UPDATE organizations SET
           contact_phone = COALESCE($1, contact_phone),
           contact_email = COALESCE($2, contact_email)
         WHERE org_id = $3
         RETURNING ${SAFE_COLUMNS}`,
        [contact_phone, contact_email, req.params.id]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/organizations/:id/stats - aggregate totals for the NGO Detail
// page's chart (drive count, lifetime units, blood-type breakdown).
// Organizational aggregates only -- no individual donor identity in this
// response, safe for any authenticated caller including a browsing donor.
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const drivesResult = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'completed') AS total_drives
       FROM donor_drives WHERE org_id = $1`,
      [req.params.id]
    );
    const unitsResult = await pool.query(
      `SELECT blood_type, COUNT(*) AS count
       FROM inventory_units WHERE org_id = $1
       GROUP BY blood_type`,
      [req.params.id]
    );

    const unitsByBloodType = Object.fromEntries(unitsResult.rows.map((r) => [r.blood_type, Number(r.count)]));
    const totalUnits = unitsResult.rows.reduce((sum, r) => sum + Number(r.count), 0);

    res.json({
      total_drives: Number(drivesResult.rows[0].total_drives),
      total_units: totalUnits,
      units_by_blood_type: unitsByBloodType,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;