-- RoktoNet -- donors.created_at migration
-- Run in Supabase's SQL Editor against the existing database.
--
-- donors had no timestamp column at all -- needed for the Overview
-- page's "recently registered donors" section. Same gap this project
-- already hit once before with inventory_units (fixed the same way,
-- same reasoning: a business-date column like last_donation_date isn't
-- precise enough for "recently" sorting, and isn't what this is anyway).

ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now();
