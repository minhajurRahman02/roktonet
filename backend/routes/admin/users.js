// Admin -> users. Spec sections 4.2, 2.1, 2.2, 2.5, 2.9.
//
// The one place the system lists accounts across every role. Before this
// existed, admin had no way to see users at all -- only orgs and donors.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../../db');
const { requireAuth, requireRole, requirePrimaryAdmin } = require('../../middleware/auth');
const { logAdminAction } = require('../../services/adminAudit');
const { sendPasswordResetEmail } = require('../../services/emailService');
const { parseDateRange, WhereBuilder } = require('./_helpers');

// Same values as routes/auth.js and routes/donors.js -- kept identical on
// purpose so an admin-created account behaves exactly like any other.
const BCRYPT_ROUNDS = 10;
const INVITE_TOKEN_TTL_HOURS = 168; // 7 days
const VIEW_AS_TTL = '10m';

// Never selected anywhere in this file: password_hash, verification_token,
// token_expires_at, reset_token, reset_token_expires_at. Admin sees who a
// user is, never their secrets.
const USER_COLUMNS = `u.user_id, u.org_id, u.role, u.email, u.full_name, u.is_verified,
  u.is_active, u.is_primary_admin, u.avatar_url, u.created_at`;

router.use(requireAuth, requireRole('admin'));

