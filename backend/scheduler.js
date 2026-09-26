// Periodically re-solves the pending queue -- this is what eventually
// picks up routine/elective requests, which don't trigger an immediate
// solve (see routes/requests.js). Critical/urgent requests don't need
// this; they've already been solved by the time this runs.

const { runAllocationBatch } = require('./services/engineClient');
const { escalateStaleMobilizations } = require('./services/donorFallback');
const { notifyOverdueDrives } = require('./services/driveNotifications');

function startScheduler() {
  const intervalMs = parseInt(process.env.BATCH_INTERVAL_MS, 10) || 5 * 60 * 1000; // default: 5 minutes

  console.log(`Scheduled batch solver active, running every ${intervalMs / 1000}s`);

  setInterval(async () => {
    try {
      const result = await runAllocationBatch();
      console.log('[Scheduled batch]', result);
    } catch (err) {
      console.error('[Scheduled batch] failed:', err.message);
    }

    try {
      const escalations = await escalateStaleMobilizations();
      if (escalations.length > 0) {
        console.log('[Escalation]', escalations);
      }
    } catch (err) {
      console.error('[Escalation] failed:', err.message);
    }

    // Drives whose date passed while they were still only planned.
    // Rides this timer rather than getting one of its own: it is a
    // single indexed query, and each drive is reported once because
    // the query stamps overdue_notified_at as it claims the row.
    //
    // In its own try/catch like the two above, so a failure here cannot
    // stop the next tick's allocation batch. The ordering is deliberate
    // too: allocation runs first because blood moving matters more than
    // a reminder.
    try {
      const overdue = await notifyOverdueDrives();
      if (overdue.length > 0) {
        console.log('[Overdue drives]', overdue);
      }
    } catch (err) {
      console.error('[Overdue drives] failed:', err.message);
    }
  }, intervalMs);
}

module.exports = { startScheduler };