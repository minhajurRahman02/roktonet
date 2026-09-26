const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getEligibility, isUnderAnnualCap } = require('../services/eligibility');
const { parsePagination, queryPage } = require('../utils/pagination');
const { FORMATS, cell, sendDatasets } = require('../services/reportWriters');

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
  // Donors can view any drive read-only (Browse Drives -> Drive Info) --
  // safe to allow here since the write-action routes that also use this
  // helper (start/finish/log-unit) already reject a donor caller via
  // requireRole before ever reaching this check.
  if (user.role !== 'admin' && user.role !== 'donor' && drive.org_id !== user.org_id) {
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
// GET /api/drives - two modes. For ngo/admin: the caller's own drives
// (unchanged). For donor: browse ALL drives across every NGO, optionally
// filtered by org_id/district/status -- powers Browse Drives. Joined to
// organization name/district so the frontend doesn't need a second call
// per card.
router.get('/', requireAuth, async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  if (req.user.role === 'donor') {
    const { org_id, district, status } = req.query;
    const conditions = [];
    const values = [];

    if (org_id) {
      values.push(org_id);
      conditions.push(`dd.org_id = $${values.length}`);
    }
    if (district) {
      values.push(district);
      conditions.push(`o.district = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`dd.status = $${values.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const driveRowsSql = `SELECT dd.*, o.name AS org_name, o.district AS org_district,
                o.contact_phone AS org_contact_phone, o.contact_email AS org_contact_email
         FROM donor_drives dd
         JOIN organizations o ON o.org_id = dd.org_id
         ${whereClause}
         ORDER BY dd.created_at DESC`;
    try {
      if (!pagination.paginated) {
        const result = await pool.query(driveRowsSql, values);
        return res.json(result.rows);
      }
      return res.json(await queryPage(pool, {
        countSql: `SELECT COUNT(*)::int AS total FROM donor_drives dd
                   JOIN organizations o ON o.org_id = dd.org_id ${whereClause}`,
        rowsSql: driveRowsSql,
        values,
        pagination,
      }));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (!['ngo', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'This action requires one of these roles: ngo, admin, donor' });
  }

  let orgId = req.user.org_id;
  if (req.user.role === 'admin' && req.query.org_id) orgId = req.query.org_id;

  try {
    if (!pagination.paginated) {
      const result = await pool.query(
        'SELECT * FROM donor_drives WHERE org_id = $1 ORDER BY created_at DESC',
        [orgId]
      );
      return res.json(result.rows);
    }
    res.json(await queryPage(pool, {
      countSql: 'SELECT COUNT(*)::int AS total FROM donor_drives WHERE org_id = $1',
      rowsSql: 'SELECT * FROM donor_drives WHERE org_id = $1 ORDER BY created_at DESC',
      values: [orgId],
      pagination,
    }));
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

// DELETE /api/drives/:id - remove a drive that has not happened.
//
// Only a 'planned' drive can be deleted, and only if nothing has been
// logged against it. Those two rules are not the same check and both are
// needed:
//
//   * status guards intent. An active or completed drive is a record of
//     something that took place. Deleting it would erase the provenance
//     of every unit collected there, since inventory_units.drive_id is
//     how a unit is traced back to the session that produced it.
//
//   * the unit count guards reality. A drive that was started, had units
//     logged, and was then somehow returned to 'planned' would pass the
//     status check while still owning real blood.
//
// Cancelling and deleting are deliberately kept apart. 'cancelled' says
// a drive was called off, which is worth keeping; deletion is for a
// drive created by mistake, or one whose plans changed before anyone
// relied on it. The error below points at cancelling, because for a
// drive that already ran that is the answer the NGO actually wants.
router.delete('/:id', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const owned = await getOwnedDrive(req.params.id, req.user);
  if (owned.error) return res.status(owned.error).json({ error: owned.message });

  if (owned.drive.status !== 'planned') {
    return res.status(400).json({
      error:
        `Only an upcoming drive can be deleted, and this one is '${owned.drive.status}'. `
        + 'Cancel it instead, which keeps the record and everything logged against it.',
    });
  }

  try {
    const units = await pool.query(
      'SELECT COUNT(*)::int AS n FROM inventory_units WHERE drive_id = $1',
      [req.params.id]
    );
    if (units.rows[0].n > 0) {
      return res.status(400).json({
        error:
          `This drive has ${units.rows[0].n} unit(s) logged against it, so deleting it would `
          + 'erase where that blood came from. Cancel it instead.',
      });
    }

    const result = await pool.query(
      // The status is re-checked in the DELETE itself rather than
      // trusted from the read above. Between the two, somebody could
      // have pressed Start.
      `DELETE FROM donor_drives WHERE drive_id = $1 AND status = 'planned'
       RETURNING drive_id, title`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({
        error: 'That drive changed while you were looking at it. Reload and try again.',
      });
    }
    res.json({ deleted: true, drive_id: result.rows[0].drive_id, title: result.rows[0].title });
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
  // Previously blocked any donor whose org_id didn't match this drive's
  // NGO -- meaning an already-affiliated donor couldn't attend a
  // DIFFERENT NGO's drive at all. Removed: any donor can be logged at
  // any drive, matching the real vision (browse and attend regardless of
  // affiliation). Auto-enrollment (below, after the transaction) only
  // ever fills in an org_id that was null to begin with -- an
  // already-affiliated donor donating as a "guest" elsewhere is never
  // silently reassigned away from their existing NGO.

  // Cooldown check (crossover-matrix-based, sex-differentiated for
  // whole blood). Was previously missing entirely -- this endpoint
  // checked the drive was active and the donor existed, but nothing
  // stopped logging another donation five minutes after the last one.
  const eligibility = getEligibility(donor, component);
  if (!eligibility.eligible) {
    return res.status(400).json({
      error: `This donor isn't eligible to donate ${component.replace('_', ' ')} again until ${eligibility.eligibleDate.toISOString().slice(0, 10)}`,
      eligible_date: eligibility.eligibleDate,
    });
  }

  // Annual cap check -- a real, separate dimension from the cooldown
  // above (someone could clear every cooldown window and still exceed
  // e.g. 3 whole-blood donations in a rolling year). Rolling 365-day
  // window, not calendar year, for consistency with the cooldown model.
  const annualCountResult = await pool.query(
    `SELECT COUNT(*) FROM inventory_units
     WHERE donor_id = $1 AND component = $2 AND created_at >= NOW() - INTERVAL '365 days'`,
    [donor_id, component]
  );
  const donationsInPastYear = Number(annualCountResult.rows[0].count);
  if (!isUnderAnnualCap(donationsInPastYear, component, donor.sex)) {
    return res.status(400).json({
      error: `This donor has already reached the annual limit for ${component.replace('_', ' ')} donations.`,
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

    await client.query(
      'UPDATE donors SET last_donation_date = $1, last_donation_component = $2 WHERE donor_id = $3',
      [today, component, donor_id]
    );

    // Auto-enrollment: a donor who had no NGO at all gets folded into
    // this one's roster as a natural byproduct of actually showing up --
    // matches how it'd work in person. COALESCE means this only ever
    // fills in a null; an already-affiliated donor's existing org_id is
    // never touched, even though they were just allowed to donate here
    // as a guest.
    await client.query(
      'UPDATE donors SET org_id = COALESCE(org_id, $1) WHERE donor_id = $2',
      [owned.drive.org_id, donor_id]
    );

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
              d.donor_id, d.full_name AS donor_name, d.sex AS donor_sex
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

// ---------------------------------------------------------------------
// Drive downloads: the summary report and the raw log.
//
// Two endpoints rather than one, because they answer different
// questions and the NGO page has a button for each.
//
//   /report  what happened at this drive, summarised. Four small tables:
//            the drive itself, totals by blood type, totals by
//            component, and collection by hour. This is the one you
//            hand to a supervisor.
//
//   /logs    one row per unit, with the donor. This is the one you open
//            in Excel when you need to check a specific donation.
//
// Both accept ?format=csv|xlsx|pdf. The formatting is the same code the
// admin Reports page uses, so a drive report and a system report look
// like they came from the same system, because they did.
//
// Note what is NOT here: no donor phone numbers or emails. A drive
// report circulates, and the donor's identity beyond a name is not
// something a summary needs to carry.
// ---------------------------------------------------------------------

/**
 * Formats a Postgres DATE as YYYY-MM-DD without moving it a day.
 *
 * node-pg turns a DATE into a JS Date at LOCAL midnight, so on a server
 * east of UTC, toISOString() rewinds past midnight and reports the day
 * before: a drive on 2026-12-05 printed as 2026-12-04 on a server set
 * to Asia/Dhaka. Reading the local components instead gives back the
 * calendar date that was actually stored, which is the only thing a
 * DATE ever meant.
 */
function isoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function driveFileStem(drive, kind) {
  const slug = String(drive.title || 'drive')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'drive';
  const date = isoDate(drive.drive_date);
  return `roktonet_${kind}_${slug}_${date}`;
}

function readFormat(req, res) {
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!FORMATS.includes(format)) {
    res.status(400).json({ error: `format must be one of ${FORMATS.join(', ')}` });
    return null;
  }
  return format;
}

// GET /api/drives/:id/report?format=csv|xlsx|pdf
router.get('/:id/report', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const owned = await getOwnedDrive(req.params.id, req.user);
  if (owned.error) return res.status(owned.error).json({ error: owned.message });
  const format = readFormat(req, res);
  if (!format) return undefined;
  const drive = owned.drive;

  try {
    const [org, byType, byComponent, byHour, totals] = await Promise.all([
      pool.query('SELECT name, district FROM organizations WHERE org_id = $1', [drive.org_id]),
      pool.query(
        `SELECT blood_type, COUNT(*)::int AS units,
                COUNT(DISTINCT donor_id)::int AS donors
           FROM inventory_units WHERE drive_id = $1
          GROUP BY blood_type ORDER BY units DESC, blood_type`,
        [req.params.id]
      ),
      pool.query(
        `SELECT component, COUNT(*)::int AS units
           FROM inventory_units WHERE drive_id = $1
          GROUP BY component ORDER BY units DESC`,
        [req.params.id]
      ),
      pool.query(
        // date_trunc to the hour, so the shape of the day is visible
        // without turning the report into a per-minute list.
        `SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD HH24:00') AS hour,
                COUNT(*)::int AS units
           FROM inventory_units WHERE drive_id = $1
          GROUP BY 1 ORDER BY 1`,
        [req.params.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS units, COUNT(DISTINCT donor_id)::int AS donors
           FROM inventory_units WHERE drive_id = $1`,
        [req.params.id]
      ),
    ]);

    const o = org.rows[0] || {};
    const t = totals.rows[0] || { units: 0, donors: 0 };
    const target = drive.target_units;

    const overviewRows = [
      { field: 'Drive', value: drive.title },
      { field: 'Organization', value: o.name || '' },
      { field: 'District', value: o.district || '' },
      { field: 'Location', value: drive.location },
      { field: 'Date', value: isoDate(drive.drive_date) },
      { field: 'Status', value: drive.status },
      { field: 'Started', value: drive.started_at ? cell(drive.started_at) : 'not started' },
      { field: 'Finished', value: drive.completed_at ? cell(drive.completed_at) : 'not finished' },
      { field: 'Target units', value: target === null || target === undefined ? 'none set' : target },
      { field: 'Units collected', value: t.units },
      { field: 'Donors', value: t.donors },
      {
        field: 'Against target',
        // Reported as a plain fraction and only when a target exists.
        // A percentage of nothing is a division by zero dressed up as a
        // statistic.
        value: target ? `${t.units} of ${target} (${Math.round((t.units / target) * 100)}%)` : 'no target set',
      },
    ];

    return sendDatasets(res, {
      stem: driveFileStem(drive, 'drive_report'),
      title: `RoktoNet drive report: ${drive.title}`,
      format,
      subtitle: `${drive.title}  |  ${isoDate(drive.drive_date)}`,
      sets: [
        {
          name: 'overview',
          dataset: {
            title: 'Drive overview',
            columns: [{ key: 'field', header: 'Field' }, { key: 'value', header: 'Value' }],
          },
          rows: overviewRows,
        },
        {
          name: 'by_blood_type',
          dataset: {
            title: 'Collected by blood type',
            columns: [
              { key: 'blood_type', header: 'Blood type' },
              { key: 'units', header: 'Units' },
              { key: 'donors', header: 'Donors' },
            ],
          },
          rows: byType.rows,
        },
        {
          name: 'by_component',
          dataset: {
            title: 'Collected by component',
            columns: [
              { key: 'component', header: 'Component' },
              { key: 'units', header: 'Units' },
            ],
          },
          rows: byComponent.rows,
        },
        {
          name: 'by_hour',
          dataset: {
            title: 'Collection by hour',
            columns: [
              { key: 'hour', header: 'Hour' },
              { key: 'units', header: 'Units' },
            ],
          },
          rows: byHour.rows,
        },
      ],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/drives/:id/logs?format=csv|xlsx|pdf
//
// Named /logs, next to the existing JSON /log that the Drive Log page
// reads. Same rows, written to a file instead of the screen.
router.get('/:id/logs', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const owned = await getOwnedDrive(req.params.id, req.user);
  if (owned.error) return res.status(owned.error).json({ error: owned.message });
  const format = readFormat(req, res);
  if (!format) return undefined;
  const drive = owned.drive;

  try {
    const result = await pool.query(
      `SELECT to_char(iu.created_at, 'YYYY-MM-DD HH24:MI:SS') AS logged_at,
              d.full_name AS donor_name, iu.blood_type, iu.component,
              to_char(iu.collection_date, 'YYYY-MM-DD') AS collection_date,
              to_char(iu.expiry_date, 'YYYY-MM-DD')     AS expiry_date,
              iu.status, iu.unit_id
         FROM inventory_units iu
         JOIN donors d ON d.donor_id = iu.donor_id
        WHERE iu.drive_id = $1
        ORDER BY iu.created_at ASC`,
      [req.params.id]
    );

    return sendDatasets(res, {
      stem: driveFileStem(drive, 'drive_log'),
      title: `RoktoNet drive log: ${drive.title}`,
      format,
      subtitle: `${drive.title}  |  ${isoDate(drive.drive_date)}`,
      sets: [
        {
          name: 'units',
          dataset: {
            title: 'Units logged',
            columns: [
              { key: 'logged_at', header: 'Logged at' },
              { key: 'donor_name', header: 'Donor' },
              { key: 'blood_type', header: 'Blood type' },
              { key: 'component', header: 'Component' },
              { key: 'collection_date', header: 'Collected' },
              { key: 'expiry_date', header: 'Expires' },
              { key: 'status', header: 'Status' },
              { key: 'unit_id', header: 'Unit ID' },
            ],
          },
          rows: result.rows,
        },
      ],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;