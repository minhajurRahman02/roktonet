const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parsePagination, queryPage } = require('../utils/pagination');
const { ROKTIM_DISTRICTS } = require('../constants/roktimDistricts');

// Roktim's entire backend footprint: this file, one table, and one line in
// server.js. Nothing else in the backend knows the module exists.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
// ---------------------------------------
// It does not call the forecast service. The browser does that directly, and
// the backend's only job is to persist what came back. That is what keeps the
// optimization engine and every existing route untouched, and it is the
// design's central trade.
//
// THE TRADE, STATED PLAINLY BECAUSE IT BELONGS IN THE REPORT
// ----------------------------------------------------------
// Because the advisory is computed in the browser and posted by the browser, a
// modified client could post a row describing an advisory Roktim never
// produced. Verifying it would mean this route re-calling the forecast service
// and comparing, which reintroduces exactly the coupling the design exists to
// avoid, and would make an elective request depend on a free-tier service
// being awake.
//
// The mitigation is scope rather than verification: the log has no clinical
// authority, drives no decision, and is read by admins only. Every field that
// could be abused is constrained below (enums, district allowlist, numeric
// ranges, org ownership), so a forged row can still only ever be a
// well-formed, plausible advisory attributed to the poster's own
// organisation. That is a bounded trade, not an oversight.

const BASIS = new Set(['observed_recent', 'seasonal_historical']);
const OUTLOOK = new Set(['normal', 'elevated', 'high', 'unavailable']);
const HORIZONS = new Set([1, 2, 4]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Null, or a finite number. Rejects strings, NaN and Infinity alike. */
function optionalNumber(value, field, errors) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    errors.push(`${field} must be a number or null`);
    return null;
  }
  return n;
}

