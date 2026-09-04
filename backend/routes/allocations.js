const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/allocations - all allocations where the caller's org is the
// SOURCE (i.e. "outgoing" from a bank/NGO's point of view), across every
// request, not just one. This is the reverse direction of
// GET /api/requests/:id/allocation (which looks up one request's sources)
// -- that endpoint answers "who's supplying my request", this one answers
// "which of my units are supplying which requests". Needed for the Blood
// Bank dashboard's Outgoing Allocations page.
router.get('/', requireAuth, async (req, res) => {
  let orgId = req.user.org_id;

  // Admin can look at any org's outgoing allocations via ?org_id=; every
  // other role is locked to their own org regardless of what they pass.
  if (req.user.role === 'admin' && req.query.org_id) {
    orgId = req.query.org_id;
  }
  if (!orgId) {
    return res.status(400).json({ error: 'org_id is required (admin only) or you must belong to an organization' });
  }

  try {
    const result = await pool.query(
      `SELECT ar.unit_id, ar.request_id, iu.blood_type, iu.component, iu.status,
              r.urgency_tier, r.org_id AS hospital_org_id,
              o.name AS hospital_name, o.district AS hospital_district
       FROM allocation_records ar
       JOIN inventory_units iu ON iu.unit_id = ar.unit_id
       JOIN requests r ON r.request_id = ar.request_id
       JOIN organizations o ON o.org_id = r.org_id
       WHERE iu.org_id = $1
       ORDER BY r.created_at DESC`,
      [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
