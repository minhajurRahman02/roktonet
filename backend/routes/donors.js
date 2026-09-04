const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// POST /api/donors was removed (decided in the location-precision planning
// session) -- superseded entirely by POST /api/auth/register, which now
// creates both the users and donors rows together for role='donor'.

// GET /api/donors/:id - view a donor's profile/history.
// Was previously fully public -- fixed here (this was decided last
// session but never actually implemented; correcting that now). Only the
// donor themselves or an admin can view it. Hospitals reach donor contact
// info through GET /api/mobilizations/:requestId instead, which only
// exposes it for donors who've confirmed a specific invite -- this
// endpoint isn't the path for that, so it doesn't need a hospital case.
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM donors WHERE donor_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    const donor = result.rows[0];
    const isSelf = donor.user_id && donor.user_id === req.user.user_id;
    const isAdmin = req.user.role === 'admin';
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this donor record' });
    }

    res.json(donor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;