const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/emailService');
const { resolveThana } = require('../services/locationResolver');

const BCRYPT_ROUNDS = 10;
// Longer than the 60-minute forgot-password window -- this is an
// invitation someone might not open right away, not an urgent "I'm
// locked out right now" request.
const INVITE_TOKEN_TTL_HOURS = 168; // 7 days

function isOwningNgo(donor, user) {
  return user.role === 'ngo' && donor.org_id === user.org_id;
}

// GET /api/donors - roster list/search. Auto-scoped to the caller's own
// org (ngo/bank/admin); ?phone= does a partial match, for the "search by
// phone" flow during a live drive.
router.get('/', requireAuth, requireRole('ngo', 'bank', 'admin'), async (req, res) => {
  let orgId = req.user.org_id;
  if (req.user.role === 'admin' && req.query.org_id) orgId = req.query.org_id;

  const conditions = ['org_id = $1'];
  const values = [orgId];
  if (req.query.phone) {
    values.push(`%${req.query.phone}%`);
    conditions.push(`phone_number LIKE $${values.length}`);
  }

  try {
    const result = await pool.query(
      `SELECT * FROM donors WHERE ${conditions.join(' AND ')} ORDER BY full_name`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/donors - assisted registration. NGO/admin only. Deliberately
// creates NO users row -- this is for a donor who doesn't want their own
// login. (The old orphaned version of this route was removed entirely
// during the location-precision work, with the explicit reasoning that
// this exact scenario deserved a purpose-built route when we got here,
// not a retrofit of the leftover one. This is that route.)
router.post('/', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  const { org_id, full_name, phone_number, blood_type, email, current_district, current_thana, last_donation_date } =
    req.body;

  if (!org_id || !full_name || !phone_number || !blood_type) {
    return res.status(400).json({ error: 'org_id, full_name, phone_number, and blood_type are required' });
  }
  if (req.user.role !== 'admin' && org_id !== req.user.org_id) {
    return res.status(403).json({ error: 'You may only register donors for your own organization' });
  }

  try {
    let thanaId = null;
    if (current_thana && current_district) {
      const resolved = await resolveThana(current_thana, current_district);
      thanaId = resolved ? resolved.thana_id : null;
    }

    const result = await pool.query(
      `INSERT INTO donors (org_id, full_name, phone_number, blood_type, email, current_district, current_thana, current_thana_id, last_donation_date, eligibility_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'eligible')
       RETURNING *`,
      [
        org_id,
        full_name,
        phone_number,
        blood_type,
        email || null,
        current_district || null,
        current_thana || null,
        thanaId,
        last_donation_date || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/donors/:id - view a donor's profile/history. Was previously
// self-or-admin only; now also allows the NGO that owns this donor
// (donor.org_id matches), since Donor Detail is an NGO-facing page.
// Hospitals still only ever reach donor contact info through
// GET /api/mobilizations/:requestId's confirmed-invite reveal, never here.
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM donors WHERE donor_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    const donor = result.rows[0];
    const isSelf = donor.user_id && donor.user_id === req.user.user_id;
    const isAdmin = req.user.role === 'admin';
    if (!isSelf && !isAdmin && !isOwningNgo(donor, req.user)) {
      return res.status(403).json({ error: 'You do not have access to this donor record' });
    }

    res.json(donor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/donors/:id - edit contact/location info. Same ownership
// rule as the GET above. Deliberately doesn't allow editing blood_type
// or last_donation_date here -- the first is fixed biology, the second
// only changes through logging a real donation (or at assisted-
// registration time), not a free-form edit.
router.patch('/:id', requireAuth, async (req, res) => {
  const { full_name, phone_number, email, current_district, current_thana } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM donors WHERE donor_id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    const donor = existing.rows[0];
    const isSelf = donor.user_id && donor.user_id === req.user.user_id;
    const isAdmin = req.user.role === 'admin';
    if (!isSelf && !isAdmin && !isOwningNgo(donor, req.user)) {
      return res.status(403).json({ error: 'You do not have access to this donor record' });
    }

    let thanaId = donor.current_thana_id;
    const nextDistrict = current_district ?? donor.current_district;
    if (current_thana && current_thana !== donor.current_thana) {
      const resolved = nextDistrict ? await resolveThana(current_thana, nextDistrict) : null;
      thanaId = resolved ? resolved.thana_id : null;
    }

    const result = await pool.query(
      `UPDATE donors SET
         full_name = COALESCE($1, full_name),
         phone_number = COALESCE($2, phone_number),
         email = COALESCE($3, email),
         current_district = COALESCE($4, current_district),
         current_thana = COALESCE($5, current_thana),
         current_thana_id = $6
       WHERE donor_id = $7
       RETURNING *`,
      [full_name, phone_number, email, current_district, current_thana, thanaId, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/donors/:id/invite-login - creates a real login account for a
// donor who was assisted-registered without one, then sends a
// "set your password" link -- reusing the EXACT SAME reset_token
// mechanism and email already built for forgotten passwords, rather than
// generating and emailing a raw password. Nothing sensitive ever sits in
// an email; the donor picks their own password. is_verified is set true
// immediately: a physical human (the NGO volunteer) already vouched for
// this person in person, a reasonable trust level for this specific,
// assisted path -- unlike self-registration, which still requires real
// email verification since there's no such in-person check.
router.post('/:id/invite-login', requireAuth, requireRole('ngo', 'admin'), async (req, res) => {
  try {
    const donorResult = await pool.query('SELECT * FROM donors WHERE donor_id = $1', [req.params.id]);
    if (donorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    const donor = donorResult.rows[0];

    if (req.user.role !== 'admin' && !isOwningNgo(donor, req.user)) {
      return res.status(403).json({ error: 'You do not have access to this donor record' });
    }
    if (donor.user_id) {
      return res.status(400).json({ error: 'This donor already has a login account' });
    }
    if (!donor.email) {
      return res.status(400).json({ error: 'This donor has no email on file -- add one before inviting them' });
    }

    const existingUser = await pool.query('SELECT user_id FROM users WHERE email = $1', [
      donor.email.toLowerCase(),
    ]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    // A random, never-communicated placeholder hash -- the donor will
    // never log in with this; they set their own password via the reset
    // link below before the account becomes usable.
    const placeholderPassword = crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(placeholderPassword, BCRYPT_ROUNDS);
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users (org_id, role, email, password_hash, full_name, is_verified, reset_token, reset_token_expires_at)
         VALUES (NULL, 'donor', $1, $2, $3, true, $4, $5)
         RETURNING user_id, email, role, is_verified, created_at`,
        [donor.email.toLowerCase(), passwordHash, donor.full_name || null, resetToken, expiresAt]
      );
      const newUser = userResult.rows[0];

      await client.query('UPDATE donors SET user_id = $1 WHERE donor_id = $2', [newUser.user_id, donor.donor_id]);

      await client.query('COMMIT');

      try {
        await sendPasswordResetEmail(donor.email.toLowerCase(), resetToken);
      } catch (emailErr) {
        console.error('[donors] invite-login email failed to send:', emailErr.message);
        return res.status(201).json({
          user: newUser,
          message: 'Account created, but the invite email could not be sent.',
          email_delivery_failed: true,
        });
      }

      res.status(201).json({ user: newUser, message: 'Invite sent. The donor can set their password from the link.' });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;