// GET /api/admin/users
// Filters: role, org_id, is_verified, is_active, search (name/email), from, to
router.get('/', async (req, res) => {
  const { role, org_id, is_verified, is_active, search } = req.query;
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });

  const w = new WhereBuilder();
  w.add('u.role = ?', role);
  w.add('u.org_id = ?', org_id);
  if (is_verified === 'true' || is_verified === 'false') w.add('u.is_verified = ?', is_verified === 'true');
  if (is_active === 'true' || is_active === 'false') w.add('u.is_active = ?', is_active === 'true');
  if (search) {
    w.values.push(`%${search}%`);
    w.conditions.push(`(u.full_name ILIKE $${w.values.length} OR u.email ILIKE $${w.values.length})`);
  }
  w.range('u.created_at', from, to);

  try {
    const result = await pool.query(
      `SELECT ${USER_COLUMNS}, o.name AS org_name, o.org_type
       FROM users u
       LEFT JOIN organizations o ON o.org_id = u.org_id
       ${w.clause()}
       ORDER BY u.created_at DESC`,
      w.values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:id -- full drill-down. Profile + org + a role-
// specific bundle assembled from the tables that role actually touches.
router.get('/:id', async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT ${USER_COLUMNS}, o.name AS org_name, o.org_type, o.district AS org_district
       FROM users u LEFT JOIN organizations o ON o.org_id = u.org_id
       WHERE u.user_id = $1`,
      [req.params.id]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];

    const bundle = {};

    if (user.role === 'hospital' && user.org_id) {
      const r = await pool.query(
        `SELECT request_id, blood_type, component, quantity, urgency_tier, fulfillment_path,
                needed_by_date, cancelled_at, created_at
         FROM requests WHERE org_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [user.org_id]
      );
      bundle.requests = r.rows;
    }

    if ((user.role === 'bank' || user.role === 'ngo') && user.org_id) {
      const [inv, alloc, drives, restock] = await Promise.all([
        pool.query(
          `SELECT unit_id, blood_type, component, status, collection_date, expiry_date, drive_id, created_at
           FROM inventory_units WHERE org_id = $1 ORDER BY expiry_date LIMIT 200`,
          [user.org_id]
        ),
        pool.query(
          `SELECT ar.request_id, ar.unit_id, ar.allocated_at, ar.distance_km,
                  iu.blood_type, iu.status, r.urgency_tier, o.name AS hospital_name
           FROM allocation_records ar
           JOIN inventory_units iu ON iu.unit_id = ar.unit_id
           JOIN requests r ON r.request_id = ar.request_id
           JOIN organizations o ON o.org_id = r.org_id
           WHERE iu.org_id = $1 ORDER BY ar.allocated_at DESC LIMIT 100`,
          [user.org_id]
        ),
        pool.query(
          `SELECT drive_id, title, location, drive_date, target_units, status, created_at
           FROM donor_drives WHERE org_id = $1 ORDER BY drive_date DESC`,
          [user.org_id]
        ),
        pool.query(
          `SELECT request_id, blood_type, component, quantity, fulfillment_path, cancelled_at, created_at
           FROM requests WHERE org_id = $1 AND urgency_tier = 'restock' ORDER BY created_at DESC LIMIT 50`,
          [user.org_id]
        ),
      ]);
      bundle.inventory = inv.rows;
      bundle.outgoing_allocations = alloc.rows;
      bundle.drives = drives.rows;
      bundle.restock_requests = restock.rows;
    }

    if (user.role === 'donor') {
      const donorResult = await pool.query(
        `SELECT d.*, o.name AS org_name FROM donors d
         LEFT JOIN organizations o ON o.org_id = d.org_id
         WHERE d.user_id = $1`,
        [user.user_id]
      );
      const donor = donorResult.rows[0] || null;
      bundle.donor = donor;
      if (donor) {
        const [history, invites] = await Promise.all([
          pool.query(
            `SELECT iu.unit_id, iu.blood_type, iu.component, iu.collection_date, iu.status,
                    iu.drive_id, dd.title AS drive_title, o.name AS org_name
             FROM inventory_units iu
             LEFT JOIN donor_drives dd ON dd.drive_id = iu.drive_id
             LEFT JOIN organizations o ON o.org_id = iu.org_id
             WHERE iu.donor_id = $1 ORDER BY iu.collection_date DESC`,
            [donor.donor_id]
          ),
          pool.query(
            `SELECT dm.mobilization_id, dm.invite_status, dm.slot_date, dm.request_id,
                    r.blood_type, r.urgency_tier, o.name AS requesting_org_name
             FROM donor_mobilizations dm
             JOIN requests r ON r.request_id = dm.request_id
             JOIN organizations o ON o.org_id = r.org_id
             WHERE dm.donor_id = $1 ORDER BY dm.mobilization_id DESC`,
            [donor.donor_id]
          ),
        ]);
        bundle.donation_history = history.rows;
        bundle.invites = invites.rows;
      }
    }

    if (user.role === 'admin') {
      const actions = await pool.query(
        `SELECT action_id, action_type, target_type, target_id, details, created_at
         FROM admin_actions WHERE admin_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [user.user_id]
      );
      bundle.recent_actions = actions.rows;
    }

    // Notifications addressed to this user directly (broadcasts) or their org.
    const notifs = await pool.query(
      `SELECT notification_id, type, message, is_read, created_at
       FROM notifications WHERE user_id = $1 OR ($2::uuid IS NOT NULL AND org_id = $2)
       ORDER BY created_at DESC LIMIT 20`,
      [user.user_id, user.org_id]
    );
    bundle.notifications = notifs.rows;

    res.json({ user, ...bundle });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id -- full_name, email, org_id, is_active.
// Deliberately NOT role (spec 2.2) and NOT is_primary_admin (spec 2.9).
router.patch('/:id', async (req, res) => {
  const { full_name, email, org_id, is_active } = req.body;

  if (req.body.role !== undefined) {
    return res.status(400).json({ error: 'role cannot be changed; deactivate and create a new account instead' });
  }
  if (req.body.is_primary_admin !== undefined) {
    return res.status(400).json({ error: 'is_primary_admin cannot be set through the API' });
  }

  try {
    const existing = await pool.query(
      'SELECT user_id, role, email, org_id, is_active, is_primary_admin FROM users WHERE user_id = $1',
      [req.params.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const target = existing.rows[0];

    // An admin can't edit another admin, and nobody can touch the primary
    // admin via this route (spec 8: out of scope). Admins edit their own
    // profile through PATCH /api/auth/me like everyone else.
    if (target.role === 'admin' && target.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Admin accounts cannot be edited by other admins' });
    }
    if (target.is_primary_admin && is_active === false) {
      return res.status(403).json({ error: 'The primary admin cannot be deactivated' });
    }
    if (target.user_id === req.user.user_id && is_active === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    // org_id only makes sense for org-bound roles; a donor/admin with an
    // org would be a data-model violation.
    if (org_id !== undefined && org_id !== null && !['hospital', 'bank', 'ngo'].includes(target.role)) {
      return res.status(400).json({ error: `A ${target.role} account cannot be assigned to an organization` });
    }
    if (org_id) {
      const org = await pool.query('SELECT org_id FROM organizations WHERE org_id = $1', [org_id]);
      if (org.rows.length === 0) return res.status(400).json({ error: 'Organization not found' });
    }

    const sets = [];
    const values = [];
    const changes = {};
    if (full_name !== undefined) { values.push(full_name); sets.push(`full_name = $${values.length}`); changes.full_name = full_name; }
    if (email !== undefined) {
      const lower = String(email).toLowerCase();
      const clash = await pool.query('SELECT user_id FROM users WHERE email = $1 AND user_id <> $2', [lower, target.user_id]);
      if (clash.rows.length > 0) return res.status(409).json({ error: 'An account with that email already exists' });
      values.push(lower); sets.push(`email = $${values.length}`); changes.email = { from: target.email, to: lower };
    }
    if (org_id !== undefined) { values.push(org_id); sets.push(`org_id = $${values.length}`); changes.org_id = { from: target.org_id, to: org_id }; }
    if (is_active !== undefined) { values.push(Boolean(is_active)); sets.push(`is_active = $${values.length}`); changes.is_active = { from: target.is_active, to: Boolean(is_active) }; }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(target.user_id);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE user_id = $${values.length}
       RETURNING user_id, org_id, role, email, full_name, is_verified, is_active, is_primary_admin, avatar_url, created_at`,
      values
    );

    // Deactivation/reactivation get their own action types so the audit
    // log can be filtered for them specifically; everything else is a
    // generic user_updated with the field-level diff in details.
    let actionType = 'user_updated';
    if (is_active === false && target.is_active !== false) actionType = 'user_deactivated';
    else if (is_active === true && target.is_active === false) actionType = 'user_reactivated';
    await logAdminAction(req.user.user_id, actionType, { targetType: 'user', targetId: target.user_id, details: changes });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users -- create another admin. PRIMARY ADMIN ONLY.
// Reuses the invite-login pattern from routes/donors.js exactly: a random
// placeholder hash nobody knows, plus a set-your-password link through the
// existing reset mechanism. Nothing sensitive is ever emailed.
router.post('/', requirePrimaryAdmin, async (req, res) => {
  const { email, full_name } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });
  const lower = String(email).toLowerCase();

  try {
    const clash = await pool.query('SELECT user_id FROM users WHERE email = $1', [lower]);
    if (clash.rows.length > 0) return res.status(409).json({ error: 'An account with that email already exists' });

    const placeholderPassword = crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(placeholderPassword, BCRYPT_ROUNDS);
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO users (org_id, role, email, password_hash, full_name, is_verified, is_active, is_primary_admin,
                          reset_token, reset_token_expires_at)
       VALUES (NULL, 'admin', $1, $2, $3, true, true, false, $4, $5)
       RETURNING user_id, email, role, full_name, is_verified, is_active, is_primary_admin, created_at`,
      [lower, passwordHash, full_name || null, resetToken, expiresAt]
    );
    const newAdmin = result.rows[0];

    await logAdminAction(req.user.user_id, 'admin_created', {
      targetType: 'user', targetId: newAdmin.user_id, details: { email: lower },
    });

    try {
      await sendPasswordResetEmail(lower, resetToken);
    } catch (emailErr) {
      console.error('[admin/users] set-password email failed:', emailErr.message);
      return res.status(201).json({
        user: newAdmin,
        message: 'Admin account created, but the set-password email could not be sent.',
        email_delivery_failed: true,
      });
    }

    res.status(201).json({ user: newAdmin, message: 'Admin created. They can set their password from the emailed link.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:id/view-token -- read-only view-as (spec 2.5).
// Mints a short-lived JWT AS the target user, carrying readonly + who is
// impersonating. requireAuth refuses any non-GET made with it. The
// frontend keeps it out of the auth cookie so the admin's own session is
// never replaced.
router.post('/:id/view-token', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, org_id, role, email, full_name, is_active FROM users WHERE user_id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const target = result.rows[0];

    if (target.role === 'admin') {
      return res.status(400).json({ error: 'View-as is for non-admin accounts' });
    }
    if (target.is_active === false) {
      return res.status(400).json({ error: 'Cannot view as a deactivated account' });
    }

    // Same shape as the login payload (identity + authorization only, no
    // secrets), plus the two view-as claims.
    const token = jwt.sign(
      {
        user_id: target.user_id,
        email: target.email,
        role: target.role,
        org_id: target.org_id,
        readonly: true,
        impersonated_by: req.user.user_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: VIEW_AS_TTL }
    );

    await logAdminAction(req.user.user_id, 'view_as_started', {
      targetType: 'user', targetId: target.user_id, details: { role: target.role, email: target.email, ttl: VIEW_AS_TTL },
    });

    res.json({
      token,
      expires_in: VIEW_AS_TTL,
      viewing: { user_id: target.user_id, full_name: target.full_name, email: target.email, role: target.role, org_id: target.org_id },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
