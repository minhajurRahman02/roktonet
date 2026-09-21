const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, queryPage } = require('../utils/pagination');

// GET /api/notifications - the caller's own org's notifications, or
// everything (including admin-wide broadcasts, org_id IS NULL) if admin.
router.get('/', requireAuth, async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  // 7.7 scope change (spec 2.6): a notification reaches a user if it's
  // addressed to their org OR to them personally (user_id -- how admin
  // broadcasts are delivered). Before this, a donor (org_id = NULL on
  // their users row) could never receive anything at all. Admin sees
  // its own personal notifications only -- the firehose of every org's
  // notifications is not what an inbox is for; admin has the activity
  // feed and audit log for system-wide visibility.
  const where = `WHERE user_id = $1 OR ($2::uuid IS NOT NULL AND org_id = $2 AND user_id IS NULL)`;
  const values = [req.user.user_id, req.user.org_id];

  try {
    if (!pagination.paginated) {
      // The hardcoded LIMIT 50 stays on this path deliberately. This is the
      // TopBar notification bell, which wants a short recent list and has no
      // paging controls. Removing it would make the bell fetch every
      // notification the user has ever received on every page load.
      const result = await pool.query(
        `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT 50`,
        values
      );
      return res.json(result.rows);
    }
    res.json(await queryPage(pool, {
      countSql: `SELECT COUNT(*)::int AS total FROM notifications ${where}`,
      rowsSql: `SELECT * FROM notifications ${where} ORDER BY created_at DESC`,
      values,
      pagination,
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query('SELECT org_id, user_id FROM notifications WHERE notification_id = $1', [
      req.params.id,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const n = existing.rows[0];
    const isOwner = (n.user_id && n.user_id === req.user.user_id) || (!n.user_id && n.org_id && n.org_id === req.user.org_id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this notification' });
    }

    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE notification_id = $1 RETURNING *',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
