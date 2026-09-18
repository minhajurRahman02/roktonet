-- ============================================================================
-- migration_dedupe_allocations.sql
--
-- Repairs the damage left by the allocation race, then installs the
-- constraint that makes the worst of it impossible to repeat.
--
-- THE RACE (for the record): services/engineClient.js ran
-- SELECT-pending -> solve -> INSERT-allocations with no lock and no
-- transaction, while three separate things could call it concurrently:
-- the synchronous critical/urgent path in routes/requests.js, the 60s
-- interval in scheduler.js, and the admin "Run batch now" button. Two
-- overlapping runs both saw the same pending request, both solved, and
-- both wrote. allocation_records had no unique constraint, so the
-- duplicates inserted silently and units_allocated (a raw COUNT(*))
-- reported 4 for a 2-unit request.
--
-- RUN preflight_allocation_audit.sql FIRST and keep its output. This
-- migration prints the same counts afterwards so the two can be compared.
--
-- ORDER MATTERS. Cross-request double-booking is repaired before
-- over-allocation, because repairing it changes the counts that the
-- over-allocation step measures. Orphan release runs last so it sweeps up
-- anything the earlier steps detached.
--
-- Physically moved units ('dispatched' / 'delivered') are NEVER released
-- and NEVER preferred for deletion. Blood that left the building cannot be
-- un-shipped by an UPDATE, so the repair always keeps the record that
-- matches physical reality and discards the one that does not.
--
-- Safe to run more than once. Every step is idempotent.
-- ============================================================================

BEGIN;

-- Record the "before" numbers so the report at the end is meaningful.
CREATE TEMP TABLE _before ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM allocation_records)                                AS allocation_records,
  (SELECT COUNT(*) FROM inventory_units WHERE status = 'reserved')         AS reserved_units,
  (SELECT COUNT(*) FROM request_events)                                    AS request_events;


-- ----------------------------------------------------------------------------
-- STEP 1. Exact duplicate pairs.
-- The same unit recorded against the same request N times. Keep the
-- earliest, drop the rest. No inventory change: the unit is reserved once
-- regardless of how many times it was written down.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _deleted_duplicates ON COMMIT DROP AS
WITH ranked AS (
  SELECT allocation_id,
         ROW_NUMBER() OVER (
           PARTITION BY request_id, unit_id
           ORDER BY allocated_at, allocation_id
         ) AS rn
  FROM allocation_records
)
SELECT allocation_id FROM ranked WHERE rn > 1;

DELETE FROM allocation_records
WHERE allocation_id IN (SELECT allocation_id FROM _deleted_duplicates);


-- ----------------------------------------------------------------------------
-- STEP 2. Cross-request double-booking.
-- One physical unit promised to two different live requests. Keep exactly
-- one claim on each unit, chosen by physical reality first and timestamp
-- second:
--   delivered   -> that hospital already has it, strongest claim
--   dispatched  -> it is in transit to them, next strongest
--   otherwise   -> earliest allocation wins
-- Cancelled requests are excluded: cancel deliberately leaves the historical
-- allocation_record in place, so a unit being re-allocated after a
-- cancellation is correct behaviour, not damage.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _revoked_claims ON COMMIT DROP AS
WITH live AS (
  SELECT ar.allocation_id, ar.request_id, ar.unit_id, ar.allocated_at, iu.status
  FROM allocation_records ar
  JOIN inventory_units iu ON iu.unit_id = ar.unit_id
  JOIN requests r         ON r.request_id = ar.request_id
  WHERE r.cancelled_at IS NULL
),
contested AS (
  SELECT unit_id FROM live GROUP BY unit_id HAVING COUNT(DISTINCT request_id) > 1
),
ranked AS (
  SELECT l.*,
         ROW_NUMBER() OVER (
           PARTITION BY l.unit_id
           ORDER BY CASE l.status
                      WHEN 'delivered'  THEN 0
                      WHEN 'dispatched' THEN 1
                      ELSE 2
                    END,
                    l.allocated_at,
                    l.allocation_id
         ) AS rn
  FROM live l
  WHERE l.unit_id IN (SELECT unit_id FROM contested)
)
SELECT allocation_id, request_id, unit_id FROM ranked WHERE rn > 1;

