const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/emailService');
const { resolveThana } = require('../services/locationResolver');
const { eligibleSql, eligibilityStatusSql } = require('../services/eligibility');
const { parsePagination, queryPage } = require('../utils/pagination');

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
  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  let orgId = req.user.org_id;
  if (req.user.role === 'admin') orgId = req.query.org_id || null;

  // Before 7.7, an admin without ?org_id= hit `org_id = NULL`, which
  // matches nothing -- admin literally could not list all donors. Now
  // admin is unscoped unless they filter; every other role stays locked
  // to their own org exactly as before.
  const conditions = [];
  const values = [];
  if (orgId) {
    values.push(orgId);
    conditions.push(`d.org_id = $${values.length}`);
  } else if (req.user.role !== 'admin') {
    return res.status(400).json({ error: 'You must belong to an organization' });
  }
  if (req.query.phone) {
    values.push(`%${req.query.phone}%`);
    conditions.push(`d.phone_number LIKE $${values.length}`);
  }
  // Admin-scale filters (7.7); harmless for scoped roles.
  for (const [param, column] of [['blood_type', 'd.blood_type'], ['district', 'd.current_district'], ['thana', 'd.current_thana'], ['sex', 'd.sex']]) {
    if (req.query[param]) {
      values.push(req.query[param]);
      conditions.push(`${column} = $${values.length}`);
    }
  }

  // 7.7a: eligibility is COMPUTED, not stored.
  //
  // This filter used to be `d.eligibility_status = $n` against a column
  // that was written once at INSERT as the literal 'eligible' and never
  // updated by anything. The filter was therefore returning "donors we
  // once wrote the word eligible onto", which was all of them.
  //
  // eligibleSql() generates the cooldown arithmetic from the same
  // constants services/eligibility.js uses for the JavaScript path, so
  // the SQL and the JS cannot drift apart. It contains only generated
  // integers and the table alias -- no user input is interpolated.
  //
  // 'pending' is gone as an option: nothing ever wrote it, and there is
  // no third state in the real model. A donor is either past their
  // cooldown for at least one component or they are not.
  if (req.query.eligibility_status === 'eligible') {
    conditions.push(eligibleSql('d'));
  } else if (req.query.eligibility_status === 'ineligible') {
    conditions.push(`NOT ${eligibleSql('d')}`);
  }

  if (req.query.search) {
    values.push(`%${req.query.search}%`);
    const like = `$${values.length}`;

    // Phone is matched on digits only, on both sides.
    //
    // The same number gets written as 01712-345678, +8801712345678 and
    // 01712 345678, so a plain ILIKE on the stored string finds a donor
    // only if the searcher happens to punctuate it the way whoever
    // registered them did. Stripping non-digits from the column and from
    // the search term means any of those spellings finds the donor.
    //
    // Only applied when the term actually contains a digit, so that
    // searching for a name does not also run a pointless regex over
    // every phone number in the table.
    // A leading 880 is dropped from the SEARCH TERM only. Numbers are
    // stored in local form (01712345678), so someone pasting
    // +8801712345678 out of their contacts would otherwise find nothing,
    // which is the one spelling most likely to be pasted rather than
    // typed. Removing it leaves 1712345678, a substring of the stored
    // value, so the existing match works unchanged.
    //
    // Stripping it from the search term rather than the column keeps
    // this from touching a donor whose number happens to contain 880
    // somewhere in the middle.
    const digits = String(req.query.search).replace(/\D/g, '').replace(/^880/, '');
    if (digits) {
      values.push(`%${digits}%`);
      conditions.push(
        `(d.full_name ILIKE ${like} OR d.email ILIKE ${like}`
        + ` OR regexp_replace(COALESCE(d.phone_number, ''), '\\D', '', 'g') ILIKE $${values.length})`
      );
    } else {
      conditions.push(`(d.full_name ILIKE ${like} OR d.email ILIKE ${like})`);
    }
  }
  if (req.query.has_login === 'true') conditions.push('d.user_id IS NOT NULL');
  if (req.query.has_login === 'false') conditions.push('d.user_id IS NULL');

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // The computed status rides along as a plain column so callers that
  // only want the word (report exports, the admin KPI) do not have to
  // recompute it, while the raw inputs (last_donation_date,
  // last_donation_component, sex) are still in d.* for callers that want
  // the full per-component breakdown.
  const selectSql = `SELECT d.*, o.name AS org_name,
                            ${eligibilityStatusSql('d')} AS eligibility_status
                     FROM donors d
                     LEFT JOIN organizations o ON o.org_id = d.org_id
                     ${whereClause}`;

  try {
    if (!pagination.paginated) {
      const result = await pool.query(`${selectSql} ORDER BY d.full_name`, values);
      return res.json(result.rows);
    }

    const page = await queryPage(pool, {
      countSql: `SELECT COUNT(*)::int AS total FROM donors d
                 LEFT JOIN organizations o ON o.org_id = d.org_id ${whereClause}`,
      rowsSql: `${selectSql} ORDER BY d.full_name`,
      values,
      pagination,
    });
    res.json(page);
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

    // 7.7a: eligibility_status is no longer written, because the column
    // no longer exists. It used to be hardcoded to 'eligible' HERE, on
    // the very same INSERT that could accept a last_donation_date from
    // last week -- the most direct demonstration of why a stored status
    // column was the wrong design.
    const result = await pool.query(
      `INSERT INTO donors (org_id, full_name, phone_number, blood_type, email, current_district, current_thana, current_thana_id, last_donation_date, last_donation_component, sex)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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

// GET /api/donors/:id - view a donor's profile/history. Was previously
// self-or-admin only; now also allows the NGO that owns this donor
// (donor.org_id matches), since Donor Detail is an NGO-facing page.
// Hospitals still only ever reach donor contact info through
// GET /api/mobilizations/:requestId's confirmed-invite reveal, never here.
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, ${eligibilityStatusSql('d')} AS eligibility_status
       FROM donors d WHERE d.donor_id = $1`,
      [req.params.id]
    );
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