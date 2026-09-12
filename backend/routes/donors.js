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
  const {
    org_id,
    full_name,
    phone_number,
    blood_type,
    email,
    current_district,
    current_thana,
    last_donation_date,
    last_donation_component,
    sex,
  } = req.body;

  // Required, not optional, for assisted registration -- unlike
  // self-registration (which only requires district), these donors
  // need a real location on record since the NGO is the one collecting
  // it in person, and it feeds directly into donorFallback.js's
  // location-proximity ranking.
  if (!org_id || !full_name || !phone_number || !blood_type || !current_district || !current_thana) {
    return res.status(400).json({
      error: 'org_id, full_name, phone_number, blood_type, current_district, and current_thana are required',
    });
  }
  if (req.user.role !== 'admin' && org_id !== req.user.org_id) {
    return res.status(403).json({ error: 'You may only register donors for your own organization' });
  }
  // Required for the same reason as self-registration: whole blood's
  // cooldown genuinely differs by sex.
  if (!sex || !['male', 'female'].includes(sex)) {
    return res.status(400).json({ error: "sex is required and must be 'male' or 'female'" });
  }
  // If the NGO asked the donor when they last gave, they need to also
  // record WHAT they gave -- the crossover matrix can't apply without
  // knowing which component started the cooldown. Required together,
  // not independently optional, since one without the other can't be
  // used for anything.
  if (last_donation_date && !last_donation_component) {
    return res.status(400).json({ error: 'last_donation_component is required when last_donation_date is provided' });
  }

  try {
    let thanaId = null;
    if (current_thana && current_district) {
      const resolved = await resolveThana(current_thana, current_district);
      thanaId = resolved ? resolved.thana_id : null;
    }

    const result = await pool.query(
      `INSERT INTO donors (org_id, full_name, phone_number, blood_type, email, current_district, current_thana, current_thana_id, last_donation_date, last_donation_component, sex, eligibility_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'eligible')
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
        last_donation_component || null,
        sex,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

