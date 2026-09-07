-- RoktoNet -- NGO module migration
-- Run in Supabase's SQL Editor against the existing database.
--
-- Adds blood drives (the NGO's core loop: create -> start -> log units
-- live -> finish) and closes a real gap found while designing this:
-- donors had no full_name column at all -- self-registered donors get
-- their name from the linked users row, but an assisted (no-login) donor
-- has no users row to borrow a name from. Storing full_name directly on
-- donors, for every donor regardless of registration path, means the
-- frontend never needs conditional logic to figure out where a donor's
-- display name lives.

-- 1. Blood drives -- a real state machine (planned -> active -> completed
--    /cancelled), not just a single timestamp. started_at/completed_at
--    are separate from drive_date (the calendar date it was scheduled
--    for) since "the day it happened" and "the moment someone pressed
--    Start" are genuinely different facts worth keeping for the eventual
--    drive-summary statistics.
CREATE TABLE IF NOT EXISTS donor_drives (
  drive_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(org_id),
  title         VARCHAR(200) NOT NULL,
  location      VARCHAR(200) NOT NULL,
  drive_date    DATE NOT NULL,
  target_units  INTEGER,
  status        VARCHAR(20) NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  started_at    TIMESTAMP,
  completed_at  TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donor_drives_org_id ON donor_drives (org_id);

-- 2. Traces a unit back to the drive that produced it, if any (units
--    logged outside a drive context, e.g. Blood Bank's Add Inventory
--    Unit, simply leave this NULL).
ALTER TABLE inventory_units
  ADD COLUMN IF NOT EXISTS drive_id UUID REFERENCES donor_drives(drive_id);

-- 3. Donors: full_name (closes the gap above) and email (needed for the
--    login-invite flow -- an assisted donor has no users row yet, so
--    nowhere else to keep an email on file).
ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS email     VARCHAR(200);

-- 4. inventory_units had no created_at at all -- collection_date is a
--    DATE (the day blood was drawn), not precise enough to show "logged
--    3 minutes ago" in the Active Drive session's live feed. Defaults to
--    now() so nothing needs to explicitly set it going forward.
ALTER TABLE inventory_units
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now();
