// Admin -> audit log. Spec section 4.6. Read-only by design: there is no
// endpoint anywhere that updates or deletes admin_actions rows.

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { parseDateRange, WhereBuilder } = require('./_helpers');
const { parsePagination, queryPage } = require('../../utils/pagination');

router.use(requireAuth, requireRole('admin'));

// GET /api/admin/audit?action_type=&admin_user_id=&target_type=&from=&to=&limit=
router.get('/', async (req, res) => {
  const { action_type, admin_user_id, target_type } = req.query;
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  const w = new WhereBuilder();
  w.add('a.action_type = ?', action_type);
  w.add('a.admin_user_id = ?', admin_user_id);
  w.add('a.target_type = ?', target_type);
  w.range('a.created_at', from, to);
  // NOTE: the old `w.values.push(limit)` that stood here is GONE on purpose.
  // It mutated the builder's own array, which would corrupt the bind
  // positions for the paginated path below. The cap is now appended to a
  // copy, only on the branch that actually uses it.

  const selectSql = `SELECT a.action_id, a.action_type, a.target_type, a.target_id, a.details, a.created_at,
              u.user_id AS admin_user_id, u.full_name AS admin_name, u.email AS admin_email
       FROM admin_actions a
       JOIN users u ON u.user_id = a.admin_user_id
       ${w.clause()}
       ORDER BY a.created_at DESC`;

  try {
    if (!pagination.paginated) {
      // ?limit= keeps its ORIGINAL meaning here: a hard cap, not a page
      // size. AuditLog.jsx has been sending limit=300 since 7.7 and must
      // keep receiving a plain array.
      const values = [...w.values, limit];
      const result = await pool.query(`${selectSql} LIMIT $${values.length}`, values);
      return res.json(result.rows);
    }
    // Paginated callers get the real total, which is what finally removes
    // the silent truncation: before this, an audit log with 1200 entries
    // showed 300 and said nothing about the other 900.
    res.json(await queryPage(pool, {
      countSql: `SELECT COUNT(*)::int AS total FROM admin_actions a
                 JOIN users u ON u.user_id = a.admin_user_id ${w.clause()}`,
      rowsSql: selectSql,
      values: w.values,
      pagination,
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
