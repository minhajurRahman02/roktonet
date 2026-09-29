
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