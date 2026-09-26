// Time-based notifications about blood drives.
//
// Everything else in the notification system fires synchronously inside
// a request handler: somebody dispatched a unit, somebody confirmed a
// delivery. This file holds the notifications that nobody triggers,
// where the event IS the passage of time.
//
// It runs on the scheduler's existing timer rather than a new one.
// There is no reason for a second interval: the work is one indexed
// query, and drive lateness is not measured in seconds.

const pool = require('../db');
const { notifyOrg } = require('./notificationService');

/**
 * Reminds an NGO about a drive whose date has passed while it still sits
 * at 'planned'.
 *
 * This does NOT cancel, close or otherwise touch the drive. A drive that
 * ran late is completely normal and the NGO can still start it, which is
 * exactly what the existing behaviour allows. The only problem was that
 * a drive scheduled and then forgotten looked identical to one that was
 * never going to happen, and nothing said so.
 *
 * overdue_notified_at is stamped in the SAME statement that selects the
 * drives, using UPDATE ... RETURNING. Doing it as a select-then-update
 * pair would leave a window where two overlapping scheduler ticks both
 * read the same drive and both notify; here the row is claimed by
 * whichever transaction gets there first, and the other sees no rows.
 */
async function notifyOverdueDrives() {
  const { rows } = await pool.query(
    `UPDATE donor_drives d
        SET overdue_notified_at = now()
      WHERE d.status = 'planned'
        AND d.drive_date < CURRENT_DATE
        AND d.overdue_notified_at IS NULL
    RETURNING d.drive_id, d.org_id, d.title, d.drive_date`
  );

  for (const drive of rows) {
    // floor, not round. drive_date is a DATE, so it parses as midnight;
    // rounding turns a drive three days and four hours late into "4 days
    // ago", which is wrong on the face of it to anyone who knows when
    // they scheduled it.
    const daysLate = Math.max(
      1,
      Math.floor((Date.now() - new Date(drive.drive_date).getTime()) / 86400000)
    );
    await notifyOrg(
      drive.org_id,
      'drive_overdue',
      `"${drive.title}" was scheduled ${daysLate} day${daysLate === 1 ? '' : 's'} ago `
      + 'and has not been started yet. You can still run it, or cancel it if the plans changed.'
      // No urgency tier, so this stays in-app. A drive running late is
      // worth seeing next time the NGO opens RoktoNet; it is not worth
      // an email at two in the morning.
    );
  }

  return rows.map((d) => ({ drive_id: d.drive_id, title: d.title, drive_date: d.drive_date }));
}

module.exports = { notifyOverdueDrives };
