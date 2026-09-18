-- ============================================================================
-- migration_dedupe_allocations.sql  (rev 2 -- no temp tables)
--
-- Repairs the damage left by the allocation race, then installs the
-- constraint that makes the worst of it impossible to repeat.
--
-- WHY REV 2: rev 1 used CREATE TEMP TABLE ... ON COMMIT DROP to hold
-- before/after counts. That does not survive the Supabase SQL Editor,
-- which does not give the script a single stable session the way psql
-- does, so the temp tables were gone by the time the report read them
-- ("relation _before does not exist"). Nothing about the repair logic was
-- wrong; the bookkeeping around it was. This version holds no state
-- between statements at all. Every step is a single self-contained
-- statement with RETURNING, so the editor shows you exactly which rows it
-- touched, which is better evidence than a count anyway.
--
-- HOW TO RUN: one statement at a time, in order, top to bottom. Read the
-- result of each before running the next.
--
-- Running them individually means the set is NOT atomic: if step 4 fails,
-- steps 1 to 3 have already applied. That is safe here, because every
-- step is idempotent -- re-running any of them finds nothing left to do
-- and changes nothing. Idempotence is what makes stopping halfway
-- recoverable, so prefer re-running a step over trying to undo one.
--
-- ORDER MATTERS. Step 2 before step 3, because repairing cross-request
-- double-booking changes the counts step 3 measures. Step 4 after both,
-- so it sweeps up whatever they detached.
--
-- Physically moved units ('dispatched' / 'delivered') are NEVER released
-- and NEVER chosen for deletion. Blood that left the building cannot be
-- un-shipped by an UPDATE, so the repair always keeps the record that
-- matches physical reality and discards the one that does not.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1. Exact duplicate pairs.
--
-- The same unit recorded against the same request more than once. Happens
-- when both batches solved from an identical snapshot: CBC is
-- deterministic, so identical input gives identical output. This is the
-- pattern behind "4 / 2 allocated" and the doubled log line.
--
-- Keep the earliest, drop the rest. No inventory change: the unit is
-- reserved once regardless of how many times it was written down.
--
-- Expect 1 row.
-- ----------------------------------------------------------------------------
DELETE FROM allocation_records
WHERE
    allocation_id IN (
        SELECT allocation_id
        FROM (
                SELECT allocation_id, ROW_NUMBER() OVER (
                        PARTITION BY
                            request_id, unit_id
                        ORDER BY allocated_at, allocation_id
                    ) AS rn
                FROM allocation_records
            ) ranked
        WHERE
            rn > 1
    ) RETURNING allocation_id,
    request_id,
    unit_id;

