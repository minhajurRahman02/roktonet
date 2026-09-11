-- RoktoNet -- Donor role migration part 1: contact info + avatars
-- Run in Supabase's SQL Editor against the existing database.
--
-- organizations had no contact info at all -- needed so a donor who
-- confirms an invite (or wants to attend a drive found via browsing) has
-- an actual phone number to call, not just an org name. Symmetric with
-- how hospitals already see donor contact info on confirmed invites,
-- except intentionally NOT gated behind confirming first -- an org isn't
-- a private individual, so there's no equivalent reason to hide it.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(200);

-- Profile pictures, universal across every role -- stored in Supabase
-- Storage (not on the backend's own filesystem, which is ephemeral on
-- most free-tier hosts and would be wiped on every redeploy). This
-- column just holds the resulting public URL.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