// POST /api/roktim/advisories - record one advisory.
//
// Any logged-in organisation account may write, because any of them could in
// principle submit an elective request. Donors cannot: they have no org_id and
// submit nothing.
router.post('/advisories', requireAuth, requireRole('hospital', 'bank', 'ngo', 'admin'), async (req, res) => {
  const b = req.body || {};
  const errors = [];

  // Ownership first. An org may only ever log against itself; admin is
  // exempt because an admin acting in view-as is legitimately writing for
  // another org.
  if (!b.org_id) errors.push('org_id is required');
  if (req.user.role !== 'admin' && b.org_id !== req.user.org_id) {
    return res.status(403).json({ error: 'You may only log advisories for your own organization' });
  }

  // District must be one the model can actually answer for, in the model's
  // own spelling. A row naming a district the artefact has never heard of
  // could not have come from Roktim.
  if (!b.district || !ROKTIM_DISTRICTS.has(b.district)) {
    errors.push('district must be one of the 64 districts the forecast model covers');
  }

  if (!b.needed_by_date || !ISO_DATE.test(String(b.needed_by_date))) {
    errors.push('needed_by_date must be YYYY-MM-DD');
  }

  const horizon = Number(b.horizon_weeks);
  if (!HORIZONS.has(horizon)) errors.push('horizon_weeks must be 1, 2 or 4');

  if (!BASIS.has(b.basis)) errors.push(`basis must be one of: ${[...BASIS].join(', ')}`);
  if (!OUTLOOK.has(b.demand_outlook)) {
    errors.push(`demand_outlook must be one of: ${[...OUTLOOK].join(', ')}`);
  }
  if (typeof b.at_risk !== 'boolean') errors.push('at_risk must be a boolean');

  // Provenance. Supplied by the client from the forecast service's own /health
  // response rather than looked up here, because looking it up would mean this
  // route calling the forecast service. Required, not optional: a row that
  // cannot say which artefact produced it is worse than no row, since it would
  // silently acquire the meaning of whatever calibration is current when it is
  // eventually read.
  const schemaVersion = Number(b.model_schema_version);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    errors.push('model_schema_version must be a positive integer');
  }
  if (!b.model_generated || !ISO_DATE.test(String(b.model_generated))) {
    errors.push('model_generated must be YYYY-MM-DD');
  }

  const pressure = optionalNumber(b.pressure_ratio, 'pressure_ratio', errors);
  const normal = optionalNumber(b.seasonal_normal_adm, 'seasonal_normal_adm', errors);
  const upper = optionalNumber(b.projected_upper_adm, 'projected_upper_adm', errors);

  // The seasonal path has no demand-pressure signal at all. A row claiming a
  // pressure ratio on that path is internally inconsistent, so it is refused
  // rather than stored as something a later reader would have to second-guess.
  if (b.basis === 'seasonal_historical' && pressure !== null) {
    errors.push('pressure_ratio must be null on the seasonal_historical path');
  }
  if (b.demand_outlook === 'unavailable' && pressure !== null) {
    errors.push('pressure_ratio must be null when demand_outlook is unavailable');
  }

  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  try {
    const result = await pool.query(
      `INSERT INTO roktim_advisories
         (request_id, org_id, district, needed_by_date, horizon_weeks, basis,
          demand_outlook, pressure_ratio, seasonal_normal_adm,
          projected_upper_adm, at_risk, model_schema_version, model_generated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, created_at`,
      [
        b.request_id || null,
        b.org_id,
        b.district,
        b.needed_by_date,
        horizon,
        b.basis,
        b.demand_outlook,
        pressure,
        normal,
        upper,
        b.at_risk,
        schemaVersion,
        b.model_generated,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roktim/advisories - read the log. Admin only.
//
// Not readable by the organisation that wrote it, on purpose. An advisory is
// audit material about how the module behaved, not a record the hospital needs
// back; they already saw the advisory itself at the time.
router.get('/advisories', requireAuth, requireRole('admin'), async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });

  const values = [];
  const conditions = [];

  if (req.query.district) {
    values.push(req.query.district);
    conditions.push(`a.district = $${values.length}`);
  }
  if (req.query.basis) {
    if (!BASIS.has(req.query.basis)) return res.status(400).json({ error: 'unknown basis' });
    values.push(req.query.basis);
    conditions.push(`a.basis = $${values.length}`);
  }
  if (req.query.outlook) {
    if (!OUTLOOK.has(req.query.outlook)) return res.status(400).json({ error: 'unknown outlook' });
    values.push(req.query.outlook);
    conditions.push(`a.demand_outlook = $${values.length}`);
  }
  if (req.query.from) {
    if (!ISO_DATE.test(String(req.query.from))) return res.status(400).json({ error: 'from must be YYYY-MM-DD' });
    values.push(req.query.from);
    conditions.push(`a.created_at >= $${values.length}::date`);
  }
  if (req.query.to) {
    if (!ISO_DATE.test(String(req.query.to))) return res.status(400).json({ error: 'to must be YYYY-MM-DD' });
    // Inclusive of the whole end day, which is what a person picking a date
    // range means by it.
    values.push(req.query.to);
    conditions.push(`a.created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // LEFT JOIN, not JOIN: org_id carries no foreign key (see the migration's
  // note on keeping this table an island), so an org that has since been
  // removed must still show its advisories rather than silently dropping them
  // from the log.
  const rowsSql = `
    SELECT a.id, a.request_id, a.org_id, o.name AS org_name,
           a.district, a.needed_by_date, a.horizon_weeks, a.basis,
           a.demand_outlook, a.pressure_ratio, a.seasonal_normal_adm,
           a.projected_upper_adm, a.at_risk,
           a.model_schema_version, a.model_generated, a.created_at
      FROM roktim_advisories a
      LEFT JOIN organizations o ON o.org_id = a.org_id
      ${where}
     ORDER BY a.created_at DESC`;

  try {
    if (!pagination.paginated) {
      // Bare-array shape preserved for consistency with every other list
      // endpoint, capped so an unpaginated read of a table that has grown
      // cannot take the page down.
      const result = await pool.query(`${rowsSql} LIMIT 200`, values);
      return res.json(result.rows);
    }
    const countSql = `SELECT COUNT(*)::int AS total FROM roktim_advisories a ${where}`;
    const page = await queryPage(pool, { countSql, rowsSql, values, pagination });
    res.json(page);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roktim/advisories/stats - counts for the page's headline tiles.
// Admin only, same as the log itself.
router.get('/advisories/stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int                                            AS total,
             COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')::int AS last_30_days,
             COUNT(DISTINCT district)::int                            AS districts,
             COUNT(DISTINCT org_id)::int                              AS organizations,
             COUNT(*) FILTER (WHERE basis = 'seasonal_historical')::int AS seasonal_basis,
             MAX(created_at)                                          AS latest
        FROM roktim_advisories`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
