const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getEligibility } = require('../services/eligibility');

// Same shelf-life reference ranges already used by Blood Bank's Add
// Inventory Unit -- reused here rather than reinvented, so a unit logged
// during a drive gets the same expiry treatment as one logged manually.
const SHELF_LIFE_DAYS = { whole_blood: 35, platelets: 5, plasma: 365 };

function addDays(dateString, days) {
  const d = new Date(dateString);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getOwnedDrive(driveId, user) {
  const result = await pool.query('SELECT * FROM donor_drives WHERE drive_id = $1', [driveId]);
  if (result.rows.length === 0) return { error: 404, message: 'Drive not found' };
  const drive = result.rows[0];
  if (user.role !== 'admin' && drive.org_id !== user.org_id) {
    return { error: 403, message: 'You do not have access to this drive' };
  }
  return { drive };
}

// POST /api/drives - create a new drive, status 'planned'
router.post('/', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const { org_id, title, location, drive_date, target_units } = req.body;

  if (!org_id || !title || !location || !drive_date) {
    return res.status(400).json({ error: 'org_id, title, location, and drive_date are required' });
  }
  if (req.user.role !== 'admin' && org_id !== req.user.org_id) {
    return res.status(403).json({ error: 'You may only create drives for your own organization' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO donor_drives (org_id, title, location, drive_date, target_units)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [org_id, title, location, drive_date, target_units || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drives - list, auto-scoped to the caller's own org
router.get('/', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  let orgId = req.user.org_id;
  if (req.user.role === 'admin' && req.query.org_id) orgId = req.query.org_id;

  try {
    const result = await pool.query(
      'SELECT * FROM donor_drives WHERE org_id = $1 ORDER BY created_at DESC',
      [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drives/:id
router.get('/:id', requireAuth, async (req, res) => {
  const owned = await getOwnedDrive(req.params.id, req.user);
  if (owned.error) return res.status(owned.error).json({ error: owned.message });
  res.json(owned.drive);
});

// POST /api/drives/:id/start - planned -> active
router.post('/:id/start', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const owned = await getOwnedDrive(req.params.id, req.user);
  if (owned.error) return res.status(owned.error).json({ error: owned.message });

  if (owned.drive.status !== 'planned') {
    return res.status(400).json({ error: `Drive must be 'planned' to start (currently '${owned.drive.status}')` });
  }

  try {
    const result = await pool.query(
      `UPDATE donor_drives SET status = 'active', started_at = now() WHERE drive_id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drives/:id/finish - active -> completed
router.post('/:id/finish', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const owned = await getOwnedDrive(req.params.id, req.user);
  if (owned.error) return res.status(owned.error).json({ error: owned.message });

  if (owned.drive.status !== 'active') {
    return res.status(400).json({ error: `Drive must be 'active' to finish (currently '${owned.drive.status}')` });
  }

  try {
    const result = await pool.query(
      `UPDATE donor_drives SET status = 'completed', completed_at = now() WHERE drive_id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drives/:id/log-unit - the core live-session action. Creates
// `quantity` real inventory_unit rows (one donation can yield more than
// one unit, e.g. a platelet apheresis session) and updates the donor's
// last_donation_date. Only allowed while the drive is 'active' -- a
// planned or completed drive can't have units logged against it.
router.post('/:id/log-unit', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const { donor_id, blood_type, component, quantity } = req.body;
  const unitCount = Number(quantity) || 1;

  if (!donor_id || !blood_type || !component) {
    return res.status(400).json({ error: 'donor_id, blood_type, and component are required' });
  }

  const owned = await getOwnedDrive(req.params.id, req.user);
  if (owned.error) return res.status(owned.error).json({ error: owned.message });

  if (owned.drive.status !== 'active') {
    return res.status(400).json({ error: `Drive must be 'active' to log units (currently '${owned.drive.status}')` });
  }

  const donorResult = await pool.query('SELECT * FROM donors WHERE donor_id = $1', [donor_id]);
  if (donorResult.rows.length === 0) {
    return res.status(404).json({ error: 'Donor not found' });
  }
  const donor = donorResult.rows[0];
  if (donor.org_id && donor.org_id !== owned.drive.org_id) {
    return res.status(403).json({ error: 'This donor belongs to a different organization' });
  }

  // The actual enforcement was previously missing entirely -- this
  // endpoint checked the drive was active and the donor existed, but
  // nothing stopped logging another donation five minutes after the
  // last one. Same cooldown rule donorFallback.js uses to decide who to
  // invite, now also gating who can actually be logged.
  const eligibility = getEligibility(donor.last_donation_date, component);
  if (!eligibility.eligible) {
    return res.status(400).json({
      error: `This donor isn't eligible to donate ${component.replace('_', ' ')} again until ${eligibility.eligibleDate.toISOString().slice(0, 10)}`,
      eligible_date: eligibility.eligibleDate,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const shelfLife = SHELF_LIFE_DAYS[component] || SHELF_LIFE_DAYS.whole_blood;
  const expiryDate = addDays(today, shelfLife);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const createdUnits = [];
    for (let i = 0; i < unitCount; i++) {
      const unitResult = await client.query(
        `INSERT INTO inventory_units (org_id, donor_id, blood_type, component, collection_date, expiry_date, drive_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'available')
         RETURNING *`,
        [owned.drive.org_id, donor_id, blood_type, component, today, expiryDate, req.params.id]
      );
      createdUnits.push(unitResult.rows[0]);
    }

    await client.query('UPDATE donors SET last_donation_date = $1 WHERE donor_id = $2', [today, donor_id]);

    await client.query('COMMIT');
    res.status(201).json({ units: createdUnits, donor_id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/drives/:id/log - every unit logged against this drive, joined
// to donor names, ordered chronologically. Powers the Drive Log page --
// previously there was no way to see logged units with a timestamp or
// donor identity together in one place.
router.get('/:id/log', requireAuth, async (req, res) => {
  const owned = await getOwnedDrive(req.params.id, req.user);
  if (owned.error) return res.status(owned.error).json({ error: owned.message });

  try {
    const result = await pool.query(
      `SELECT iu.unit_id, iu.blood_type, iu.component, iu.status, iu.created_at,
              d.donor_id, d.full_name AS donor_name
       FROM inventory_units iu
       JOIN donors d ON d.donor_id = iu.donor_id
       WHERE iu.drive_id = $1
       ORDER BY iu.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;