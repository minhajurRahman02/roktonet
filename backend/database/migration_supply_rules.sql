-- ============================================================
-- RoktoNet migration 18: supply eligibility and the elective loop
--
-- Two independent repairs, in two sections. Read each section's output
-- before running the next one. Nothing here is destructive without
-- printing what it is about to touch first.
--
--   Section A  the elective over-allocation cleanup  (item 2)
--   Section B  hospitals stop holding blood          (item 1)
--
-- Section A should be run on any deployment, immediately. Section B is
-- a data migration you can run whenever you like: once the application
-- code is deployed, the optimizer already ignores hospital stock, so
-- nothing gets worse while you wait.
--
-- ------------------------------------------------------------
-- RUNNING THIS IN THE SUPABASE SQL EDITOR
--
-- Run it one numbered step at a time, not by pasting the whole file.
-- Two reasons, and the first is the important one:
--
--   1. The editor shows you only the LAST statement's result. Paste the
--      whole file and you will never see the output of A1, A2, B1 or
--      B2, which are the steps that exist so you can decide whether to
--      run the ones after them.
--
--   2. The editor does not hold one session across statements, so
--      anything that depends on session state, a temp table or an
--      explicit BEGIN block spanning statements, breaks. Nothing here
--      does any more: every step below is a single self-contained
--      statement that is atomic on its own.
--
-- Each numbered step can be selected and run by itself. Running any of
-- them twice is safe.
-- ------------------------------------------------------------
-- ============================================================


-- ============================================================
-- SECTION A: release the units trapped by the elective loop
-- ============================================================
--
-- THE BUG, IN ONE PARAGRAPH. An elective request that inventory could
-- not fully cover was skipped by the write-back loop in
-- services/engineClient.js. Nothing set its fulfillment_path, so it
-- stayed NULL, so the next batch 60 seconds later treated it as pending
-- again. It asked for its full original quantity, while its own
-- already-reserved units were excluded from the available pool, so the
-- engine reserved DIFFERENT units. The unique constraint on
-- (request_id, unit_id) cannot catch a different unit. Repeat every
-- minute.
--
-- Two consequences. The visible one is the impossible count in the
-- admin dashboard, "allocated: 3/2". The expensive one is that every
-- surplus unit is sitting at status 'reserved' against a request that
-- can never resolve, so it is out of circulation permanently.
--
-- The application fix now asks the engine for the REMAINING quantity
-- rather than the original, so this cannot recur. But the units already
-- trapped have to be freed here.

-- A1. What is over-allocated right now. Run this on its own first.
SELECT r.request_id,
       r.urgency_tier,
       r.quantity                       AS asked_for,
       COUNT(DISTINCT ar.unit_id)       AS allocated,
       COUNT(DISTINCT ar.unit_id) - r.quantity AS surplus,
       r.fulfillment_path,
       r.needed_by_date
  FROM requests r
  JOIN allocation_records ar ON ar.request_id = r.request_id
 WHERE r.cancelled_at IS NULL
 GROUP BY r.request_id, r.urgency_tier, r.quantity, r.fulfillment_path, r.needed_by_date
HAVING COUNT(DISTINCT ar.unit_id) > r.quantity
 ORDER BY surplus DESC;

-- A2. How many units that ties up, and what state they are in.
WITH ranked AS (
  SELECT ar.unit_id, iu.status,
         ROW_NUMBER() OVER (PARTITION BY ar.request_id ORDER BY ar.allocated_at, ar.unit_id) AS keep_rank,
         r.quantity
    FROM allocation_records ar
    JOIN requests r        ON r.request_id = ar.request_id
    JOIN inventory_units iu ON iu.unit_id  = ar.unit_id
   WHERE r.cancelled_at IS NULL
)
SELECT status, COUNT(*) AS surplus_units
  FROM ranked
 WHERE keep_rank > quantity
 GROUP BY status;