DELETE FROM allocation_records
WHERE allocation_id IN (SELECT allocation_id FROM _revoked_claims);

-- Any request that lost a claim and is now holding fewer units than it asked
-- for goes back to pending, so the engine solves it again properly. This is
-- the only correct recovery: the request was never really covered, the
-- system just thought it was.
CREATE TEMP TABLE _reopened_requests ON COMMIT DROP AS
SELECT DISTINCT r.request_id
FROM requests r
WHERE r.request_id IN (SELECT request_id FROM _revoked_claims)
  AND r.cancelled_at IS NULL
  AND r.fulfillment_path IS NOT NULL
  AND (SELECT COUNT(*) FROM allocation_records ar WHERE ar.request_id = r.request_id) < r.quantity;

UPDATE requests SET fulfillment_path = NULL
WHERE request_id IN (SELECT request_id FROM _reopened_requests);

-- History is corrected by appending, not by rewriting. The stale
-- "request resolved" event stays; this row explains why it was wrong.
INSERT INTO request_events (request_id, event_type, message, metadata)
SELECT request_id,
       'allocation_repaired',
       'A unit allocated to this request was also allocated to another request. '
       || 'The duplicate claim was removed and this request returned to the allocation queue.',
       jsonb_build_object('repair', 'migration_dedupe_allocations')
FROM _reopened_requests;


-- ----------------------------------------------------------------------------
-- STEP 3. Over-allocated requests.
-- A request holding more distinct units than its quantity. Trim the excess,
-- keeping physically moved units first (they cannot be un-shipped) and then
-- the earliest allocations.
--
-- NOTE: if a request holds MORE dispatched/delivered units than it asked
-- for, this step keeps all of them and trims nothing, because deleting the
-- record of blood that physically moved would make the data less true, not
-- more. Preflight check B flags those under `physically_gone`; they need a
-- human looking at what actually happened.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _trimmed_excess ON COMMIT DROP AS
WITH held AS (
  SELECT ar.allocation_id, ar.request_id, ar.unit_id, ar.allocated_at,
         iu.status, r.quantity,
         ROW_NUMBER() OVER (
           PARTITION BY ar.request_id
           ORDER BY CASE iu.status
                      WHEN 'delivered'  THEN 0
                      WHEN 'dispatched' THEN 1
                      ELSE 2
                    END,
                    ar.allocated_at,
                    ar.allocation_id
         ) AS rn
  FROM allocation_records ar
  JOIN requests r         ON r.request_id = ar.request_id
  JOIN inventory_units iu ON iu.unit_id   = ar.unit_id
  WHERE r.cancelled_at IS NULL
)
SELECT allocation_id, request_id, unit_id
FROM held
WHERE rn > quantity
  AND status NOT IN ('dispatched', 'delivered');

DELETE FROM allocation_records
WHERE allocation_id IN (SELECT allocation_id FROM _trimmed_excess);


-- ----------------------------------------------------------------------------
-- STEP 4. Release orphaned reservations.
-- Any unit sitting in 'reserved' with no allocation_record pointing at it is
-- stock the system quietly removed from circulation for nothing. This sweeps
-- up units detached by steps 2 and 3, and also any left behind by an
-- interrupted batch run long before this migration.
--
-- Only 'reserved' is touched. 'dispatched', 'delivered' and 'expired' are
-- left exactly as they are.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _released_units ON COMMIT DROP AS
SELECT iu.unit_id
FROM inventory_units iu
WHERE iu.status = 'reserved'
  AND NOT EXISTS (
    SELECT 1 FROM allocation_records ar WHERE ar.unit_id = iu.unit_id
  );

UPDATE inventory_units SET status = 'available'
WHERE unit_id IN (SELECT unit_id FROM _released_units);


