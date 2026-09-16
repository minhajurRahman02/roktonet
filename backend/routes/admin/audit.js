// Admin -> audit log. Spec section 4.6. Read-only by design: there is no
// endpoint anywhere that updates or deletes admin_actions rows.

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { parseDateRange, WhereBuilder } = require('./_helpers');

router.use(requireAuth, requireRole('admin'));

// GET /api/admin/audit?action_type=&admin_user_id=&target_type=&from=&to=&limit=
router.get('/', async (req, res) => {
  const { action_type, admin_user_id, target_type } = req.query;
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);

  const w = new WhereBuilder();
  w.add('a.action_type = ?', action_type);
  w.add('a.admin_user_id = ?', admin_user_id);
  w.add('a.target_type = ?', target_type);
  w.range('a.created_at', from, to);
  w.values.push(limit);

  try {
    const result = await pool.query(
      `SELECT a.action_id, a.action_type, a.target_type, a.target_id, a.details, a.created_at,
              u.user_id AS admin_user_id, u.full_name AS admin_name, u.email AS admin_email
       FROM admin_actions a
       JOIN users u ON u.user_id = a.admin_user_id
       ${w.clause()}
       ORDER BY a.created_at DESC
       LIMIT $${w.values.length}`,
      w.values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
