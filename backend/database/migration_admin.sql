-- Admin module migration (Phase 7.7 -- Admin). Idempotent: every statement
-- is IF NOT EXISTS so it can be re-run safely. Run against Supabase via the
-- SQL Editor, after every earlier migration.
--
-- Spec reference: admin_module_specification.md, Section 3.

-- 1. users: deactivation (soft, never hard-delete -- see spec 2.1) and the
--    first-admin flag (spec 2.9). is_primary_admin is ONLY ever set to true
--    by database/create_admin.js; no endpoint can grant it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_primary_admin  BOOLEAN NOT NULL DEFAULT false;

-- 2. requests: cancellation (spec 2.3). Two nullable columns rather than a
--    status enum, so no existing query breaks. The engine's pending query
--    adds "AND cancelled_at IS NULL" (engineClient.js).
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancelled_by  UUID REFERENCES users(user_id);

-- 3. notifications: per-user targeting (spec 2.6). Before this, a donor
--    (org_id = NULL on their users row) could never receive a notification
--    at all. user_id fixes that for every role; broadcast_id groups the
--    one-row-per-recipient fan-out of a single admin broadcast.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS user_id       UUID REFERENCES users(user_id),
  ADD COLUMN IF NOT EXISTS broadcast_id  UUID;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- 4. admin audit log (spec 2.5 / 2.6 / 2.7). Every admin write, every
--    view-as session, every report generation. Immutable by design: there
--    is no endpoint that updates or deletes rows here.
CREATE TABLE IF NOT EXISTS admin_actions (
  action_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID NOT NULL REFERENCES users(user_id),
  action_type    VARCHAR(50) NOT NULL,
  target_type    VARCHAR(50),
  target_id      UUID,
  details        JSONB,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin   ON admin_actions(admin_user_id);

-- 5. request_events: 'request_cancelled' is a new event_type. The column is
--    a free VARCHAR (no CHECK constraint on event_type), so nothing to alter
--    -- recorded here so the documented list of event types stays complete.
