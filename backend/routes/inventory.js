const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/inventory - list inventory, filterable by org, blood_type, component
// Example: /api/inventory?org_id=xxx&component=whole_blood
router.get('/', async (req, res) => {
  const { org_id, blood_type, component } = req.query;

  // Build the WHERE clause dynamically based on which filters were passed.
  // $1, $2, $3 are placeholders -- pg fills these in safely, which prevents
  // SQL injection (never build a query by directly pasting user input into it).
  const conditions = [];
  const values = [];

  if (org_id) {
    values.push(org_id);
    conditions.push(`org_id = $${values.length}`);
  }
  if (blood_type) {
    values.push(blood_type);
    conditions.push(`blood_type = $${values.length}`);
  }
  if (component) {
    values.push(component);
    conditions.push(`component = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT * FROM inventory_units ${whereClause} ORDER BY expiry_date`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});