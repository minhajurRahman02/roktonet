const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/notifications - the caller's own org's notifications, or
// everything (including admin-wide broadcasts, org_id IS NULL) if admin.
router.get('/', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const result = await pool.query(
      isAdmin
        ? `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`
        : `SELECT * FROM notifications WHERE org_id = $1 ORDER BY created_at DESC LIMIT 50`,
      isAdmin ? [] : [req.user.org_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query('SELECT org_id FROM notifications WHERE notification_id = $1', [
      req.params.id,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const isOwner = existing.rows[0].org_id === req.user.org_id;
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
