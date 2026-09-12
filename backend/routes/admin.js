// TEMPORARY test route -- lets us manually trigger a batch solve to verify
// the Node<->Python wiring works, before Chunk 4c adds real automatic
// triggers (immediate for critical/urgent, scheduled for the rest).
// This route can be removed or kept as an admin/debug tool later.

const express = require('express');
const router = express.Router();
const { runAllocationBatch } = require('../services/engineClient');

router.post('/run-batch', async (req, res) => {
  try {
    const result = await runAllocationBatch();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
