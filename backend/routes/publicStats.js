// Aggregate figures for the public landing page.
//
// This is the only route in RoktoNet that answers without a login, apart
// from auth and the location lookups, so the rules it works under are
// stricter than anywhere else in the project.
//
// WHAT IS SAFE TO PUBLISH, AND WHY THAT IS A SHORT LIST
//
// The landing page says "read from RoktoNet's database just now", and that
// claim is the whole reason this file exists: the section previously showed
// hardcoded numbers under that sentence, which was untrue.
//
// Being true is not the same as being safe. Everything here is a count, a
// rate or a district name. Specifically NOT returned, at any nesting depth:
//
//   * patient_name, patient_phone, patient_note   -- never leaves the
//     requesting hospital, and certainly not to an anonymous visitor
//   * organization names or org_ids               -- "Bank D is low on O-"
//     is a commercially and operationally sensitive fact
//   * request_ids or unit_ids                     -- an opaque id is still
//     a handle for correlating one request across repeated polls
//   * donor anything
//
// The allocation flows are district to district. A district is a unit of
// roughly two million people, which is coarse enough that no individual
// transfer is identifiable, while still being the real geography.
//
// CACHING IS A SECURITY CONTROL HERE, NOT JUST A SPEED ONE
//
// An unauthenticated endpoint on a free-tier database is an invitation to
// hammer it. The 60-second cache means a thousand visitors in a minute
// produce one query, and it also blunts polling as a way to watch the
// system change in near real time.

const express = require('express');
const router = express.Router();
const pool = require('../db');

const CACHE_TTL_MS = 60 * 1000;
const FLOW_LIMIT = 8;
const DISTRICTS_IN_BANGLADESH = 64;

let cache = { at: 0, payload: null };

