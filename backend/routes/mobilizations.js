const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logRequestEvent } = require('../services/requestEvents');
const { notifyOrg } = require('../services/notificationService');

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
  try {
    if (req.user.role === 'donor') {
      const donorResult = await pool.query('SELECT donor_id FROM donors WHERE user_id = $1', [
        req.user.user_id,
      ]);
      if (donorResult.rows.length === 0) {
        return res.status(400).json({ error: 'No donor record linked to this account' });
      }
      const donorId = donorResult.rows[0].donor_id;

      const result = await pool.query(
        `SELECT dm.mobilization_id, dm.donor_id, dm.invite_status, dm.slot_date,
                r.request_id, r.blood_type, r.component, r.urgency_tier,
                o.name AS requesting_org_name, o.district AS requesting_org_district,
                o.contact_phone AS requesting_org_phone, o.contact_email AS requesting_org_email
         FROM donor_mobilizations dm
         JOIN requests r ON r.request_id = dm.request_id
         JOIN organizations o ON o.org_id = r.org_id
         WHERE dm.donor_id = $1
         ORDER BY dm.mobilization_id DESC`,
        [donorId]
      );
      return res.json(result.rows);
    }

    if (!['ngo', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: "This action requires one of these roles: ngo, admin, donor" });
    }

    let orgId = req.user.org_id;
    if (req.user.role === 'admin' && req.query.org_id) orgId = req.query.org_id;

    const result = await pool.query(
      `SELECT dm.mobilization_id, dm.donor_id, dm.invite_status, dm.slot_date,
              d.full_name AS donor_name, d.blood_type AS donor_blood_type,
              r.request_id, r.urgency_tier, o.name AS requesting_org_name
       FROM donor_mobilizations dm
       JOIN donors d ON d.donor_id = dm.donor_id
       JOIN requests r ON r.request_id = dm.request_id
       JOIN organizations o ON o.org_id = r.org_id
       WHERE d.org_id = $1
       ORDER BY dm.mobilization_id DESC`,
      [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
