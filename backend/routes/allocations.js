const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, queryPage } = require('../utils/pagination');

// GET /api/allocations - all allocations where the caller's org is the
// SOURCE (i.e. "outgoing" from a bank/NGO's point of view), across every
// request, not just one. This is the reverse direction of
// GET /api/requests/:id/allocation (which looks up one request's sources)
// -- that endpoint answers "who's supplying my request", this one answers
// "which of my units are supplying which requests". Needed for the Blood
// Bank dashboard's Outgoing Allocations page.
router.get('/', requireAuth, async (req, res) => {
  let orgId = req.user.org_id;

  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  // Admin can look at any org's outgoing allocations via ?org_id=; every
  // other role is locked to their own org regardless of what they pass.
  if (req.user.role === 'admin' && req.query.org_id) {
    orgId = req.query.org_id;
  }
  if (!orgId) {
    return res.status(400).json({ error: 'org_id is required (admin only) or you must belong to an organization' });
  }

  // --- direction -------------------------------------------------------
  //
  // outgoing (default): units this org SUPPLIED, for a bank or NGO. Filters
  //   on iu.org_id, and deliberately carries NO patient fields -- see below.
  // incoming: units allocated TO this org's requests, for a hospital's
  //   allocation log. Same four joins, same shape; the only real difference
  //   is which side of the join the org filter lands on.
  //
  // One endpoint rather than two because the query is genuinely the same
  // question asked from opposite ends, and splitting it would mean two
  // places to keep the joins and the pagination count in sync.
  const incoming = req.query.direction === 'incoming';

  // PATIENT FIELDS APPEAR IN THE INCOMING DIRECTION ONLY.
  //
  // Incoming is read by the hospital that filed the request (or admin), so
  // the patient is their own. Outgoing is read by the blood bank or NGO that
  // supplied the units, and they have no clinical involvement with the
  // recipient -- a bank in another district has no reason to hold a named
  // individual's phone number, and PII cannot be un-shared once it has been.
  // Keeping the columns out of the outgoing SELECT means there is no code
  // path that can leak them, rather than a frontend that chooses not to
  // render them.
  const patientCols = incoming
    ? ', r.patient_name, r.patient_phone, r.patient_note'
    : '';
  const orgFilter = incoming ? 'r.org_id = $1' : 'iu.org_id = $1';

  const rowsSql = `SELECT ar.unit_id, ar.request_id, ar.allocated_at,
              iu.blood_type, iu.component, iu.status,
              iu.org_id AS source_org_id, src.name AS source_org_name,
              src.district AS source_org_district,
              r.urgency_tier, r.quantity AS request_quantity, r.created_at AS request_created_at,
              r.org_id AS hospital_org_id,
              o.name AS hospital_name, o.district AS hospital_district${patientCols}
       FROM allocation_records ar
       JOIN inventory_units iu ON iu.unit_id = ar.unit_id
       JOIN requests r ON r.request_id = ar.request_id
       JOIN organizations o ON o.org_id = r.org_id
       JOIN organizations src ON src.org_id = iu.org_id
       WHERE ${orgFilter}
       ORDER BY r.created_at DESC`;

  try {
    if (!pagination.paginated) {
      const result = await pool.query(rowsSql, [orgId]);
      return res.json(result.rows);
    }
    // Every join stays in the count. All are inner joins, so each can
    // exclude rows, and dropping any would give a total larger than the page
    // query can ever return.
    res.json(await queryPage(pool, {
      countSql: `SELECT COUNT(*)::int AS total
                 FROM allocation_records ar
                 JOIN inventory_units iu ON iu.unit_id = ar.unit_id
                 JOIN requests r ON r.request_id = ar.request_id
                 JOIN organizations o ON o.org_id = r.org_id
                 JOIN organizations src ON src.org_id = iu.org_id
                 WHERE ${orgFilter}`,
      rowsSql,
      values: [orgId],
      pagination,
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
