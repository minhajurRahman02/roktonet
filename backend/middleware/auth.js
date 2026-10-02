// Auth middleware -- Phase 7.1b, updated 7.3a for cookie-based sessions.
//
// requireAuth  : rejects anything without a valid, unexpired JWT.
// requireRole  : rejects anything whose role isn't in the allowed list.
//
// Both attach nothing to the response themselves -- they either call next()
// or send an error, so route handlers can assume req.user exists.

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'roktonet_token';

function requireAuth(req, res, next) {
  // Cookie first (what the real frontend uses from 7.3a onward), falling
  // back to "Authorization: Bearer <token>" so Postman/curl testing and
  // any future non-browser client (e.g. a mobile app) still work without
  // needing a cookie jar.
  let token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    const header = req.headers.authorization || '';
    const [scheme, headerToken] = header.split(' ');
    if (scheme === 'Bearer' && headerToken) {
      token = headerToken;
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Throws if the signature is invalid or the token has expired.
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { user_id, email, role, org_id }
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Session expired, please log in again'
        : 'Invalid token';
    return res.status(401).json({ error: message });
  }
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

module.exports = { requireAuth, requireRole, COOKIE_NAME };