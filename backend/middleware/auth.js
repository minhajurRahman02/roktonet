// Auth middleware -- Phase 7.1b, updated 7.3a for cookie-based sessions,
// extended in 7.7 (Admin) for deactivation, read-only view-as sessions,
// and the primary-admin guard.
//
// requireAuth          : rejects anything without a valid, unexpired JWT,
//                        anything from a deactivated account, and any
//                        non-GET request made with a read-only token.
// requireRole          : rejects anything whose role isn't in the allowed list.
// requirePrimaryAdmin  : rejects any admin who isn't the first (seeded) admin.
//
// None of these attach anything to the response themselves -- they either
// call next() or send an error, so route handlers can assume req.user exists.

const jwt = require('jsonwebtoken');
const pool = require('../db');

const COOKIE_NAME = 'roktonet_token';

async function requireAuth(req, res, next) {
  // Cookie first (what the real frontend uses from 7.3a onward), falling
  // back to "Authorization: Bearer <token>" so Postman/curl testing and
  // any future non-browser client (e.g. a mobile app) still work without
  // needing a cookie jar.
  //
  // 7.7 addition: the Bearer path is ALSO how admin's read-only view-as
  // sessions arrive -- the frontend keeps the view-as token out of the
  // auth cookie on purpose, so the admin's real session is never replaced.
  // Bearer therefore takes precedence over the cookie when both are
  // present: a view-as request must be evaluated as the viewed user, not
  // silently fall back to the admin's own cookie.
  let token;
  const header = req.headers.authorization || '';
  const [scheme, headerToken] = header.split(' ');
  if (scheme === 'Bearer' && headerToken) {
    token = headerToken;
  } else {
    token = req.cookies?.[COOKIE_NAME];
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  let payload;
  try {
    // Throws if the signature is invalid or the token has expired.
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Session expired, please log in again'
        : 'Invalid token';
    return res.status(401).json({ error: message });
  }

  // Deactivation must take effect immediately, not at token expiry -- a
  // stateless JWT alone would let a deactivated user keep working for up
  // to JWT_EXPIRES_IN. One indexed primary-key read per request is the
  // price of that; negligible at this project's scale. (Spec 2.4.)
  try {
    const result = await pool.query('SELECT is_active FROM users WHERE user_id = $1', [
      payload.user_id,
    ]);
    if (result.rows.length === 0 || result.rows[0].is_active === false) {
      return res.status(401).json({ error: 'This account has been deactivated' });
    }
  } catch (err) {
    console.error('[auth] is_active lookup failed:', err.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }

  // Read-only view-as sessions (spec 2.5): the token was minted for an
  // admin to see exactly what this user sees. Reads pass through as that
  // user; anything that could change state is refused outright. GET is
  // the only safe method -- HEAD/OPTIONS never reach route handlers here.
  if (payload.readonly === true && req.method !== 'GET') {
    return res.status(403).json({
      error: 'Read-only session: this view-as token cannot perform that action',
    });
  }

  req.user = payload; // { user_id, email, role, org_id, readonly?, impersonated_by? }
  next();
}

// Usage: router.post('/', requireAuth, requireRole('hospital'), handler)
// Always place AFTER requireAuth, since it reads req.user.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `This action requires one of these roles: ${allowedRoles.join(', ')}`,
      });
    }
    next();
  };
}

// Only the seeded first admin can create other admins (spec 2.9). Checked
// against the database, not the token -- is_primary_admin is not a token
// claim, so it can't be forged or go stale.
async function requirePrimaryAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const result = await pool.query('SELECT is_primary_admin FROM users WHERE user_id = $1', [
      req.user.user_id,
    ]);
    if (!result.rows[0]?.is_primary_admin) {
      return res.status(403).json({ error: 'Only the primary admin can perform this action' });
    }
    next();
  } catch (err) {
    console.error('[auth] is_primary_admin lookup failed:', err.message);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
}

module.exports = { requireAuth, requireRole, requirePrimaryAdmin, COOKIE_NAME };
