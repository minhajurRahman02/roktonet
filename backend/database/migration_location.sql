-- RoktoNet -- location precision migration
-- Run in Supabase's SQL Editor against the existing database.
--
-- Adds real district/thana-level location tracking for donors and
-- organizations, replacing the division-level "district" field and the
-- complete absence of donor location data. See project chat log for the
-- full design discussion (Matuail/Tongi problem, Tiers 1-3, why Tier 2
-- was chosen).
--
-- This migration is purely ADDITIVE -- no existing rows are dropped or
-- altered here. Correcting organizations.district from division-level
-- values (e.g. "Dhaka" meaning the whole division) to real district
-- values is a DATA change, not a schema change, and needs a coordinated
-- reseed with the team (Section 15's TRUNCATE-coordination norm) --
-- deliberately NOT done in this migration.

-- 1. Enable trigram similarity matching -- needed to resolve free-typed
--    thana names (typos, spelling variants) against the canonical list
--    below, instead of requiring exact string equality.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Canonical reference table: real Bangladesh districts + thana/upazila
--    names. Static, not user-editable. See seed_bd_thanas.sql for the
--    sourcing notes and the Dhaka-metro-only limitation.
CREATE TABLE IF NOT EXISTS bd_thanas (
  thana_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      VARCHAR(100) NOT NULL,
  district  VARCHAR(100) NOT NULL
);

-- Trigram index -- makes similarity()-based fuzzy lookups fast instead of
-- a full table scan on every donor/org registration.
CREATE INDEX IF NOT EXISTS idx_bd_thanas_name_trgm
  ON bd_thanas USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_bd_thanas_district ON bd_thanas (district);

-- 3. Organizations: add thana fields, symmetric with donors below, so
--    matching compares donor and org location at the same granularity.
--    "district" is NOT altered here -- see the coordinated-reseed note above.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS thana     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS thana_id  UUID REFERENCES bd_thanas(thana_id);

-- 4. Donors: current-location fields (not permanent -- see chat log for
--    why), phone number, and the user_id link that was previously
--    missing entirely (a donor's login account and their donors-table
--    row had no connection at all before this).
ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS user_id            UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS current_district   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS current_thana      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS current_thana_id   UUID REFERENCES bd_thanas(thana_id),
  ADD COLUMN IF NOT EXISTS phone_number       VARCHAR(20);

-- One donor account per user, and vice versa -- prevents two different
-- users both claiming to "be" the same donor record.
CREATE UNIQUE INDEX IF NOT EXISTS idx_donors_user_id
  ON donors (user_id) WHERE user_id IS NOT NULL;

-- 5. Inventory: 'delivered' terminal state, for the dispatch->delivered
--    confirmation workflow. Postgres CHECK constraints can't be altered
--    in place -- drop and recreate with the new allowed value.
ALTER TABLE inventory_units DROP CONSTRAINT IF EXISTS inventory_units_status_check;
ALTER TABLE inventory_units
  ADD CONSTRAINT inventory_units_status_check
  CHECK (status IN ('available', 'reserved', 'dispatched', 'delivered', 'expired'));

-- 6. Notifications -- hybrid in-app system. org_id NULL means an
--    admin-wide broadcast rather than an org-specific notification.
CREATE TABLE IF NOT EXISTS notifications (
  notification_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID REFERENCES organizations(org_id),
  type                VARCHAR(50) NOT NULL,
  message             TEXT NOT NULL,
  related_request_id  UUID REFERENCES requests(request_id),
  is_read             BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_org_id ON notifications (org_id);

-- event_type values in use (documented here, not DB-enforced, same
-- convention as migration_request_events.sql):
--   request_resolved, dispatch_needed, delivery_confirmed,
--   donor_invited, donor_responded
