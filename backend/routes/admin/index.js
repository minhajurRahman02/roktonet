// Admin router (Phase 7.7). Mounted at /api/admin by server.js -- Node
// resolves require('./routes/admin') to this index.js, so server.js needs
// no change.
//
// Sub-routers by concern; see admin_module_specification.md Section 4.
//   /api/admin/users        -> users.js
//   /api/admin/analytics/*  -> analytics.js (incl. /activity-feed and /map)
//   /api/admin/broadcasts   -> broadcasts.js
//   /api/admin/audit        -> audit.js
//   /api/admin/reports      -> reports.js
//   /api/admin/run-batch    -> below

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { runAllocationBatch } = require('../../services/engineClient');
const { logAdminAction } = require('../../services/adminAudit');

router.use('/users', require('./users'));
router.use('/analytics', require('./analytics'));
router.use('/broadcasts', require('./broadcasts'));
router.use('/audit', require('./audit'));
router.use('/reports', require('./reports'));

// POST /api/admin/run-batch -- manual allocation trigger.
//
// SECURITY FIX (spec 4.1): this was the "TEMPORARY test route" from Chunk
// 4c and had NO authentication at all -- on the live deployment anyone on
// the internet could trigger the engine. Now admin-only and audit-logged.
router.post('/run-batch', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const started = Date.now();
    const result = await runAllocationBatch();
    const durationMs = Date.now() - started;
    await logAdminAction(req.user.user_id, 'batch_triggered', {
      details: {
        duration_ms: durationMs,
        processed: result?.processed ?? result?.processed_requests ?? null,
        summary: typeof result === 'object' ? Object.fromEntries(Object.entries(result).filter(([k]) => k !== 'assignments').slice(0, 10)) : result,
      },
    });
    res.json({ ...result, duration_ms: durationMs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
