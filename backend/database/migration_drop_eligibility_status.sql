-- ============================================================================
-- migration_drop_eligibility_status.sql
--
-- Removes donors.eligibility_status. Eligibility is computed from
-- last_donation_date + last_donation_component + sex from here on, in one
-- place, by backend/services/eligibility.js.
--
-- WHY THE COLUMN HAS TO GO, not just be fixed:
-- it was written exactly once, at INSERT, hardcoded to 'eligible', by both
-- registration paths (routes/auth.js and routes/donors.js). There was no
-- UPDATE of it anywhere in the codebase. Assisted registration would accept
-- a last_donation_date from last week and still store 'eligible'. So the
-- column was wrong from the moment each row was created and had no
-- mechanism to ever become right.
--
-- It was being read by six places: the admin Donors badge and details
-- modal, the User Detail donor panel, the "Donors eligible now" KPI, the
-- donors report export, and the SQL eligibility filter. All six were
-- reporting the same falsehood.
--
-- Keeping it as a maintained cache was the alternative. Rejected: it would
-- still be capable of drifting out of sync, and the three inputs it derives
-- from are already on the row, so the cache buys nothing but a second thing
-- that can be wrong.
--
-- NOT REVERSIBLE in any useful sense. The column can be re-added, but its
-- contents cannot be recovered -- and since every value in it was the
-- literal string 'eligible' regardless of the donor's real state, there is
-- nothing in it worth recovering.
--
-- Run AFTER migration_dedupe_allocations.sql. Safe to run more than once.
-- ============================================================================

BEGIN;

-- What is about to be lost, for the record. Expect the overwhelming
-- majority to be 'eligible' -- that is the bug, visible as data.
SELECT eligibility_status, COUNT(*) AS donors
FROM donors
GROUP BY eligibility_status
ORDER BY donors DESC;

-- How many of those 'eligible' rows were actually wrong: donors whose last
-- whole blood donation is inside even the shorter (male, 120 day) interval,
-- yet who the column still calls eligible. This is the number to quote when
-- explaining why the column was dropped.
SELECT COUNT(*) AS wrongly_marked_eligible
FROM donors
WHERE eligibility_status = 'eligible'
  AND last_donation_date IS NOT NULL
  AND last_donation_component = 'whole_blood'
  AND last_donation_date > CURRENT_DATE - INTERVAL '120 days';

-- The drop. The inline CHECK constraint goes with the column
-- automatically; there is no separate named constraint to clean up, and no
-- index on it.
ALTER TABLE donors DROP COLUMN IF EXISTS eligibility_status;

COMMIT;


-- ============================================================================
-- AFTER THIS RUNS
--
-- Two things become load-bearing that previously were not, because the
-- computation genuinely depends on them:
--
--   donors.sex                       -- whole blood interval is 120 days for
--                                       male, 180 for female. A NULL sex
--                                       falls back to the longer (female)
--                                       interval, which is the conservative
--                                       direction: it can only ever say
--                                       "not yet", never wrongly say "go
--                                       ahead". Self-registration and
--                                       assisted registration both require
--                                       sex already, so only legacy and seed
--                                       rows are affected.
--
--   donors.last_donation_component   -- the crossover matrix cannot be
--                                       applied without knowing which
--                                       component started the cooldown. A
--                                       NULL here is treated as "no known
--                                       donation", so the donor reads as
--                                       eligible. That is the honest answer
--                                       for a row where we genuinely do not
--                                       know, and it matches what the donor's
--                                       own dashboard has always shown them.
--
-- Neither is backfilled here. Inventing a sex or a component to make the
-- numbers look tidier would reintroduce exactly the class of problem this
-- migration removes.
-- ============================================================================

-- How many donors are in each of those two states, so the gap is a known
-- number rather than a surprise later.
SELECT
  COUNT(*)                                                   AS donors_total,
  COUNT(*) FILTER (WHERE sex IS NULL)                        AS missing_sex,
  COUNT(*) FILTER (WHERE last_donation_date IS NOT NULL
                     AND last_donation_component IS NULL)    AS donated_but_component_unknown
FROM donors;
