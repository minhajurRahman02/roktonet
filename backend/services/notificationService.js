// Hybrid notification system (decided in the fulfillment/notification
// planning session): in-app is the record of truth for every event;
// email fires only for critical/urgent-related events, reusing the same
// urgency-decides-the-channel logic Section 7A already uses for
// parallel vs. sequential donor fallback.

const pool = require('../db');
const { sendNotificationEmail } = require('./emailService');

const URGENT_TIERS = ['critical', 'urgent'];

// Always writes the in-app notification. Only emails when urgencyTier is
// critical/urgent -- callers that don't have an urgency_tier handy (e.g.
// a donor-confirmed event, which isn't itself urgency-tiered) can omit it
// and get in-app only, which is the safe default.
async function notifyOrg(orgId, type, message, relatedRequestId = null, urgencyTier = null) {
  await pool.query(
    `INSERT INTO notifications (org_id, type, message, related_request_id) VALUES ($1, $2, $3, $4)`,
    [orgId, type, message, relatedRequestId]
  );

  if (!URGENT_TIERS.includes(urgencyTier)) return;

  // Email every user tied to this org -- there's no concept of a single
  // "primary contact" yet, so everyone with a login under this org gets
  // notified. A simplifying assumption, fine at current team-account scale.
  try {
    const usersResult = await pool.query('SELECT email FROM users WHERE org_id = $1', [orgId]);
    await Promise.all(
      usersResult.rows.map((u) => sendNotificationEmail(u.email, message, relatedRequestId))
    );
  } catch (err) {
    // Email is a best-effort add-on -- the in-app notification above
    // already succeeded, so a delivery failure here shouldn't surface as
    // an error to whatever action triggered this (a donor confirming, a
    // bank dispatching, etc).
    console.error('[notifications] email delivery failed:', err.message);
  }
}

/**
 * Notifies one person directly, by user_id rather than by organization.
 *
 * WHY THIS HAD TO EXIST
 *
 * notifyOrg addresses an organization, and a donor's users row has
 * org_id = NULL. Donors were therefore unreachable by every notification
 * in the system except an admin broadcast. That was not a cosmetic gap:
 * donor fallback invites donors by writing donor_mobilizations rows, and
 * the donor was never told, so the feature depended on a message that
 * did not exist.
 *
 * The notifications table and GET /api/notifications already handle
 * user-addressed rows, because that is how broadcasts are delivered.
 * This just uses the same shape without pretending to be a broadcast.
 *
 * The email rule here is deliberately NOT the critical/urgent rule that
 * notifyOrg uses. A donor is not sitting in the app waiting; an
 * invitation they never see is the same as no invitation. So `email` is
 * an explicit argument and mobilization invites always pass true,
 * whatever the urgency tier.
 */
async function notifyUser(userId, type, message, relatedRequestId = null, email = false) {
  await pool.query(
    `INSERT INTO notifications (user_id, type, message, related_request_id) VALUES ($1, $2, $3, $4)`,
    [userId, type, message, relatedRequestId]
  );

  if (!email) return;

  try {
    const { rows } = await pool.query('SELECT email FROM users WHERE user_id = $1', [userId]);
    if (rows.length > 0 && rows[0].email) {
      await sendNotificationEmail(rows[0].email, message, relatedRequestId);
    }
  } catch (err) {
    console.error('[notifications] donor email delivery failed:', err.message);
  }
}

module.exports = { notifyOrg, notifyUser };
