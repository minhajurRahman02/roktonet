-- RoktoNet -- donor eligibility refactor migration
-- Run in Supabase's SQL Editor against the existing database.
--
-- Prompted by reviewing a real Bangladesh blood-donation protocol
-- document plus independent research, which surfaced that our
-- single-flat-cooldown eligibility model was missing two real,
-- medically-relevant dimensions: whole blood's interval genuinely
-- differs by donor sex (120 days male / 180 days female, independently
-- verified against two separate Bangladesh sources), and the wait
-- period after a donation depends on BOTH what was just given and what's
-- being asked for next (a donor who just gave platelets can give whole
-- blood again far sooner than one who just gave whole blood).
--
-- Deliberately NOT added: donor weight/height/hemoglobin/BP/pulse/
-- temperature (real-time clinical vitals a Medical Officer checks
-- on-site, not something this logistics/allocation platform should be
-- gating on), and most temporary/permanent deferral reasons (tattoos,
-- surgery, pregnancy, illness history) -- those would mean storing real
-- health history per donor, a different kind of system than RoktoNet is,
-- and disproportionate scope for what's left of this project.

-- sex is required going forward (enforced at the application layer, not
-- a NOT NULL constraint here, since existing donor rows predate this
-- field and have no way to backfill it) -- the eligibility computation
-- treats a NULL sex (legacy donors only) by defaulting to the longer,
-- more conservative whole-blood interval, never the shorter one.
ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS sex VARCHAR(10) CHECK (sex IN ('male', 'female'));

-- Which component was last donated -- needed because the wait period
-- before the NEXT donation depends on this, not just when it happened.
-- NULL means never donated (no cooldown applies at all).
ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS last_donation_component VARCHAR(20)
    CHECK (last_donation_component IN ('whole_blood', 'platelets', 'plasma'));