async function buildPayload() {
  const [totals, urgency, fulfillment, timing, flows] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM allocation_records)                              AS units_allocated,
        (SELECT COUNT(*)::int FROM requests
          WHERE fulfillment_path IS NOT NULL AND cancelled_at IS NULL)              AS requests_resolved,
        (SELECT COUNT(*)::int FROM organizations)                                   AS organizations,
        (SELECT COUNT(DISTINCT district)::int FROM organizations)                   AS districts_covered,
        (SELECT COUNT(*)::int FROM inventory_units
          WHERE status = 'available'
            AND expiry_date <= CURRENT_DATE + 7)                                    AS units_expiring_soon
    `),
    pool.query(`
      SELECT urgency_tier AS tier, COUNT(*)::int AS resolved
        FROM requests
       WHERE fulfillment_path IS NOT NULL AND cancelled_at IS NULL
       GROUP BY urgency_tier
    `),
    pool.query(`
      SELECT fulfillment_path AS path, COUNT(*)::int AS count
        FROM requests
       WHERE fulfillment_path IS NOT NULL AND cancelled_at IS NULL
       GROUP BY fulfillment_path
       ORDER BY count DESC
    `),
    pool.query(`
      -- Median rather than mean, because one request that sat over a
      -- weekend would drag an average into uselessness while the typical
      -- experience stayed unchanged.
      --
      -- TWO FILTERS, AND BOTH ARE ABOUT HONESTY RATHER THAN FLATTERY.
      --
      -- seed_data.sql writes allocated_at as a bare DATE, so those rows land
      -- at midnight and the gap they produce measures date rounding, not
      -- system behaviour. On a clean seed that alone yields a median of
      -- exactly 86400 seconds, which would have gone on the landing page as
      -- "24 h median request to allocation" and been pure artefact. The
      -- time-of-day test excludes fixture rows: the engine writes a real
      -- timestamp, a fixture writes midnight.
      --
      -- The 24-hour ceiling excludes the mirror-image case, an allocation
      -- made now against a request back-dated months by seeding. It is not
      -- there to drop slow requests: the engine resolves within one batch
      -- interval, so a genuine gap of days means the two rows were never
      -- part of the same event.
      --
      -- If that leaves too few rows to mean anything, this returns NULL and
      -- the tile is hidden rather than showing a number computed from
      -- nothing. It fills in by itself once the deployed system has handled
      -- real requests end to end.
      SELECT percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (a.first_alloc - r.created_at))
             ) AS median_seconds,
             COUNT(*)::int AS sample_size
        FROM requests r
        JOIN (SELECT request_id, MIN(allocated_at) AS first_alloc
                FROM allocation_records GROUP BY request_id) a
          ON a.request_id = r.request_id
       WHERE r.cancelled_at IS NULL
         AND a.first_alloc >= r.created_at
         AND a.first_alloc::time <> '00:00:00'
         AND a.first_alloc - r.created_at < INTERVAL '24 hours'
    `),
    pool.query(`
      -- District to district only. The joins reach organizations purely to
      -- read a district off each end; no name or id is selected.
      SELECT src.district AS from_district,
             dst.district AS to_district,
             r.urgency_tier,
             COUNT(*)::int AS units,
             MAX(ar.allocated_at) AS last_at
        FROM allocation_records ar
        JOIN inventory_units iu ON iu.unit_id   = ar.unit_id
        JOIN organizations  src ON src.org_id   = iu.org_id
        JOIN requests         r ON r.request_id = ar.request_id
        JOIN organizations  dst ON dst.org_id   = r.org_id
       WHERE r.cancelled_at IS NULL
       GROUP BY src.district, dst.district, r.urgency_tier
       ORDER BY MAX(ar.allocated_at) DESC NULLS LAST
       LIMIT $1
    `, [FLOW_LIMIT]),
  ]);

  const t = totals.rows[0];
  const resolvedTotal = fulfillment.rows.reduce((s, r) => s + r.count, 0);
  const fallbackPaths = ['donor_fallback', 'parallel_critical', 'scheduled_donor_mobilization'];
  const fallbackCount = fulfillment.rows
    .filter((r) => fallbackPaths.includes(r.path))
    .reduce((s, r) => s + r.count, 0);

  // Below this many samples the median is noise wearing a number's clothes,
  // so the endpoint reports nothing and the page hides the tile.
  const MIN_TIMING_SAMPLE = 5;
  const timingRow = timing.rows[0] || {};
  const sampleSize = timingRow.sample_size || 0;
  const median = (sampleSize >= MIN_TIMING_SAMPLE && timingRow.median_seconds !== null)
    ? Number(timingRow.median_seconds)
    : null;

  return {
    generated_at: new Date().toISOString(),
    totals: {
      units_allocated: t.units_allocated,
      requests_resolved: t.requests_resolved,
      organizations: t.organizations,
      districts_covered: t.districts_covered,
      districts_total: DISTRICTS_IN_BANGLADESH,
      units_expiring_soon: t.units_expiring_soon,
      // Null rather than 0 when nothing has been allocated yet. Zero would
      // render as an impossibly fast system rather than as no data.
      median_seconds_to_allocation: median === null ? null : Math.round(median * 10) / 10,
      // Published so the page can tell "no data yet" apart from "zero", and
      // so anyone auditing the number can see what it rests on.
      median_sample_size: sampleSize,
      donor_fallback_rate: resolvedTotal ? Math.round((fallbackCount / resolvedTotal) * 100) : null,
    },
    by_urgency: urgency.rows,
    by_fulfillment: fulfillment.rows.map((r) => ({
      path: r.path,
      count: r.count,
      share: resolvedTotal ? Math.round((r.count / resolvedTotal) * 100) : 0,
    })),
    flows: flows.rows.map((f) => ({
      from_district: f.from_district,
      to_district: f.to_district,
      urgency_tier: f.urgency_tier,
      units: f.units,
      last_at: f.last_at,
    })),
  };
}

// GET /api/public/stats
router.get('/stats', async (req, res) => {
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_TTL_MS) {
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ ...cache.payload, cached: true });
  }

  try {
    const payload = await buildPayload();
    cache = { at: now, payload };
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[public/stats]', err);
    // A stale payload beats an error on a marketing page, so serve the last
    // good one if there is one and only fail outright when there is not.
    if (cache.payload) {
      return res.json({ ...cache.payload, cached: true, stale: true });
    }
    return res.status(500).json({ error: 'Statistics are unavailable right now' });
  }
});

module.exports = router;
