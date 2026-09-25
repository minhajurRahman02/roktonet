const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAdminAction } = require('../services/adminAudit');
const crypto = require('crypto');
const { resolveThana } = require('../services/locationResolver');
const { parsePagination, queryPage } = require('../utils/pagination');

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
  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });
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

  if (req.query.district) {
    values.push(req.query.district);
    conditions.push(`district = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // Admin (7.7) additionally gets invite_code -- the one thing the
    // original spec said admin should see that nobody else may -- plus
    // per-org counts for the system-wide Organizations table. Every other
    // role keeps the SAFE_COLUMNS-only shape exactly as before.
    const isAdmin = req.user.role === 'admin';
    const rowsSql = isAdmin
        ? `SELECT ${SAFE_COLUMNS.split(', ').map((c) => 'o.' + c).join(', ')}, o.invite_code,
                  (SELECT COUNT(*) FROM users u WHERE u.org_id = o.org_id)::int AS user_count,
                  (SELECT COUNT(*) FROM inventory_units iu WHERE iu.org_id = o.org_id AND iu.status = 'available')::int AS available_units,
                  (SELECT COUNT(*) FROM requests r WHERE r.org_id = o.org_id AND r.fulfillment_path IS NULL AND r.cancelled_at IS NULL)::int AS open_requests,
                  (SELECT COUNT(*) FROM donors d WHERE d.org_id = o.org_id)::int AS donor_count
           FROM organizations o ${whereClause.replace(/\b(org_type|name|district) =/g, 'o.$1 =').replace('name ILIKE', 'o.name ILIKE')} ORDER BY o.name`
        : `SELECT ${SAFE_COLUMNS} FROM organizations ${whereClause} ORDER BY name`;

    if (!pagination.paginated) {
      const result = await pool.query(rowsSql, values);
      return res.json(result.rows);
    }
    // The count uses the UNALIASED whereClause, matching the non-admin
    // branch. The admin branch rewrites the clause to prefix columns with
    // "o." only because its FROM is "organizations o"; the count's FROM has
    // no alias, so the plain clause is the correct one for both. The four
    // correlated subqueries are per-row scalars and cannot change how many
    // organizations match.
    res.json(await queryPage(pool, {
      countSql: `SELECT COUNT(*)::int AS total FROM organizations ${whereClause}`,
      rowsSql,
      values,
      pagination,
    }));
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

  // thana is now REQUIRED at creation, where it used to be optional.
  //
  // It is not cosmetic. donorFallback.js ranks candidate donors by
  // same-thana before same-district, and engine.py's distance term compares
  // organizations to each other. An organization with no thana silently
  // loses the finer half of both comparisons and simply never wins a
  // proximity tie-break -- with nothing anywhere reporting that it is being
  // matched less precisely than its neighbours.
  //
  // It is also half of the uniqueness rule below: two organizations sharing
  // a name and district are distinguished by thana, so a missing thana
  // makes that rule unenforceable for exactly the rows that need it most.
  if (!name || !org_type || !district) {
    return res.status(400).json({ error: 'name, org_type, and district are all required' });
  }
  if (!req.body.thana || !String(req.body.thana).trim()) {
    return res.status(400).json({ error: 'thana is required' });
  }

  if (!['hospital', 'blood_bank', 'ngo'].includes(org_type)) {
    return res.status(400).json({ error: "org_type must be one of hospital, blood_bank, ngo" });
  }

  try {
    // 7.7: an org created here now gets a real invite_code immediately --
    // same format migration_auth.sql used to backfill the seed orgs (8
    // uppercase hex chars), so staff can actually register for it. Before
    // this, API-created orgs had a NULL code and were unjoinable.
    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const { contact_phone, contact_email, thana } = req.body;

    // --- Uniqueness, checked here for a readable error -------------------
    //
    // The real guarantee is the pair of unique indexes in
    // migration_refinements.sql. These checks exist so an admin gets
    // "Popular Diagnostic Centre already exists in Dhaka, Mirpur Model"
    // instead of a raw Postgres constraint violation. They are a courtesy,
    // not the enforcement -- a check-then-insert has a race between the two
    // statements, which is exactly what the index closes.
    //
    // Case-insensitive on both, because two people typing the same real
    // organization in different cases have created one duplicate, not two
    // organizations.
    const clash = await pool.query(
      `SELECT name, district, thana FROM organizations
        WHERE lower(name) = lower($1) AND district = $2
          AND COALESCE(thana, '') = COALESCE($3, '')
        LIMIT 1`,
      [name.trim(), district, thana.trim()]
    );
    if (clash.rows.length > 0) {
      return res.status(409).json({
        error: `An organization named "${clash.rows[0].name}" already exists in ${district}, ${clash.rows[0].thana}. Same name is fine in a different district, or a different thana within this one.`,
      });
    }

    if (contact_email && contact_email.trim()) {
      const emailClash = await pool.query(
        'SELECT name FROM organizations WHERE lower(contact_email) = lower($1) LIMIT 1',
        [contact_email.trim()]
      );
      if (emailClash.rows.length > 0) {
        return res.status(409).json({
          error: `That contact email is already used by "${emailClash.rows[0].name}". Each organization needs its own address.`,
        });
      }
    }

    const resolved = await resolveThana(thana.trim(), district);

    // Stored TRIMMED, and this matters more than it looks.
    //
    // The clash check above compares trimmed input, but the unique index
    // compares stored values. Insert "  Popular Diagnostic Centre  " raw and
    // the check correctly finds no clash while the index sees a string that
    // genuinely differs from "Popular Diagnostic Centre" -- so two rows that
    // are visually identical both survive, and the constraint that was meant
    // to prevent exactly that never fires. Normalising on write is what keeps
    // the check and the index talking about the same thing.
    const result = await pool.query(
      `INSERT INTO organizations (name, org_type, district, thana, thana_id, contact_phone, contact_email, invite_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${SAFE_COLUMNS}, invite_code`,
      [name.trim(), org_type, district, thana.trim(), resolved ? resolved.thana_id : null,
       contact_phone ? contact_phone.trim() : null,
       contact_email ? contact_email.trim() : null,
       inviteCode]
    );
    await logAdminAction(req.user.user_id, 'org_created', {
      targetType: 'organization', targetId: result.rows[0].org_id, details: { name, org_type, district },
    });
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
      // touches location at all must include a real district.
      if (!district) {
        return res.status(400).json({ error: 'district is required' });
      }
      // thana is now required here too, where it used to be optional.
      //
      // Not for symmetry's sake: this UPDATE sets thana unconditionally, so
      // leaving it out does not preserve the existing value, it CLEARS it.
      // With thana mandatory at creation, an org editing its phone number
      // and omitting thana would have quietly dropped back to
      // district-level precision -- losing its place in donorFallback.js's
      // same-thana ranking and punching a hole in the uniqueness rule, with
      // nothing reporting either.
      if (!thana || !String(thana).trim()) {
        return res.status(400).json({ error: 'thana is required when updating location' });
      }
      const resolved = await resolveThana(String(thana).trim(), district);
      result = await pool.query(
        `UPDATE organizations SET
           contact_phone = COALESCE($1, contact_phone),
           contact_email = COALESCE($2, contact_email),
           district = $3,
           thana = $4,
           thana_id = $5
         WHERE org_id = $6
         RETURNING ${SAFE_COLUMNS}`,
        [contact_phone, contact_email, district, String(thana).trim(), resolved ? resolved.thana_id : null, req.params.id]
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
    // 7.7: admin may also rename. Kept out of the member path -- an org's
    // name is its identity across every request/allocation record.
    if (req.user.role === 'admin' && req.body.name !== undefined && String(req.body.name).trim()) {
      result = await pool.query(
        `UPDATE organizations SET name = $1 WHERE org_id = $2 RETURNING ${SAFE_COLUMNS}, invite_code`,
        [String(req.body.name).trim(), req.params.id]
      );
    }
    if (req.user.role === 'admin') {
      await logAdminAction(req.user.user_id, 'org_updated', {
        targetType: 'organization', targetId: req.params.id,
        details: Object.fromEntries(Object.entries(req.body).filter(([, v]) => v !== undefined)),
      });
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