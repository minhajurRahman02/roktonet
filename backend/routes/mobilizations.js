const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logRequestEvent } = require('../services/requestEvents');
const { notifyOrg } = require('../services/notificationService');
const { parsePagination, queryPage } = require('../utils/pagination');

// GET /api/mobilizations - all mobilizations involving the caller's OWN
// donors (i.e. donors whose donor.org_id matches this NGO), across every
// request -- not the single-request lookup below. Powers the NGO's
// Active Mobilizations page ("what are our donors currently being asked
// to do"). Deliberately does NOT reveal donor contact details here, even
// for confirmed invites -- unlike the hospital-facing per-request lookup,
// this is the NGO looking at its own roster's activity, which it already
// has full access to via GET /api/donors; this endpoint is about the
// mobilization/request side, not a second donor-contact-reveal surface.
// GET /api/mobilizations - two different scoping modes depending on role.
// For ngo/admin: all mobilizations for the caller's OWN donors, across
// every request -- powers the NGO's Active Mobilizations page. For
// donor: just the caller's own invites, extended to include the
// requesting org's contact info (name/district/phone/email) on EVERY
// row, not just confirmed ones -- deliberately asymmetric with how
// donor contact stays hidden from hospitals until confirmed. A hospital
// isn't a private individual the way a donor is; there's no equivalent
// reason to make a donor wait until they've committed before finding out
// who's asking and how to reach them.
router.get('/', requireAuth, async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  try {
    if (req.user.role === 'donor') {
      const donorResult = await pool.query('SELECT donor_id FROM donors WHERE user_id = $1', [
        req.user.user_id,
      ]);
      if (donorResult.rows.length === 0) {
        return res.status(400).json({ error: 'No donor record linked to this account' });
      }
      const donorId = donorResult.rows[0].donor_id;

      const donorRowsSql = `SELECT dm.mobilization_id, dm.donor_id, dm.invite_status, dm.slot_date,
                r.request_id, r.blood_type, r.component, r.urgency_tier,
                o.name AS requesting_org_name, o.district AS requesting_org_district,
                o.contact_phone AS requesting_org_phone, o.contact_email AS requesting_org_email
         FROM donor_mobilizations dm
         JOIN requests r ON r.request_id = dm.request_id
         JOIN organizations o ON o.org_id = r.org_id
         WHERE dm.donor_id = $1
         ORDER BY dm.mobilization_id DESC`;

      if (!pagination.paginated) {
        const result = await pool.query(donorRowsSql, [donorId]);
        return res.json(result.rows);
      }
      return res.json(await queryPage(pool, {
        countSql: `SELECT COUNT(*)::int AS total FROM donor_mobilizations dm
                   JOIN requests r ON r.request_id = dm.request_id
                   JOIN organizations o ON o.org_id = r.org_id
                   WHERE dm.donor_id = $1`,
        rowsSql: donorRowsSql,
        values: [donorId],
        pagination,
      }));
    }

    if (!['ngo', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: "This action requires one of these roles: ngo, admin, donor" });
    }

    let orgId = req.user.org_id;
    if (req.user.role === 'admin' && req.query.org_id) orgId = req.query.org_id;

    const rowsSql = `SELECT dm.mobilization_id, dm.donor_id, dm.invite_status, dm.slot_date,
              d.full_name AS donor_name, d.blood_type AS donor_blood_type,
              r.request_id, r.urgency_tier, o.name AS requesting_org_name
       FROM donor_mobilizations dm
       JOIN donors d ON d.donor_id = dm.donor_id
       JOIN requests r ON r.request_id = dm.request_id
       JOIN organizations o ON o.org_id = r.org_id
       WHERE d.org_id = $1
       ORDER BY dm.mobilization_id DESC`;

    if (!pagination.paginated) {
      const result = await pool.query(rowsSql, [orgId]);
      return res.json(result.rows);
    }
    res.json(await queryPage(pool, {
      countSql: `SELECT COUNT(*)::int AS total FROM donor_mobilizations dm
                 JOIN donors d ON d.donor_id = dm.donor_id
                 JOIN requests r ON r.request_id = dm.request_id
                 JOIN organizations o ON o.org_id = r.org_id
                 WHERE d.org_id = $1`,
      rowsSql,
      values: [orgId],
      pagination,
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mobilizations/:requestId - see which donors were invited for a
// request. Previously had NO authentication at all -- fixed this session,
// since the response now includes donor contact details for confirmed
// invites (name, email, phone, location, blood type), not just counts.
// Ownership-checked the same way as GET /api/requests/:id.
router.get('/:requestId', requireAuth, async (req, res) => {
  try {
    const requestResult = await pool.query('SELECT org_id FROM requests WHERE request_id = $1', [
      req.params.requestId,
    ]);
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const isOwner = req.user.org_id === requestResult.rows[0].org_id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this request' });
    }

    // Contact fields are only ever selected for confirmed rows (the CASE
    // expressions below null them out otherwise) -- pending/declined
    // donors stay fully anonymous, matching the existing Phase 7.7 privacy
    // boundary. Only a donor who has actively agreed to help is reachable.
    const result = await pool.query(
      `SELECT
         dm.mobilization_id, dm.donor_id, dm.invite_status, dm.slot_date,
         CASE WHEN dm.invite_status = 'confirmed' THEN u.full_name END AS donor_name,
         CASE WHEN dm.invite_status = 'confirmed' THEN u.email END AS donor_email,
         CASE WHEN dm.invite_status = 'confirmed' THEN d.phone_number END AS donor_phone,
         CASE WHEN dm.invite_status = 'confirmed' THEN d.blood_type END AS donor_blood_type,
         CASE WHEN dm.invite_status = 'confirmed' THEN d.current_district END AS donor_district,
         CASE WHEN dm.invite_status = 'confirmed' THEN d.current_thana END AS donor_thana
       FROM donor_mobilizations dm
       JOIN donors d ON d.donor_id = dm.donor_id
       LEFT JOIN users u ON u.user_id = d.user_id
       WHERE dm.request_id = $1`,
      [req.params.requestId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobilizations/:id/respond - donor confirms or declines an
// invite. Previously had NO authentication at all -- anyone who knew or
// guessed a mobilization_id could confirm or decline on someone else's
// behalf. Fixed: requires auth, and the caller's own linked donor_id
// must match the mobilization being responded to.
router.post('/:id/respond', requireAuth, async (req, res) => {
  const { invite_status, slot_date } = req.body;

  if (!['confirmed', 'declined'].includes(invite_status)) {
    return res.status(400).json({ error: "invite_status must be 'confirmed' or 'declined'" });
  }

  try {
    const existing = await pool.query('SELECT donor_id, request_id FROM donor_mobilizations WHERE mobilization_id = $1', [
      req.params.id,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Mobilization record not found' });
    }

    if (req.user.role !== 'admin') {
      const donorResult = await pool.query('SELECT donor_id FROM donors WHERE user_id = $1', [
        req.user.user_id,
      ]);
      const callerDonorId = donorResult.rows[0]?.donor_id;
      if (!callerDonorId || callerDonorId !== existing.rows[0].donor_id) {
        return res.status(403).json({ error: 'You do not have access to this invite' });
      }
    }

    const result = await pool.query(
      `UPDATE donor_mobilizations
       SET invite_status = $1, slot_date = $2
       WHERE mobilization_id = $3
       RETURNING *`,
      [invite_status, slot_date || null, req.params.id]
    );
    const mobilization = result.rows[0];

    // Anonymized -- no donor identity in the log, matching the same
    // privacy stance already applied to the hospital-facing request
    // detail view (counts only, never who, until confirmed).
    await logRequestEvent(
      mobilization.request_id,
      'donor_responded',
      invite_status === 'confirmed' ? 'A donor confirmed availability' : 'A donor declined',
      { invite_status }
    );

    // Notify the hospital only on acceptance, not decline -- the user's
    // explicit scope for this notification.
    if (invite_status === 'confirmed') {
      const requestResult = await pool.query(
        'SELECT org_id, urgency_tier FROM requests WHERE request_id = $1',
        [mobilization.request_id]
      );
      if (requestResult.rows.length > 0) {
        const { org_id, urgency_tier } = requestResult.rows[0];
        await notifyOrg(
          org_id,
          'donor_confirmed',
          'A donor has accepted your invitation. Contact details are available on the request.',
          mobilization.request_id,
          urgency_tier
        );
      }
    }

    res.json(mobilization);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;