-- ============================================================================
-- PREFLIGHT AUDIT -- read only, changes nothing. Run this BEFORE
-- migration_dedupe_allocations.sql and keep the output.
--
-- Why this exists: the allocation race (services/engineClient.js had no
-- lock around its read-solve-write) can damage the data in three different
-- ways depending on how the two concurrent batches interleaved. The repair
-- migration handles all three, but you should see the real numbers for YOUR
-- database first, so that afterwards you can prove the repair did what it
-- claimed. Save this output.
--
-- Run in Supabase SQL Editor. Each query is independent.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A. Exact duplicate pairs: the same unit recorded against the same request
--    more than once. Happens when both batches solved from an identical
--    snapshot and produced an identical answer (CBC is deterministic, so
--    identical input gives identical output). This is the pattern behind
--    the "4/2 allocated" display and the doubled log line.
-- ----------------------------------------------------------------------------
SELECT 'A. exact duplicate pairs' AS check_name;

SELECT ar.request_id,
       ar.unit_id,
       COUNT(*)              AS times_recorded,
       COUNT(*) - 1          AS rows_to_delete,
       MIN(ar.allocated_at)  AS first_seen,
       MAX(ar.allocated_at)  AS last_seen
FROM allocation_records ar
GROUP BY ar.request_id, ar.unit_id
HAVING COUNT(*) > 1
ORDER BY times_recorded DESC, ar.request_id;


-- ----------------------------------------------------------------------------
-- B. Over-allocated requests: a request holding MORE distinct units than it
--    asked for. Happens when the second batch's inventory snapshot was taken
--    after the first batch reserved its units, so it solved against the
--    remaining stock and picked different units. This one is worse than A,
--    because real units are reserved against a need that does not exist.
--
--    The `physically_gone` column matters: those units were already
--    dispatched or delivered and CANNOT be released. If any request shows a
--    non-zero value here, read the note in the migration before running it.
-- ----------------------------------------------------------------------------
SELECT 'B. over-allocated requests' AS check_name;

SELECT r.request_id,
       r.quantity                                   AS units_requested,
       COUNT(DISTINCT ar.unit_id)                   AS distinct_units_held,
       COUNT(DISTINCT ar.unit_id) - r.quantity      AS excess_units,
       COUNT(*) FILTER (WHERE iu.status IN ('dispatched', 'delivered')) AS physically_gone,
       r.fulfillment_path,
       r.cancelled_at
FROM requests r
JOIN allocation_records ar ON ar.request_id = r.request_id
JOIN inventory_units iu    ON iu.unit_id    = ar.unit_id
GROUP BY r.request_id, r.quantity, r.fulfillment_path, r.cancelled_at
HAVING COUNT(DISTINCT ar.unit_id) > r.quantity
ORDER BY excess_units DESC;


-- ----------------------------------------------------------------------------
-- C. Cross-request double-booking: one physical unit promised to two
--    different LIVE requests. The most serious of the three, because two
--    hospitals were each told the same bag of blood is theirs.
--
--    Note this deliberately ignores pairs where the earlier request was
--    cancelled -- releasing a unit on cancel leaves its historical
--    allocation_record in place by design, and the unit being allocated
--    again afterwards is correct behaviour, not damage.
-- ----------------------------------------------------------------------------
SELECT 'C. cross-request double-booking' AS check_name;

SELECT ar.unit_id,
       iu.status                       AS unit_status,
       COUNT(DISTINCT ar.request_id)   AS live_requests_holding_it,
       array_agg(DISTINCT ar.request_id) AS request_ids
FROM allocation_records ar
JOIN inventory_units iu ON iu.unit_id = ar.unit_id
JOIN requests r         ON r.request_id = ar.request_id
WHERE r.cancelled_at IS NULL
GROUP BY ar.unit_id, iu.status
HAVING COUNT(DISTINCT ar.request_id) > 1
ORDER BY live_requests_holding_it DESC;


-- ----------------------------------------------------------------------------
-- D. Orphaned reservations: units sitting in 'reserved' with no
--    allocation_record pointing at them at all. These are stock that the
--    system has quietly taken out of circulation for no reason -- invisible
--    shortage. Can pre-date the race (an interrupted batch run leaves the
--    same trace).
-- ----------------------------------------------------------------------------
SELECT 'D. orphaned reservations' AS check_name;

SELECT iu.unit_id, iu.org_id, iu.blood_type, iu.component, iu.expiry_date
FROM inventory_units iu
WHERE iu.status = 'reserved'
  AND NOT EXISTS (SELECT 1 FROM allocation_records ar WHERE ar.unit_id = iu.unit_id)
ORDER BY iu.expiry_date;


-- ----------------------------------------------------------------------------
-- E. Duplicated resolution events: the visible symptom you reported, where
--    the tracking modal shows "Matched with N unit(s) ... request resolved"
--    twice. One row per batch run that touched the request.
-- ----------------------------------------------------------------------------
SELECT 'E. duplicated resolution events' AS check_name;

SELECT re.request_id,
       re.event_type,
       COUNT(*)     AS times_logged,
       COUNT(*) - 1 AS rows_to_delete
FROM request_events re
WHERE re.event_type IN ('engine_resolved_inventory', 'engine_shortfall')
GROUP BY re.request_id, re.event_type
HAVING COUNT(*) > 1
ORDER BY times_logged DESC;


-- ----------------------------------------------------------------------------
-- F. One-line summary. If every count is 0, your database escaped the race
--    and the migration will be a no-op apart from adding the constraint.
-- ----------------------------------------------------------------------------
SELECT 'F. summary' AS check_name;

SELECT
  (SELECT COUNT(*) FROM (
      SELECT 1 FROM allocation_records GROUP BY request_id, unit_id HAVING COUNT(*) > 1
   ) x)                                                       AS a_duplicate_pairs,
  (SELECT COUNT(*) FROM (
      SELECT 1 FROM requests r
      JOIN allocation_records ar ON ar.request_id = r.request_id
      GROUP BY r.request_id, r.quantity
      HAVING COUNT(DISTINCT ar.unit_id) > r.quantity
   ) x)                                                       AS b_over_allocated_requests,
  (SELECT COUNT(*) FROM (
      SELECT 1 FROM allocation_records ar
      JOIN requests r ON r.request_id = ar.request_id
      WHERE r.cancelled_at IS NULL
      GROUP BY ar.unit_id HAVING COUNT(DISTINCT ar.request_id) > 1
   ) x)                                                       AS c_double_booked_units,
  (SELECT COUNT(*) FROM inventory_units iu
      WHERE iu.status = 'reserved'
        AND NOT EXISTS (SELECT 1 FROM allocation_records ar WHERE ar.unit_id = iu.unit_id)
   )                                                          AS d_orphaned_reservations,
  (SELECT COUNT(*) FROM (
      SELECT 1 FROM request_events
      WHERE event_type IN ('engine_resolved_inventory', 'engine_shortfall')
      GROUP BY request_id, event_type HAVING COUNT(*) > 1
   ) x)                                                       AS e_duplicated_events;
