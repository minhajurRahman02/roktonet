// Single helper for writing to admin_actions -- every admin write, view-as
// session, broadcast, and report generation calls this, rather than each
// route building its own INSERT. Same pattern as requestEvents.js.
//
// Deliberately never throws: an audit-write failure must not roll back or
// mask the admin action it's recording. It logs loudly instead, so a
// broken audit trail is visible in the server logs rather than silent.

const pool = require('../db');

// action_type values in use (documented here, not DB-enforced):
//   batch_triggered, user_updated, user_deactivated, user_reactivated,
//   admin_created, request_cancelled, inventory_updated, org_updated,
//   org_created, broadcast_sent, view_as_started, report_generated

/**
 * @param {string} adminUserId - req.user.user_id of the acting admin
 * @param {string} actionType - one of the documented values above
 * @param {object} [opts]
 * @param {string} [opts.targetType] - 'user' | 'request' | 'inventory_unit' | 'organization' | 'broadcast' | 'report'
 * @param {string} [opts.targetId]
 * @param {object} [opts.details] - structured context (what changed, counts, filters)
 */
async function logAdminAction(adminUserId, actionType, { targetType = null, targetId = null, details = null } = {}) {
  try {
    await pool.query(
      `INSERT INTO admin_actions (admin_user_id, action_type, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminUserId, actionType, targetType, targetId, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('[adminAudit] failed to record action:', actionType, err.message);
  }
}

module.exports = { logAdminAction };
