const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logRequestEvent } = require('../services/requestEvents');
const { notifyOrg } = require('../services/notificationService');

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

// POST /api/mobilizations/:id/respond - donor confirms or declines an invite.
// Still no ownership check on this one -- deliberately deferred to the
// Donor dashboard build (Phase 7.8), where a donor will be authenticated
// and this can check they're responding to their own invite. Out of scope
// for the hospital-side work this session.
router.post('/:id/respond', async (req, res) => {
  const { invite_status, slot_date } = req.body;

  if (!['confirmed', 'declined'].includes(invite_status)) {
    return res.status(400).json({ error: "invite_status must be 'confirmed' or 'declined'" });
  }

  try {
    const result = await pool.query(
      `UPDATE donor_mobilizations
       SET invite_status = $1, slot_date = $2
       WHERE mobilization_id = $3
       RETURNING *`,
      [invite_status, slot_date || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mobilization record not found' });
    }
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