-- A3. Release the surplus.
--
-- The oldest allocations are kept and the newest dropped, because the
-- earliest one is the allocation that was actually correct; everything
-- after it is duplication. Units already 'dispatched' or 'delivered'
-- are never touched, matching the rule established in
-- migration_dedupe_allocations.sql: if the blood has physically moved,
-- the record stays, whatever the arithmetic says.
--
-- ONE STATEMENT, ON PURPOSE. Do not split it up.
--
-- The delete and the release have to happen together: a deleted
-- allocation whose unit stays 'reserved' is a unit lost forever, which
-- is the exact problem this section exists to fix.
--
-- An earlier version did this as BEGIN / CREATE TEMP TABLE / DELETE /
-- UPDATE / COMMIT. That works in psql and fails in the Supabase SQL
-- editor, which does not hold one session across statements, so the
-- temp table is already gone by the time the DELETE looks for it.
--
-- Data-modifying CTEs avoid the problem rather than working around it.
-- A single statement is atomic by definition, so there is no
-- transaction to manage and nothing that depends on session state. It
-- runs the same way in the Supabase editor, in psql, and through any
-- client library.
--
-- All parts of this statement see the SAME snapshot, taken before any
-- of it runs. That is why `kept` is computed from the window function
-- rather than by asking what allocation rows still exist afterwards:
-- a NOT EXISTS against allocation_records here would still see the
-- rows the DELETE is removing, and release nothing.
WITH ranked AS (
  SELECT ar.allocation_id, ar.unit_id, iu.status,
         ROW_NUMBER() OVER (PARTITION BY ar.request_id ORDER BY ar.allocated_at, ar.unit_id) AS keep_rank,
         r.quantity
    FROM allocation_records ar
    JOIN requests r         ON r.request_id = ar.request_id
    JOIN inventory_units iu ON iu.unit_id   = ar.unit_id
   WHERE r.cancelled_at IS NULL
),
surplus AS (
  SELECT allocation_id, unit_id
    FROM ranked
   WHERE keep_rank > quantity
     AND status NOT IN ('dispatched', 'delivered')
),
-- Units that some request still legitimately holds. A unit can appear
-- as surplus for one request and as a kept allocation for another, and
-- releasing it would strip a request of blood it is entitled to.
kept AS (
  SELECT DISTINCT unit_id FROM ranked WHERE keep_rank <= quantity
),
deleted AS (
  DELETE FROM allocation_records
   WHERE allocation_id IN (SELECT allocation_id FROM surplus)
  RETURNING unit_id
)
UPDATE inventory_units iu
   SET status = 'available'
 WHERE iu.unit_id IN (SELECT unit_id FROM deleted)
   AND iu.status = 'reserved'
   AND iu.unit_id NOT IN (SELECT unit_id FROM kept);

-- A4. Verify. Both queries must return zero rows.
SELECT r.request_id, r.quantity, COUNT(DISTINCT ar.unit_id) AS allocated
  FROM requests r
  JOIN allocation_records ar ON ar.request_id = r.request_id
 WHERE r.cancelled_at IS NULL
 GROUP BY r.request_id, r.quantity
HAVING COUNT(DISTINCT ar.unit_id) > r.quantity;

-- INFORMATIONAL, NOT A PASS/FAIL CHECK. Reserved units with no
-- allocation record pointing at them.
--
-- Read the number before reacting to it. On a database loaded from
-- seed_data.sql this is expected and harmless: generate_seed_data.py
-- writes status = 'reserved' directly on a sample of units without
-- creating matching allocation_records, so a clean seed shows roughly
-- 22 of these out of 67 reserved units. They are fabricated starting
-- state, not a leak.
--
-- On a database whose reservations were all made by the engine, any row
-- here IS a leak: a unit held out of circulation for a request that
-- does not claim it. If that is your situation, the release statement
-- below is the fix. It is left commented out because running it against
-- seeded data would quietly rewrite the sample state your demo depends
-- on.
SELECT COUNT(*) AS reserved_without_allocation
  FROM inventory_units iu
 WHERE iu.status = 'reserved'
   AND NOT EXISTS (SELECT 1 FROM allocation_records ar WHERE ar.unit_id = iu.unit_id);

-- UPDATE inventory_units iu
--    SET status = 'available'
--  WHERE iu.status = 'reserved'
--    AND NOT EXISTS (SELECT 1 FROM allocation_records ar WHERE ar.unit_id = iu.unit_id);

-- A5. Leave fulfillment_path alone.
--
-- Deliberate, and worth saying out loud so nobody "finishes the job"
-- later. Every elective request whose path is still NULL will be picked
-- up by the next allocation batch, and the fixed code now sets a path on
-- every route out: 'scheduled_reservation' when the date is far off,
-- 'scheduled_donor_mobilization' when it is close and donors are
-- invited, 'inventory' when it is fully covered. Setting paths by hand
-- here would just guess at what that code is about to compute properly.


-- ============================================================
-- SECTION B: hospitals stop holding blood
-- ============================================================
--
-- Hospitals consume blood; blood banks and NGOs supply it. A hospital
-- that runs its own blood bank registers that bank as a separate
-- organization with org_type 'blood_bank' and its own contact email.
--
-- The application code already enforces this from the moment it is
-- deployed: the optimizer's inventory query joins organizations and
-- accepts only supplier types, and POST /api/inventory refuses a
-- hospital target even for an admin. This section deals with the stock
-- that is already there.

