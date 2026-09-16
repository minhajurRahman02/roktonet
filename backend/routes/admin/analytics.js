// Admin -> analytics. Spec section 4.4, decisions 2.8, 2.10, 2.11.
//
// Five focused endpoints, each mapping to one chart group AND one claim
// the Phase 9 presentation has to prove (wastage, shortage, fairness,
// fallback, activity) -- so nothing built here is thrown away later.
// Plus: the polled overview KPIs, the polled activity feed, and the
// division map data.
//
// Every SQL below aggregates in the database. Nothing loads full tables
// into Node to count in JS.

const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { parseDateRange } = require('./_helpers');
const { DIVISION_POSITIONS, DIVISIONS, divisionOf } = require('../../constants/divisions');

router.use(requireAuth, requireRole('admin'));

const num = (v) => Number(v) || 0;

// Turns "$N" range params into a reusable (clause, values) pair for a given
// timestamp column, so each endpoint's SQL stays readable.
function rangeSql(column, from, to, startIndex = 1) {
  const parts = [];
  const values = [];
  if (from) { values.push(from); parts.push(`${column} >= $${startIndex + values.length - 1}`); }
  if (to)   { values.push(to);   parts.push(`${column} <= $${startIndex + values.length - 1}`); }
  return { sql: parts.length ? `AND ${parts.join(' AND ')}` : '', values };
}

