// Authentication routes -- Phase 7.1
// Registration + email verification. Login/JWT lands in 7.1b.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db');
const { requireAuth, COOKIE_NAME } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { resolveThana } = require('../services/locationResolver');
const { uploadAvatar } = require('../services/supabaseStorage');

// Files parsed into memory (not saved to the backend's own ephemeral
// disk) since they immediately get forwarded to Supabase Storage.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Roles that must belong to an organization, and therefore must supply a
// valid invite code at registration. This is what prevents someone from
// self-claiming to be a verified hospital and filing fake critical requests.
const ORG_ROLES = ['hospital', 'bank', 'ngo'];
// 'admin' is deliberately NOT registerable -- admins are created directly
// in the database. Public admin signup would be an obvious security hole.
const PUBLIC_ROLES = ['hospital', 'bank', 'ngo', 'donor'];

// Donor registration additionally requires blood type + current location +
// phone, and creates a linked donors row alongside the users row -- these
// were previously completely disconnected (a donor could log in, but the
// system had no way of knowing which donors-table row was "them").
const DONOR_BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_MINUTES = 60;

// Cookie options shared between setting (login) and clearing (logout).
// secure/sameSite differ by environment because of a real browser rule:
// SameSite=None (needed for cross-origin requests, i.e. production, where
// frontend and backend are different domains) REQUIRES Secure (HTTPS-only).
// Localhost dev isn't HTTPS, so in dev we rely on the Vite proxy making
// requests same-origin instead, and use Lax there.
function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches JWT_EXPIRES_IN default
    path: '/',
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, role, full_name, invite_code } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required' });
  }
  if (!PUBLIC_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${PUBLIC_ROLES.join(', ')}` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }
  if (ORG_ROLES.includes(role) && !invite_code) {
    return res.status(400).json({ error: `invite_code is required for the '${role}' role` });
  }
  if (role === 'donor') {
    const { blood_type, current_district, phone_number, sex } = req.body;
    if (!blood_type || !DONOR_BLOOD_TYPES.includes(blood_type)) {
      return res.status(400).json({
        error: `blood_type is required for donor registration and must be one of: ${DONOR_BLOOD_TYPES.join(', ')}`,
      });
    }
    if (!current_district) {
      return res.status(400).json({ error: 'current_district is required for donor registration' });
    }
    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required for donor registration' });
    }
    // Required because whole blood's cooldown genuinely differs by sex
    // (120 days male / 180 days female, independently verified -- see
    // services/eligibility.js). Framed strictly for donation-eligibility
    // computation, not gender identity.
    if (!sex || !['male', 'female'].includes(sex)) {
      return res.status(400).json({ error: "sex is required for donor registration and must be 'male' or 'female'" });
    }
  }

  try {
    // Resolve the organization from its invite code (org roles only).
    let orgId = null;
    if (ORG_ROLES.includes(role)) {
      const orgResult = await pool.query(
        'SELECT org_id, org_type FROM organizations WHERE invite_code = $1',
        [invite_code.trim().toUpperCase()]
      );
      if (orgResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid invite code' });
      }
      orgId = orgResult.rows[0].org_id;
    }

    // Check email isn't already registered. (The users table also has a
    // UNIQUE constraint on email -- this check just returns a friendlier
    // error than a raw database constraint violation.)
    const existing = await pool.query('SELECT user_id FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

    let newUser;

    if (role === 'donor') {
      // Donor registration writes to two tables (users + donors) that must
      // succeed together or not at all -- without a transaction, a donors
      // insert failure after the users insert already committed would
      // leave an orphaned login with no donor record behind it, silently
      // recreating the exact users<->donors disconnect this was meant to fix.
      const { blood_type, current_district, current_thana, phone_number, sex } = req.body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const userResult = await client.query(
          `INSERT INTO users (org_id, role, email, password_hash, full_name, verification_token, token_expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING user_id, email, role, org_id, is_verified, created_at`,
          [null, role, email.toLowerCase(), passwordHash, full_name || null, verificationToken, expiresAt]
        );
        newUser = userResult.rows[0];

        // Tier 2 fuzzy resolution against the canonical thana list, scoped
        // to the district already selected. A miss (typo too severe, or a
        // neighborhood name rather than a real thana -- see
        // locationResolver.js's documented limitation) leaves thana_id
        // NULL rather than guessing; donor-fallback matching then
        // gracefully degrades to district-level for this donor.
        let thanaId = null;
        if (current_thana) {
          const resolved = await resolveThana(current_thana, current_district);
          thanaId = resolved ? resolved.thana_id : null;
        }

        // 7.7a: eligibility_status is gone. It was written here as the
        // literal 'eligible' and never updated by anything anywhere, so it
        // was a claim the system made once and then never revisited.
        // Eligibility is now derived from last_donation_date,
        // last_donation_component and sex by services/eligibility.js.
        await client.query(
          `INSERT INTO donors (user_id, full_name, blood_type, current_district, current_thana, current_thana_id, phone_number, sex)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [newUser.user_id, full_name || null, blood_type, current_district, current_thana || null, thanaId, phone_number, sex]
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } else {
      const result = await pool.query(
        `INSERT INTO users (org_id, role, email, password_hash, full_name, verification_token, token_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING user_id, email, role, org_id, is_verified, created_at`,
        [
          orgId,
          role,
          email.toLowerCase(),
          passwordHash,
          full_name || null,
          verificationToken,
          expiresAt,
        ]
      );
      newUser = result.rows[0];
    }

    // Phase 7.2: real email delivery via Resend, replacing the 7.1
    // dev_verification_token workaround. If email sending fails, the
    // account still exists (so nothing is silently lost) but we tell the
    // client honestly rather than pretending an email went out.
    try {
      await sendVerificationEmail(email.toLowerCase(), verificationToken);
    } catch (emailErr) {
      console.error('[auth] verification email failed to send:', emailErr.message);
      return res.status(201).json({
        user: newUser,
        message:
          'Account created, but the verification email could not be sent. Please contact support or try registering again.',
        email_delivery_failed: true,
      });
    }

    res.status(201).json({
      user: newUser,
      message: 'Registered. Check your email to verify your account.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/verify?token=...
// A GET (not POST) because this is what an emailed link will hit directly.
router.get('/verify', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  try {
    const result = await pool.query(
      'SELECT user_id, email, is_verified, token_expires_at FROM users WHERE verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or already-used verification token' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.json({ message: 'This account is already verified. You can log in.' });
    }
    if (new Date(user.token_expires_at) < new Date()) {
      return res.status(400).json({ error: 'This verification link has expired. Please register again.' });
    }

    // Clear the token on success so the same link can't be reused.
    await pool.query(
      `UPDATE users SET is_verified = true, verification_token = NULL, token_expires_at = NULL
       WHERE user_id = $1`,
      [user.user_id]
    );

    res.json({ message: 'Email verified. You can now log in.', email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await pool.query(
      `SELECT user_id, org_id, role, email, password_hash, full_name, is_verified, is_active
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    // Deliberately identical error for "no such user" and "wrong password".
    // Telling an attacker which emails exist is an account-enumeration leak.
    const genericFailure = { error: 'Invalid email or password' };

    if (result.rows.length === 0) {
      return res.status(401).json(genericFailure);
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json(genericFailure);
    }

    // Deactivated accounts (admin action, spec 2.1) get a distinct, honest
    // message -- unlike the enumeration-safe generic failure above, the
    // caller has already proven they know the password, so there's no
    // leak in telling them why they can't proceed.
    if (user.is_active === false) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact an administrator.' });
    }

    // Unverified accounts can authenticate their password but get no token --
    // this is the whole point of email verification.
    if (!user.is_verified) {
      return res.status(403).json({
        error: 'Please verify your email address before logging in',
        needs_verification: true,
      });
    }

    // The payload is readable by anyone holding the token (JWTs are signed,
    // not encrypted) -- so it carries identity/authorization only, never
    // anything sensitive like the password hash.
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role, org_id: user.org_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // httpOnly cookie, not a JSON field -- JavaScript in the browser can
    // never read this value, which closes off an entire class of XSS
    // token-theft attacks that localStorage-based tokens are exposed to.
    res.cookie(COOKIE_NAME, token, cookieOptions());

    res.json({
      user: {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        org_id: user.org_id,
        full_name: user.full_name,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me -- who am I, according to my token?
// The frontend calls this on load to restore the session and know which
// dashboard to show. Reads fresh from the DB rather than trusting the
// token's payload, so role/org changes take effect without re-login.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      // A donor's users.org_id is ALWAYS null -- donors aren't "staff"
      // of anything, so that column is only ever meaningful for
      // hospital/bank/ngo/admin accounts. A donor's real affiliation
      // lives on donors.org_id instead, a completely separate column.
      // Joining organizations via u.org_id alone meant every donor's
      // org_id/org_name always came back null regardless of their true
      // affiliation -- the sidebar's "My NGO" vs "Find an NGO" label,
      // the affiliated/unaffiliated My NGO view, and the "Your NGO's
      // drive" badge on Browse Drives were all silently reading this
      // same always-null value. COALESCE picks whichever one is
      // actually populated for this account -- exactly one of the two
      // ever is, never both.
      `SELECT u.user_id, u.email, u.role,
              COALESCE(u.org_id, d.org_id) AS org_id,
              u.full_name, u.is_verified, u.avatar_url, u.is_primary_admin,
              o.name AS org_name, o.org_type, o.district,
              o.contact_phone AS org_contact_phone, o.contact_email AS org_contact_email,
              d.donor_id
       FROM users u
       LEFT JOIN donors d ON d.user_id = u.user_id
       LEFT JOIN organizations o ON o.org_id = COALESCE(u.org_id, d.org_id)
       WHERE u.user_id = $1`,
      [req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User no longer exists' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot-password
// Always responds with the same generic success message whether or not the
// email exists -- otherwise this endpoint becomes an account-enumeration
// oracle (submit an email, see if the response differs, learn who's
// registered). An email only actually goes out if the account is real.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const genericResponse = {
    message: 'If an account with that email exists, a password reset link has been sent.',
  };

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  try {
    const result = await pool.query('SELECT user_id FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);

    if (result.rows.length === 0) {
      return res.json(genericResponse); // same response as the success path, deliberately
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE user_id = $3',
      [resetToken, expiresAt, result.rows[0].user_id]
    );

    try {
      await sendPasswordResetEmail(email.toLowerCase(), resetToken);
    } catch (emailErr) {
      // Log it, but still return the generic success response -- revealing
      // a delivery failure here would itself leak that the email exists.
      console.error('[auth] password reset email failed to send:', emailErr.message);
    }

    res.json(genericResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body;

  if (!token || !new_password) {
    return res.status(400).json({ error: 'token and new_password are required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'new_password must be at least 8 characters' });
  }

  try {
    const result = await pool.query(
      'SELECT user_id, reset_token_expires_at FROM users WHERE reset_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or already-used reset link' });
    }

    const user = result.rows[0];
    if (new Date(user.reset_token_expires_at) < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);

    // Clear the token on use -- same single-use principle as email
    // verification. Also invalidates the reset link the moment it's used.
    await pool.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL
       WHERE user_id = $2`,
      [passwordHash, user.user_id]
    );

    res.json({ message: 'Password updated. You can now log in with your new password.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/me - update your own name and/or avatar. Universal
// across every role, since both fields live on `users`. Email is
// deliberately excluded -- editing it properly needs a re-verification
// flow (proving you control the new address), which is a genuinely
// separate chunk of work not built here; email stays read-only for now.
router.patch('/me', requireAuth, async (req, res) => {
  const { full_name, avatar_url } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         avatar_url = COALESCE($2, avatar_url)
       WHERE user_id = $3
       RETURNING user_id, email, role, org_id, full_name, avatar_url`,
      [full_name, avatar_url, req.user.user_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password - for a LOGGED-IN user changing their
// own password. Distinct from the forgot-password flow above, which is
// for someone who can't log in at all. Requires the current password,
// not just a bare "set new password" -- otherwise anyone with a stolen,
// still-valid session could lock the real owner out permanently.
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are both required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.user_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User no longer exists' });
    }

    const isValid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newHash, req.user.user_id]);

    res.json({ message: 'Password changed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/me/avatar - upload a profile picture. Universal across
// every role. multer parses the multipart upload into memory, then the
// bytes get forwarded straight to Supabase Storage -- nothing is ever
// written to the backend's own disk, which wouldn't persist across a
// redeploy on most free-tier hosts anyway.
router.post('/me/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded (field name must be "avatar")' });
  }
  if (!ALLOWED_AVATAR_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are allowed' });
  }

  try {
    const extension = req.file.mimetype.split('/')[1];
    const publicUrl = await uploadAvatar(req.user.user_id, req.file.buffer, req.file.mimetype, extension);
    await pool.query('UPDATE users SET avatar_url = $1 WHERE user_id = $2', [publicUrl, req.user.user_id]);
    res.json({ avatar_url: publicUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;