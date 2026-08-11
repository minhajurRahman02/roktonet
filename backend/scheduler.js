// Periodically re-solves the pending queue -- this is what eventually
// picks up routine/elective requests, which don't trigger an immediate
// solve (see routes/requests.js). Critical/urgent requests don't need
// this; they've already been solved by the time this runs.

const { runAllocationBatch } = require('./services/engineClient');

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
  }, intervalMs);
}

module.exports = { startScheduler };
