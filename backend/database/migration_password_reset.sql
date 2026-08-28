-- RoktoNet — Phase 7.3 migration: password reset support
-- Run in Supabase's SQL Editor.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token            VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reset_token_expires_at  TIMESTAMP;
