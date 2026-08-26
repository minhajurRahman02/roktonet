const express = require('express');
const router = express.Router();
const pool = require('../db');
const { logRequestEvent } = require('../services/requestEvents');

// GET /api/mobilizations/:requestId - see which donors were invited for a request
router.get('/:requestId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM donor_mobilizations WHERE request_id = $1',
      [req.params.requestId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mobilizations/:id/respond - donor confirms or declines an invite
router.post('/:id/respond', async (req, res) => {
  const { invite_status, slot_date } = req.body;

  if (!['confirmed', 'declined'].includes(invite_status)) {
    return res.status(400).json({ error: "invite_status must be 'confirmed' or 'declined'" });
  }

  try {
    const result = await pool.query(
      `UPDATE donor_mobilizations
       SET invite_status = $1, slot_date = $2
       WHERE mobilization_id = $3
       RETURNING *`,
      [invite_status, slot_date || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mobilization record not found' });
    }
    const mobilization = result.rows[0];

    // Anonymized -- no donor identity in the log, matching the same
    // privacy stance already applied to the hospital-facing request
    // detail view (counts only, never who).
    await logRequestEvent(
      mobilization.request_id,
      'donor_responded',
      invite_status === 'confirmed' ? 'A donor confirmed availability' : 'A donor declined',
      { invite_status }
    );

    res.json(mobilization);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;