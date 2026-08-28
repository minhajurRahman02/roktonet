const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/organizations - list all organizations
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM organizations ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/organizations - create a new organization
router.post('/', async (req, res) => {
  const { name, org_type, district } = req.body;

  if (!name || !org_type || !district) {
    return res.status(400).json({ error: 'name, org_type, and district are all required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO organizations (name, org_type, district)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, org_type, district]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
