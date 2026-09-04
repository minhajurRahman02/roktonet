// Public, unauthenticated -- these feed the registration form's location
// datalists, which run before the person has any account/token. Static
// reference data only, no privacy concern.

const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/locations/districts - the 64 real districts, for the district datalist
router.get('/districts', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT district FROM bd_thanas ORDER BY district');
    res.json(result.rows.map((r) => r.district));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/thanas?district=X - thana/upazila names for that
// district only, for the cascading thana datalist (filtered, not the
// full 551-row list every time).
router.get('/thanas', async (req, res) => {
  const { district } = req.query;
  if (!district) {
    return res.status(400).json({ error: 'district is required' });
  }

  try {
    const result = await pool.query(
      'SELECT name FROM bd_thanas WHERE district = $1 ORDER BY name',
      [district]
    );
    res.json(result.rows.map((r) => r.name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
