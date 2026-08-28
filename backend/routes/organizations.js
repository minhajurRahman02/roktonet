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

