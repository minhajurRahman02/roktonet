// Admin -> broadcasts. Spec section 4.5, decision 2.6.
//
// A broadcast resolves to a recipient set (union of the chosen roles and
// the explicitly chosen users, deduplicated, active accounts only) and
// inserts ONE notification row per recipient. is_read is per-recipient,
// so per-row is the only model where "mark as read" stays correct. All
// rows share a broadcast_id so the history view can group them.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../../db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { logAdminAction } = require('../../services/adminAudit');
const { parseDateRange, WhereBuilder } = require('./_helpers');
const { parsePagination, queryPage } = require('../../utils/pagination');

const VALID_ROLES = ['hospital', 'bank', 'ngo', 'donor', 'admin'];

router.use(requireAuth, requireRole('admin'));

// Resolves {roles, user_ids} to a deduplicated list of active users.
// Shared by the preview endpoint and the send endpoint so the count the
// admin sees before sending is exactly the count that gets sent.
async function resolveRecipients(roles = [], userIds = []) {
  const conditions = [];
  const values = [];
  if (roles.length) { values.push(roles); conditions.push(`role = ANY($${values.length}::text[])`); }
  if (userIds.length) { values.push(userIds); conditions.push(`user_id = ANY($${values.length}::uuid[])`); }
  if (!conditions.length) return [];
  const result = await pool.query(
    `SELECT user_id, org_id, role, email, full_name FROM users
     WHERE is_active = true AND (${conditions.join(' OR ')})`,
    values
  );
  return result.rows;
}

function validateTargets(body) {
  const roles = Array.isArray(body.roles) ? body.roles : [];
  const userIds = Array.isArray(body.user_ids) ? body.user_ids : [];
  const badRole = roles.find((r) => !VALID_ROLES.includes(r));
  if (badRole) return { error: `Invalid role: ${badRole}` };
  if (!roles.length && !userIds.length) return { error: 'Provide at least one role or user_id' };
  return { roles, userIds };
}

// POST /api/admin/broadcasts/preview -- how many people would receive it.
router.post('/preview', async (req, res) => {
  const t = validateTargets(req.body);
  if (t.error) return res.status(400).json({ error: t.error });
  try {
    const recipients = await resolveRecipients(t.roles, t.userIds);
    const byRole = {};
    recipients.forEach((u) => { byRole[u.role] = (byRole[u.role] || 0) + 1; });
    res.json({ recipient_count: recipients.length, by_role: byRole });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/broadcasts -- { message, roles: [...], user_ids: [...] }
router.post('/', async (req, res) => {
  const message = (req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 1000) return res.status(400).json({ error: 'message must be 1000 characters or fewer' });
  const t = validateTargets(req.body);
  if (t.error) return res.status(400).json({ error: t.error });

  try {
    const recipients = await resolveRecipients(t.roles, t.userIds);
    if (recipients.length === 0) return res.status(400).json({ error: 'No active recipients match those targets' });

    const broadcastId = crypto.randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Multi-row insert built with placeholders, never string-concatenated.
      const values = [];
      const tuples = recipients.map((u, i) => {
        const b = i * 4;
        values.push(u.user_id, message, broadcastId, u.org_id);
        return `($${b + 1}, 'admin_broadcast', $${b + 2}, $${b + 3}, $${b + 4})`;
      });
      await client.query(
        `INSERT INTO notifications (user_id, type, message, broadcast_id, org_id) VALUES ${tuples.join(', ')}`,
        values
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await logAdminAction(req.user.user_id, 'broadcast_sent', {
      targetType: 'broadcast', targetId: broadcastId,
      details: { message, roles: t.roles, user_ids: t.userIds, recipient_count: recipients.length },
    });

    res.status(201).json({ broadcast_id: broadcastId, recipient_count: recipients.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/broadcasts -- history, one row per broadcast (grouped),
// with recipient and read counts. Sourced from the audit log's details for
// the targets, and from notifications for the live read state.
router.get('/', async (req, res) => {
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });
  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  const w = new WhereBuilder();
  w.raw("a.action_type = 'broadcast_sent'");
  w.range('a.created_at', from, to);

  const rowsSql = `SELECT a.action_id, a.target_id AS broadcast_id, a.details, a.created_at,
              u.full_name AS admin_name, u.email AS admin_email,
              COUNT(n.notification_id) AS recipient_count,
              COUNT(n.notification_id) FILTER (WHERE n.is_read) AS read_count
       FROM admin_actions a
       JOIN users u ON u.user_id = a.admin_user_id
       LEFT JOIN notifications n ON n.broadcast_id = a.target_id
       ${w.clause()}
       GROUP BY a.action_id, u.full_name, u.email
       ORDER BY a.created_at DESC`;

  const toNumbers = (rows) => rows.map((r) => ({
    ...r, recipient_count: Number(r.recipient_count), read_count: Number(r.read_count),
  }));

  try {
    if (!pagination.paginated) {
      const result = await pool.query(rowsSql, w.values);
      return res.json(toNumbers(result.rows));
    }
    // Counting broadcasts, not broadcast-recipient pairs. A plain COUNT(*)
    // over the grouped query counts one row per group PER NOTIFICATION, so
    // the total would come back several times too large and the page count
    // would trail off into empty pages.
    const page = await queryPage(pool, {
      countSql: `SELECT COUNT(*)::int AS total FROM (
                   SELECT a.action_id FROM admin_actions a
                   JOIN users u ON u.user_id = a.admin_user_id
                   ${w.clause()}
                   GROUP BY a.action_id
                 ) grouped`,
      rowsSql,
      values: w.values,
      pagination,
    });
    res.json({ ...page, data: toNumbers(page.data) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
