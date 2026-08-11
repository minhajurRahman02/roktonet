const express = require('express');
const router = express.Router();
const pool = require('../db');
const { runAllocationBatch } = require('../services/engineClient');

// POST /api/requests - hospital submits a new blood request
router.post('/', async (req, res) => {
  const { org_id, blood_type, component, quantity, urgency_tier, needed_by_date } = req.body;

  if (!org_id || !blood_type || !component || !quantity || !urgency_tier) {
    return res.status(400).json({
      error: 'org_id, blood_type, component, quantity, and urgency_tier are required',
    });
  }

  // Section 7B: elective requests must carry a needed_by_date -- otherwise
  // there's no date for the feasibility/risk checks to plan against.
  if (urgency_tier === 'elective' && !needed_by_date) {
    return res.status(400).json({ error: 'needed_by_date is required for elective requests' });
  }

  try {
    const insertResult = await pool.query(
      `INSERT INTO requests (org_id, blood_type, component, quantity, urgency_tier, needed_by_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [org_id, blood_type, component, quantity, urgency_tier, needed_by_date || null]
    );
    let request = insertResult.rows[0];

    // Section 7A: critical/urgent requests can't wait for the next
    // scheduled batch -- re-solve the whole pending queue right now.
    // Routine/elective requests are left as-is; the scheduler (see
    // scheduler.js) will pick them up on its next run.
    if (urgency_tier === 'critical' || urgency_tier === 'urgent') {
      await runAllocationBatch();
      const refetch = await pool.query('SELECT * FROM requests WHERE request_id = $1', [
        request.request_id,
      ]);
      request = refetch.rows[0];
    }

    res.status(201).json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:id - check a request's status and fulfillment_path
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM requests WHERE request_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;