-- B1. What is held where. Run first and read it.
SELECT o.org_type, iu.status, COUNT(*) AS units
  FROM inventory_units iu
  JOIN organizations o ON o.org_id = iu.org_id
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- B2. Which districts have hospital stock, and whether a bank exists
-- there to receive it.
SELECT o.district,
       COUNT(*) FILTER (WHERE iu.status IN ('available', 'reserved')) AS movable_units,
       COUNT(*) FILTER (WHERE iu.status = 'dispatched')               AS dispatched_units,
       (SELECT COUNT(*) FROM organizations b
         WHERE b.org_type = 'blood_bank' AND b.district = o.district) AS banks_in_district
  FROM inventory_units iu
  JOIN organizations o ON o.org_id = iu.org_id
 WHERE o.org_type = 'hospital'
 GROUP BY o.district
 ORDER BY movable_units DESC;

-- B3. Close out blood that has already left the building.
--
-- Units at 'dispatched' represent blood physically in transit or
-- already handed over. Re-pointing them at a different organization
-- would make the allocation log credit a bank for blood a hospital
-- actually sent, and disagree with the audit log, which still names the
-- hospital. They are marked 'delivered' and left where they are: they
-- completed under the old rules, and the no-hospital-stock rule applies
-- to blood that can still be allocated.
UPDATE inventory_units iu
   SET status = 'delivered'
  FROM organizations o
 WHERE o.org_id = iu.org_id
   AND o.org_type = 'hospital'
   AND iu.status = 'dispatched';

-- B4. Create a receiving bank only where a district has none.
--
-- Nothing is created for a district that already has a blood bank; the
-- stock moves to the existing one. In a clean seed this inserts two
-- rows, for Rajshahi and Rangpur.
--
-- contact_email is left NULL on purpose. Inventing an address would put
-- fabricated contact details in a table people are meant to trust, and
-- the partial unique index on contact_email permits any number of NULLs.
-- Register these banks properly through the application when someone is
-- actually going to operate one.
INSERT INTO organizations (name, org_type, district)
SELECT DISTINCT o.district || ' Regional Blood Bank', 'blood_bank', o.district
  FROM inventory_units iu
  JOIN organizations o ON o.org_id = iu.org_id
 WHERE o.org_type = 'hospital'
   AND iu.status IN ('available', 'reserved')
   AND NOT EXISTS (
     SELECT 1 FROM organizations b
      WHERE b.org_type = 'blood_bank' AND b.district = o.district
   );

-- B5. Move the movable stock to a bank in the same district.
--
-- Same district matters and is the whole reason this is not simply a
-- delete. The optimizer's distance term is a binary district match
-- (Optimization Engine/engine.py, distance_cost), so a unit that stays
-- in its district costs exactly what it cost before and allocation
-- behaviour is unchanged. A unit that crosses a district boundary is
-- penalised, and Rajshahi and Rangpur would have lost their only local
-- supply.
--
-- The receiving bank is chosen deterministically by name so that
-- re-running this cannot scatter one hospital's stock across several
-- banks.
UPDATE inventory_units iu
   SET org_id = (
     SELECT b.org_id
       FROM organizations b
      WHERE b.org_type = 'blood_bank'
        AND b.district = o.district
      ORDER BY b.name, b.org_id
      LIMIT 1
   )
  FROM organizations o
 WHERE o.org_id = iu.org_id
   AND o.org_type = 'hospital'
   AND iu.status IN ('available', 'reserved');

-- B6. Verify. The first query must return zero rows.
SELECT o.name, o.district, iu.status, COUNT(*) AS units
  FROM inventory_units iu
  JOIN organizations o ON o.org_id = iu.org_id
 WHERE o.org_type = 'hospital'
   AND iu.status IN ('available', 'reserved')
 GROUP BY 1, 2, 3;

-- Stock by type afterwards.
--
-- Hospitals should appear ONLY with 'delivered' and 'expired' rows, and
-- both are correct. The rule that matters is that a hospital holds no
-- blood that can be allocated to anyone; a terminal-state row is a
-- historical record, not stock. A clean seed leaves 14 delivered and 29
-- expired units sitting with hospitals, and the engine cannot see
-- either, since it reads only status = 'available'.
--
-- Deleting them would destroy the provenance of allocations that
-- already happened: allocation_records points at unit_id, and the
-- supplying organization is derived by joining inventory_units, so a
-- deleted unit takes its allocation history with it.
SELECT o.org_type, iu.status, COUNT(*) AS units
  FROM inventory_units iu
  JOIN organizations o ON o.org_id = iu.org_id
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- B7. Organizations that would violate the uniqueness index from
-- migration_refinements.sql.
--
-- Included here because Section B adds organizations, and if your
-- database still carries the seeded duplicates, this is the list you
-- have to clear before uq_organizations_identity can be created. A
-- clean seed load shows four sets.
SELECT lower(name) AS name, district, COALESCE(thana, '') AS thana, COUNT(*) AS copies
  FROM organizations
 GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
 ORDER BY copies DESC;