// GET /api/admin/analytics/overview -- KPI cards. Polled every 10s by the
// Overview page, so this is deliberately a handful of cheap aggregates.
router.get('/overview', async (req, res) => {
  try {
    const [units, expiring, requests, unmet, drives, donors, users, cancelled] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) AS count FROM inventory_units GROUP BY status`),
      pool.query(
        `SELECT COUNT(*) AS count FROM inventory_units
         WHERE status = 'available' AND expiry_date <= CURRENT_DATE + INTERVAL '7 days'`
      ),
      pool.query(
        `SELECT urgency_tier, COUNT(*) AS count FROM requests
         WHERE fulfillment_path IS NULL AND cancelled_at IS NULL GROUP BY urgency_tier`
      ),
      // "Not met by inventory" = every resolved request whose path is anything
      // other than 'inventory'. The pipeline writes 'donor_fallback' and
      // 'parallel_critical'; seed/7B data also carries 'scheduled_reservation'
      // and 'scheduled_donor_mobilization'. Counting "<> 'inventory'" keeps
      // this consistent with the fallback endpoint's rate, whatever the set.
      pool.query(
        `SELECT COUNT(*) AS count FROM requests
         WHERE fulfillment_path IS NOT NULL AND fulfillment_path <> 'inventory' AND cancelled_at IS NULL`
      ),
      pool.query(`SELECT status, COUNT(*) AS count FROM donor_drives GROUP BY status`),
      pool.query(`SELECT eligibility_status, COUNT(*) AS count FROM donors GROUP BY eligibility_status`),
      pool.query(`SELECT role, COUNT(*) AS count FROM users WHERE is_active = true GROUP BY role`),
      pool.query(`SELECT COUNT(*) AS count FROM requests WHERE cancelled_at IS NOT NULL`),
    ]);

    const toMap = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], num(r.count)]));

    res.json({
      generated_at: new Date().toISOString(),
      inventory: { by_status: toMap(units.rows, 'status'), expiring_within_7_days: num(expiring.rows[0].count) },
      requests: {
        open_by_tier: toMap(requests.rows, 'urgency_tier'),
        open_total: requests.rows.reduce((s, r) => s + num(r.count), 0),
        unmet_by_inventory: num(unmet.rows[0].count),
        cancelled: num(cancelled.rows[0].count),
      },
      drives: { by_status: toMap(drives.rows, 'status') },
      donors: { by_eligibility: toMap(donors.rows, 'eligibility_status') },
      users: { active_by_role: toMap(users.rows, 'role') },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/activity-feed?limit=30 -- latest request_events across
// every request, joined with the hospital. Polled. The system-wide version
// of RequestTrackingModal's per-request feed.
router.get('/activity-feed', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 200);
  try {
    const result = await pool.query(
      `SELECT re.event_id, re.request_id, re.event_type, re.message, re.metadata, re.created_at,
              r.urgency_tier, r.blood_type, o.name AS org_name, o.district
       FROM request_events re
       JOIN requests r ON r.request_id = re.request_id
       JOIN organizations o ON o.org_id = r.org_id
       ORDER BY re.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/map?from=&to= -- per-division available units and
// allocation arcs (source division -> destination division) in the window.
// Districts are rolled up to divisions in Node via the constants file;
// orgs whose district isn't in the 64-district map are counted under
// "unmapped" rather than silently dropped.
router.get('/map', async (req, res) => {
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });
  const r = rangeSql('ar.allocated_at', from, to);

  try {
    const [stock, arcs] = await Promise.all([
      pool.query(
        `SELECT o.district, COUNT(iu.unit_id) AS units
         FROM organizations o
         LEFT JOIN inventory_units iu ON iu.org_id = o.org_id AND iu.status = 'available'
         GROUP BY o.district`
      ),
      pool.query(
        `SELECT src.district AS source_district, dst.district AS dest_district,
                r.urgency_tier, COUNT(*) AS units
         FROM allocation_records ar
         JOIN inventory_units iu ON iu.unit_id = ar.unit_id
         JOIN organizations src ON src.org_id = iu.org_id
         JOIN requests r ON r.request_id = ar.request_id
         JOIN organizations dst ON dst.org_id = r.org_id
         WHERE 1=1 ${r.sql}
         GROUP BY src.district, dst.district, r.urgency_tier`,
        r.values
      ),
    ]);

    const divisions = Object.fromEntries(
      DIVISIONS.map((d) => [d, { division: d, ...DIVISION_POSITIONS[d], available_units: 0, districts: [] }])
    );
    let unmapped = 0;
    for (const row of stock.rows) {
      const div = divisionOf(row.district);
      if (!div) { unmapped += num(row.units); continue; }
      divisions[div].available_units += num(row.units);
      if (row.district && !divisions[div].districts.includes(row.district)) divisions[div].districts.push(row.district);
    }

    const arcMap = new Map();
    for (const row of arcs.rows) {
      const s = divisionOf(row.source_district);
      const d = divisionOf(row.dest_district);
      if (!s || !d) continue;
      const key = `${s}|${d}|${row.urgency_tier}`;
      arcMap.set(key, (arcMap.get(key) || 0) + num(row.units));
    }
    const flows = [...arcMap.entries()].map(([key, units]) => {
      const [source, destination, urgency_tier] = key.split('|');
      return { source, destination, urgency_tier, units, intra_division: source === destination };
    });

    res.json({ divisions: Object.values(divisions), flows, unmapped_units: unmapped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/wastage -- expired vs delivered vs available,
// by blood type and by week (collection_date is the time axis: it's the
// only date every unit has).
router.get('/wastage', async (req, res) => {
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });
  const r = rangeSql('collection_date', from, to);
  try {
    const [byType, byWeek, expiringSoon] = await Promise.all([
      pool.query(
        `SELECT blood_type, status, COUNT(*) AS count FROM inventory_units
         WHERE 1=1 ${r.sql} GROUP BY blood_type, status ORDER BY blood_type`,
        r.values
      ),
      pool.query(
        `SELECT date_trunc('week', collection_date)::date AS week, status, COUNT(*) AS count
         FROM inventory_units WHERE 1=1 ${r.sql} GROUP BY week, status ORDER BY week`,
        r.values
      ),
      pool.query(
        `SELECT blood_type, COUNT(*) AS count FROM inventory_units
         WHERE status = 'available' AND expiry_date <= CURRENT_DATE + INTERVAL '7 days'
         GROUP BY blood_type`
      ),
    ]);
    const total = byType.rows.reduce((s, x) => s + num(x.count), 0);
    const expired = byType.rows.filter((x) => x.status === 'expired').reduce((s, x) => s + num(x.count), 0);
    res.json({
      summary: { total_units: total, expired, wastage_rate: total ? +(expired / total).toFixed(4) : 0 },
      by_blood_type: byType.rows.map((x) => ({ ...x, count: num(x.count) })),
      by_week: byWeek.rows.map((x) => ({ ...x, count: num(x.count) })),
      expiring_within_7_days: expiringSoon.rows.map((x) => ({ ...x, count: num(x.count) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/shortage -- requests by tier x outcome, and by
// district. "Outcome" is derived: fully covered when allocated units >=
// quantity, partial when 0 < allocated < quantity, unmet when 0 allocated
// and the request has been through the engine.
router.get('/shortage', async (req, res) => {
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });
  const r = rangeSql('r.created_at', from, to);
  const outcomeExpr = `
    CASE
      WHEN r.cancelled_at IS NOT NULL THEN 'cancelled'
      WHEN r.fulfillment_path IS NULL THEN 'pending'
      WHEN COALESCE(a.allocated, 0) >= r.quantity THEN 'fully_covered'
      WHEN COALESCE(a.allocated, 0) > 0 THEN 'partially_covered'
      ELSE 'unmet'
    END`;
  const base = `
    FROM requests r
    JOIN organizations o ON o.org_id = r.org_id
    LEFT JOIN (SELECT request_id, COUNT(*) AS allocated FROM allocation_records GROUP BY request_id) a
      ON a.request_id = r.request_id
    WHERE 1=1 ${r.sql}`;
  try {
    const [byTier, byDistrict, byWeek] = await Promise.all([
      pool.query(`SELECT r.urgency_tier, ${outcomeExpr} AS outcome, COUNT(*) AS count ${base}
                  GROUP BY r.urgency_tier, outcome ORDER BY r.urgency_tier`, r.values),
      pool.query(`SELECT o.district, ${outcomeExpr} AS outcome, COUNT(*) AS count ${base}
                  GROUP BY o.district, outcome ORDER BY o.district`, r.values),
      pool.query(`SELECT date_trunc('week', r.created_at)::date AS week, ${outcomeExpr} AS outcome, COUNT(*) AS count ${base}
                  GROUP BY week, outcome ORDER BY week`, r.values),
    ]);
    const fmt = (rows) => rows.map((x) => ({ ...x, count: num(x.count) }));
    const all = fmt(byTier.rows);
    const total = all.reduce((s, x) => s + x.count, 0);
    const unmet = all.filter((x) => x.outcome === 'unmet' || x.outcome === 'partially_covered').reduce((s, x) => s + x.count, 0);
    res.json({
      summary: { total_requests: total, unmet_or_partial: unmet, shortage_rate: total ? +(unmet / total).toFixed(4) : 0 },
      by_tier: all, by_district: fmt(byDistrict.rows), by_week: fmt(byWeek.rows),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/fairness -- per source org: units contributed,
// share of all allocations, distinct requests served. The chart that
// proves the engine's fairness objective rather than asserting it.
router.get('/fairness', async (req, res) => {
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });
  const r = rangeSql('ar.allocated_at', from, to);
  try {
    const result = await pool.query(
      `SELECT o.org_id, o.name, o.org_type, o.district,
              COUNT(ar.unit_id) AS units_contributed,
              COUNT(DISTINCT ar.request_id) AS requests_served,
              COALESCE(AVG(ar.distance_km), 0) AS avg_distance_km,
              (SELECT COUNT(*) FROM inventory_units iu2 WHERE iu2.org_id = o.org_id AND iu2.status = 'available') AS current_available
       FROM organizations o
       LEFT JOIN inventory_units iu ON iu.org_id = o.org_id
       LEFT JOIN allocation_records ar ON ar.unit_id = iu.unit_id ${r.sql}
       WHERE o.org_type IN ('blood_bank', 'ngo')
       GROUP BY o.org_id ORDER BY units_contributed DESC`,
      r.values
    );
    const rows = result.rows.map((x) => ({
      ...x,
      units_contributed: num(x.units_contributed),
      requests_served: num(x.requests_served),
      avg_distance_km: +Number(x.avg_distance_km).toFixed(2),
      current_available: num(x.current_available),
    }));
    const total = rows.reduce((s, x) => s + x.units_contributed, 0);
    const withShare = rows.map((x) => ({ ...x, share: total ? +(x.units_contributed / total).toFixed(4) : 0 }));
    // Gini coefficient over contributions: 0 = perfectly even spread,
    // 1 = one org supplies everything. One number for the KPI card.
    const c = withShare.map((x) => x.units_contributed).sort((a, b) => a - b);
    const n = c.length;
    let gini = 0;
    if (n > 0 && total > 0) {
      let cum = 0;
      c.forEach((v, i) => { cum += (i + 1) * v; });
      gini = +((2 * cum) / (n * total) - (n + 1) / n).toFixed(4);
    }
    res.json({ summary: { total_units_allocated: total, source_orgs: n, gini_coefficient: gini }, by_source_org: withShare });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/fallback -- inventory-resolved vs donor-
// mobilization-resolved over time, plus invite confirm/decline rates.
router.get('/fallback', async (req, res) => {
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });
  const r = rangeSql('created_at', from, to);
  try {
    const [paths, byWeek, invites] = await Promise.all([
      pool.query(`SELECT fulfillment_path, COUNT(*) AS count FROM requests
                  WHERE fulfillment_path IS NOT NULL AND cancelled_at IS NULL ${r.sql}
                  GROUP BY fulfillment_path`, r.values),
      pool.query(`SELECT date_trunc('week', created_at)::date AS week, fulfillment_path, COUNT(*) AS count
                  FROM requests WHERE fulfillment_path IS NOT NULL AND cancelled_at IS NULL ${r.sql}
                  GROUP BY week, fulfillment_path ORDER BY week`, r.values),
      pool.query(`SELECT dm.invite_status, COUNT(*) AS count
                  FROM donor_mobilizations dm JOIN requests r ON r.request_id = dm.request_id
                  WHERE 1=1 ${r.sql.replace(/created_at/g, 'r.created_at')}
                  GROUP BY dm.invite_status`, r.values),
    ]);
    const fmt = (rows) => rows.map((x) => ({ ...x, count: num(x.count) }));
    const p = fmt(paths.rows);
    const total = p.reduce((s, x) => s + x.count, 0);
    const fallback = p.filter((x) => x.fulfillment_path && x.fulfillment_path !== 'inventory').reduce((s, x) => s + x.count, 0);
    const inv = fmt(invites.rows);
    const invTotal = inv.reduce((s, x) => s + x.count, 0);
    const confirmed = inv.find((x) => x.invite_status === 'confirmed')?.count || 0;
    res.json({
      summary: {
        resolved_total: total, fallback_rate: total ? +(fallback / total).toFixed(4) : 0,
        invites_total: invTotal, invite_confirm_rate: invTotal ? +(confirmed / invTotal).toFixed(4) : 0,
      },
      by_path: p, by_week: fmt(byWeek.rows), invites_by_status: inv,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/activity -- batch runs and request volume per day.
router.get('/activity', async (req, res) => {
  const { from, to, error } = parseDateRange(req.query);
  if (error) return res.status(400).json({ error });
  const r = rangeSql('created_at', from, to);
  try {
    const [batches, requestsPerDay, eventsPerDay] = await Promise.all([
      pool.query(`SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS count
                  FROM admin_actions WHERE action_type = 'batch_triggered' ${r.sql}
                  GROUP BY day ORDER BY day`, r.values),
      pool.query(`SELECT date_trunc('day', created_at)::date AS day, urgency_tier, COUNT(*) AS count
                  FROM requests WHERE 1=1 ${r.sql} GROUP BY day, urgency_tier ORDER BY day`, r.values),
      pool.query(`SELECT date_trunc('day', created_at)::date AS day, event_type, COUNT(*) AS count
                  FROM request_events WHERE 1=1 ${r.sql} GROUP BY day, event_type ORDER BY day`, r.values),
    ]);
    const fmt = (rows) => rows.map((x) => ({ ...x, count: num(x.count) }));
    res.json({ manual_batches_per_day: fmt(batches.rows), requests_per_day: fmt(requestsPerDay.rows), events_per_day: fmt(eventsPerDay.rows) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
