const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /api/donors - register a donor
router.post('/', async (req, res) => {
  const { org_id, blood_type, last_donation_date, eligibility_status } = req.body;

  if (!blood_type) {
    return res.status(400).json({ error: 'blood_type is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO donors (org_id, blood_type, last_donation_date, eligibility_status)
       VALUES ($1, $2, $3, COALESCE($4, 'eligible'))
       RETURNING *`,
      [org_id || null, blood_type, last_donation_date || null, eligibility_status || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/donors/:id - view a donor's profile/history
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM donors WHERE donor_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
