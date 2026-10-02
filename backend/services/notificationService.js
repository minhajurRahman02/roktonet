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
 
}

module.exports = { notifyOrg };