-- ----------------------------------------------------------------------------
-- STEP 5. Duplicated engine events.
-- 'engine_resolved_inventory' and 'engine_shortfall' are written exactly
-- once per batch run per request, so a second copy is proof the batch ran
-- twice. Keep the earliest of each kind per request.
--
-- Deliberately narrow: only these two event types, and only exact
-- duplicates within the same request. Every other event stays untouched,
-- including legitimately repeated ones like donor_responded.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _deleted_events ON COMMIT DROP AS
WITH ranked AS (
  SELECT event_id,
         ROW_NUMBER() OVER (
           PARTITION BY request_id, event_type
           ORDER BY created_at, event_id
         ) AS rn
  FROM request_events
  WHERE event_type IN ('engine_resolved_inventory', 'engine_shortfall')
)
SELECT event_id FROM ranked WHERE rn > 1;

DELETE FROM request_events
WHERE event_id IN (SELECT event_id FROM _deleted_events);


-- ----------------------------------------------------------------------------
-- STEP 6. The constraint.
-- This is what stops the exact-duplicate pattern forever, regardless of any
-- application bug. It can only be added once the data above is clean, which
-- is why it comes last.
--
-- It does NOT prevent cross-request double-booking (two different requests
-- claiming one unit is two distinct rows, both legal here) -- that is what
-- the advisory lock in services/engineClient.js handles, and it is also why
-- a unique constraint on unit_id alone would be wrong: a cancelled request
-- keeps its historical allocation_record, and the released unit must be
-- allocatable again afterwards.
-- ----------------------------------------------------------------------------
ALTER TABLE allocation_records
  DROP CONSTRAINT IF EXISTS allocation_records_request_unit_unique;

ALTER TABLE allocation_records
  ADD CONSTRAINT allocation_records_request_unit_unique
  UNIQUE (request_id, unit_id);

-- Supporting index for the per-unit lookups the repair and the new
-- application code both do.
CREATE INDEX IF NOT EXISTS idx_allocation_records_unit_id
  ON allocation_records (unit_id);


-- ----------------------------------------------------------------------------
-- REPORT. Compare this against the preflight audit output.
-- ----------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM _deleted_duplicates)  AS step1_duplicate_rows_deleted,
  (SELECT COUNT(*) FROM _revoked_claims)      AS step2_double_bookings_revoked,
  (SELECT COUNT(*) FROM _reopened_requests)   AS step2_requests_returned_to_queue,
  (SELECT COUNT(*) FROM _trimmed_excess)      AS step3_excess_allocations_trimmed,
  (SELECT COUNT(*) FROM _released_units)      AS step4_units_released_to_available,
  (SELECT COUNT(*) FROM _deleted_events)      AS step5_duplicate_events_deleted,
  (SELECT allocation_records FROM _before)    AS allocation_records_before,
  (SELECT COUNT(*) FROM allocation_records)   AS allocation_records_after,
  (SELECT reserved_units FROM _before)        AS reserved_units_before,
  (SELECT COUNT(*) FROM inventory_units WHERE status = 'reserved') AS reserved_units_after;

COMMIT;


-- ============================================================================
-- VERIFY (run after COMMIT). Every column must be 0.
-- ============================================================================
SELECT
  (SELECT COUNT(*) FROM (
      SELECT 1 FROM allocation_records GROUP BY request_id, unit_id HAVING COUNT(*) > 1
   ) x)                                                       AS remaining_duplicate_pairs,
  (SELECT COUNT(*) FROM (
      SELECT 1 FROM allocation_records ar
      JOIN requests r ON r.request_id = ar.request_id
      WHERE r.cancelled_at IS NULL
      GROUP BY ar.unit_id HAVING COUNT(DISTINCT ar.request_id) > 1
   ) x)                                                       AS remaining_double_booked_units,
  (SELECT COUNT(*) FROM inventory_units iu
      WHERE iu.status = 'reserved'
        AND NOT EXISTS (SELECT 1 FROM allocation_records ar WHERE ar.unit_id = iu.unit_id)
   )                                                          AS remaining_orphaned_reservations,
  (SELECT COUNT(*) FROM (
      SELECT 1 FROM request_events
      WHERE event_type IN ('engine_resolved_inventory', 'engine_shortfall')
      GROUP BY request_id, event_type HAVING COUNT(*) > 1
   ) x)                                                       AS remaining_duplicate_events;