-- ----------------------------------------------------------------------------
-- STEP 2. Cross-request double-booking.
--
-- One physical unit promised to two different live requests. The most
-- serious pattern, because two hospitals were each told the same bag of
-- blood is theirs.
--
-- Keep exactly one claim per unit, chosen by physical reality first and
-- timestamp second:
--   delivered   -> that hospital already has it, strongest claim
--   dispatched  -> in transit to them, next strongest
--   otherwise   -> earliest allocation wins
--
-- Cancelled requests are excluded: cancel deliberately leaves the
-- historical allocation_record in place, so a unit being re-allocated
-- after a cancellation is correct behaviour, not damage.
--
-- Any request that loses a claim and now holds fewer units than it asked
-- for goes back to pending, so the engine solves it again properly. That
-- is the only correct recovery: the request was never really covered, the
-- system just thought it was.
--
-- NOTE ON THE `- s.removed` TERM: every data-modifying CTE in a single
-- statement sees the same snapshot, so the subquery counting
-- allocation_records does NOT see the rows the `deleted` CTE just removed.
-- Subtracting the per-request delete count is what makes the comparison
-- against r.quantity correct. Without it this step would decide nothing
-- fell short and quietly leave the requests marked resolved.
--
-- History is corrected by appending, not rewriting. The stale "request
-- resolved" event stays; the new row explains why it was wrong.
--
-- Expect 0 or 1 rows (the INSERT's output -- requests returned to queue).
-- A result of 0 rows here still means the revoke itself happened; it means
-- the losing request was already fully covered without that unit.
-- ----------------------------------------------------------------------------
WITH
    live AS (
        SELECT ar.allocation_id, ar.request_id, ar.unit_id, ar.allocated_at, iu.status
        FROM
            allocation_records ar
            JOIN inventory_units iu ON iu.unit_id = ar.unit_id
            JOIN requests r ON r.request_id = ar.request_id
        WHERE
            r.cancelled_at IS NULL
    ),
    contested AS (
        SELECT unit_id
        FROM live
        GROUP BY
            unit_id
        HAVING
            COUNT(DISTINCT request_id) > 1
    ),
    ranked AS (
        SELECT l.*, ROW_NUMBER() OVER (
                PARTITION BY
                    l.unit_id
                ORDER BY
                    CASE l.status
                        WHEN 'delivered' THEN 0
                        WHEN 'dispatched' THEN 1
                        ELSE 2
                    END, l.allocated_at, l.allocation_id
            ) AS rn
        FROM live l
        WHERE
            l.unit_id IN (
                SELECT unit_id
                FROM contested
            )
    ),
    revoked AS (
        SELECT allocation_id
        FROM ranked
        WHERE
            rn > 1
    ),
    deleted AS (
        DELETE FROM allocation_records
        WHERE
            allocation_id IN (
                SELECT allocation_id
                FROM revoked
            ) RETURNING request_id,
            unit_id
    ),
    shortfall AS (
        SELECT request_id, COUNT(*) AS removed
        FROM deleted
        GROUP BY
            request_id
    ),
    reopened AS (
        UPDATE requests r
        SET
            fulfillment_path = NULL
        FROM shortfall s
        WHERE
            r.request_id = s.request_id
            AND r.cancelled_at IS NULL
            AND r.fulfillment_path IS NOT NULL
            AND (
                SELECT COUNT(*)
                FROM allocation_records ar
                WHERE
                    ar.request_id = r.request_id
            ) - s.removed < r.quantity RETURNING r.request_id
    )
INSERT INTO
    request_events (
        request_id,
        event_type,
        message,
        metadata
    )
SELECT
    request_id,
    'allocation_repaired',
    'A unit allocated to this request was also allocated to another request. ' || 'The duplicate claim was removed and this request returned to the allocation queue.',
    jsonb_build_object (
        'repair',
        'migration_dedupe_allocations'
    )
FROM
    reopened RETURNING request_id,
    event_type;

-- ----------------------------------------------------------------------------
-- STEP 3. Over-allocated requests.
--
-- A request holding more distinct units than its quantity. Happens when
-- the second batch's inventory snapshot was taken AFTER the first reserved
-- its units, so it solved against the remaining stock and picked different
-- ones. Real units reserved against a need that does not exist.
--
-- Trim the excess, keeping physically moved units first and then the
-- earliest allocations.
--
-- The `status NOT IN ('dispatched','delivered')` filter is what protects
-- the one interesting row in your data: the request that asked for 1 and
-- holds 2, one of which is dispatched. The ORDER BY sorts the dispatched
-- unit to rn = 1 so it is kept, and the filter means that even if it had
-- sorted otherwise it could not be deleted. Only the phantom reserved unit
-- is trimmed.
--
-- Expect around 9 rows (4 requests with 2 excess each, 1 with 1 excess).
-- 8 is also correct if step 2 already revoked a claim on one of them.
-- ----------------------------------------------------------------------------
DELETE FROM allocation_records
WHERE
    allocation_id IN (
        SELECT allocation_id
        FROM (
                SELECT ar.allocation_id, iu.status, r.quantity, ROW_NUMBER() OVER (
                        PARTITION BY
                            ar.request_id
                        ORDER BY
                            CASE iu.status
                                WHEN 'delivered' THEN 0
                                WHEN 'dispatched' THEN 1
                                ELSE 2
                            END, ar.allocated_at, ar.allocation_id
                    ) AS rn
                FROM
                    allocation_records ar
                    JOIN requests r ON r.request_id = ar.request_id
                    JOIN inventory_units iu ON iu.unit_id = ar.unit_id
                WHERE
                    r.cancelled_at IS NULL
            ) held
        WHERE
            rn > quantity
            AND status NOT IN('dispatched', 'delivered')
    ) RETURNING allocation_id,
    request_id,
    unit_id;

-- ----------------------------------------------------------------------------
-- STEP 4. Release orphaned reservations.
--
-- Any unit sitting in 'reserved' with no allocation_record pointing at it
-- is stock the system quietly removed from circulation for nothing.
--
-- Most of these are NOT race damage. generate_seed_data.py assigns unit
-- status at random (70% available, 20% reserved, 10% dispatched) and only
-- afterwards lets requests claim some of them, so every reserved unit no
-- request happened to claim is an orphan the moment the seed file is
-- written. That accounts for 22 of them exactly. The rest are units this
-- migration's steps 2 and 3 just detached.
--
-- Only 'reserved' is touched. 'dispatched', 'delivered' and 'expired' are
-- left exactly as they are.
--
-- Expect roughly 30 to 32 rows. This will raise your available-stock
-- figure and visibly move the Overview KPIs and the wastage chart, which
-- is correct: those units were always available, the system just could not
-- see them.
-- ----------------------------------------------------------------------------
UPDATE inventory_units
SET
    status = 'available'
WHERE
    status = 'reserved'
    AND NOT EXISTS (
        SELECT 1
        FROM allocation_records ar
        WHERE
            ar.unit_id = inventory_units.unit_id
    ) RETURNING unit_id,
    org_id,
    blood_type,
    component,
    expiry_date;

-- ----------------------------------------------------------------------------
-- STEP 5. Duplicated engine events.
--
-- 'engine_resolved_inventory' and 'engine_shortfall' are written exactly
-- once per batch run per request, so a second copy is proof the batch ran
-- twice. Keep the earliest of each kind per request.
--
-- Deliberately narrow: only these two event types, only exact duplicates
-- within the same request. Every other event stays untouched, including
-- legitimately repeated ones like donor_responded, and including the
-- allocation_repaired rows step 2 just wrote.
--
-- Expect 4 rows.
-- ----------------------------------------------------------------------------
DELETE FROM request_events
WHERE
    event_id IN (
        SELECT event_id
        FROM (
                SELECT event_id, ROW_NUMBER() OVER (
                        PARTITION BY
                            request_id, event_type
                        ORDER BY created_at, event_id
                    ) AS rn
                FROM request_events
                WHERE
                    event_type IN (
                        'engine_resolved_inventory', 'engine_shortfall'
                    )
            ) ranked
        WHERE
            rn > 1
    ) RETURNING event_id,
    request_id,
    event_type;

-- ----------------------------------------------------------------------------
-- STEP 6. The constraint.
--
-- What stops the exact-duplicate pattern forever, regardless of any
-- application bug. It can only be added once steps 1 to 3 have cleaned the
-- data, which is why it comes last.
--
-- It does NOT prevent cross-request double-booking -- two different
-- requests claiming one unit is two distinct rows, both legal here. That
-- is what the advisory lock in services/engineClient.js handles.
--
-- It is also why a unique constraint on unit_id ALONE would be wrong: a
-- cancelled request keeps its historical allocation_record, and the
-- released unit must be allocatable again afterwards.
--
-- Run all three lines together.
-- ----------------------------------------------------------------------------
ALTER TABLE allocation_records
DROP CONSTRAINT IF EXISTS allocation_records_request_unit_unique;

ALTER TABLE allocation_records
ADD CONSTRAINT allocation_records_request_unit_unique UNIQUE (request_id, unit_id);

CREATE INDEX IF NOT EXISTS idx_allocation_records_unit_id ON allocation_records (unit_id);

-- ----------------------------------------------------------------------------
-- STEP 7. VERIFY. Every column must be 0 except the last, which must be 1.
-- ----------------------------------------------------------------------------
SELECT (
        SELECT COUNT(*)
        FROM (
                SELECT 1
                FROM allocation_records
                GROUP BY
                    request_id, unit_id
                HAVING
                    COUNT(*) > 1
            ) x
    ) AS remaining_duplicate_pairs,
    (
        SELECT COUNT(*)
        FROM (
                SELECT 1
                FROM
                    requests r
                    JOIN allocation_records ar ON ar.request_id = r.request_id
                WHERE
                    r.cancelled_at IS NULL
                GROUP BY
                    r.request_id, r.quantity
                HAVING
                    COUNT(DISTINCT ar.unit_id) > r.quantity
            ) x
    ) AS remaining_over_allocated,
    (
        SELECT COUNT(*)
        FROM (
                SELECT 1
                FROM
                    allocation_records ar
                    JOIN requests r ON r.request_id = ar.request_id
                WHERE
                    r.cancelled_at IS NULL
                GROUP BY
                    ar.unit_id
                HAVING
                    COUNT(DISTINCT ar.request_id) > 1
            ) x
    ) AS remaining_double_booked_units,
    (
        SELECT COUNT(*)
        FROM inventory_units iu
        WHERE
            iu.status = 'reserved'
            AND NOT EXISTS (
                SELECT 1
                FROM allocation_records ar
                WHERE
                    ar.unit_id = iu.unit_id
            )
    ) AS remaining_orphaned_reservations,
    (
        SELECT COUNT(*)
        FROM (
                SELECT 1
                FROM request_events
                WHERE
                    event_type IN (
                        'engine_resolved_inventory', 'engine_shortfall'
                    )
                GROUP BY
                    request_id, event_type
                HAVING
                    COUNT(*) > 1
            ) x
    ) AS remaining_duplicate_events,
    (
        SELECT COUNT(*)
        FROM pg_constraint
        WHERE
            conname = 'allocation_records_request_unit_unique'
    ) AS constraint_installed;