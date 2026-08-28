-- RoktoNet — Phase 7.1 auth migration
-- Run this in Supabase's SQL Editor against the existing database.
-- Safe to run once; adds columns needed for real authentication.

-- 1. Auth state on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_verified        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS token_expires_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS full_name          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS created_at         TIMESTAMP NOT NULL DEFAULT now();

-- 2. Invite codes on organizations.
-- Org-affiliated roles (hospital / bank / ngo) must supply their org's code
-- at registration -- this is what stops anyone from self-claiming to be a
-- verified hospital and submitting fake critical requests.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS invite_code VARCHAR(20) UNIQUE;

-- 3. Generate a code for every existing organization that lacks one.
UPDATE organizations
SET invite_code = upper(substring(md5(random()::text || org_id::text) from 1 for 8))
WHERE invite_code IS NULL;

-- 4. Look up the codes you'll need for testing:
--    SELECT name, org_type, district, invite_code FROM organizations ORDER BY org_type, name;
