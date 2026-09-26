-- ============================================================
-- RoktoNet migration 19: drive scheduling, notes and reminders
--
-- Supports three features that all touch donor_drives:
--
--   * a reminder when a scheduled drive's date passes and it was never
--     started                                              (item 7)
--   * deleting an upcoming drive                           (item 8)
--   * the NGO scheduler calendar's per-date notes          (item 9)
--
-- Runs clean on any database. No data is moved or removed.
-- ============================================================


-- 1. Remember that a drive has already been chased.
--
-- The overdue reminder runs on the same timer as the allocation batch,
-- which by default fires every 60 seconds. Without somewhere to record
-- that the NGO has been told, a drive whose date slipped would generate
-- a notification every single minute until somebody dealt with it,
-- which is how a notification system teaches people to ignore it.
--
-- A timestamp rather than a boolean, so the reminder can be repeated
-- deliberately later (a daily nudge, say) without another migration,
-- and so support can see when the first one went out.
ALTER TABLE donor_drives
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMP;

-- Partial index: the reminder query only ever looks for planned drives
-- that have not been chased, which on a healthy system is almost none
-- of the table.
CREATE INDEX IF NOT EXISTS idx_donor_drives_overdue
  ON donor_drives (drive_date)
  WHERE status = 'planned' AND overdue_notified_at IS NULL;


-- 2. Notes written on the NGO scheduler calendar.
--
-- One note per organization per date, which is why the uniqueness
-- constraint is on (org_id, note_date) rather than a plain primary key
-- on an id. Clicking a date that already has a note opens it for
-- editing rather than stacking a second one, and the constraint is what
-- makes that true even if two people in the same NGO click at once.
--
-- The note belongs to the ORGANIZATION, not the person who typed it. An
-- NGO's scheduler is shared: a note saying "venue confirmed, 40 chairs"
-- is useless if only its author can see it. created_by is kept for
-- provenance, and is nullable so removing a user account does not take
-- the team's notes with it.
CREATE TABLE IF NOT EXISTS drive_notes (
  note_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  note_date   DATE NOT NULL,
  body        TEXT NOT NULL,
  created_by  UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_drive_notes_org_date UNIQUE (org_id, note_date)
);

-- The calendar loads a month at a time, so every read is
-- org_id plus a date range.
CREATE INDEX IF NOT EXISTS idx_drive_notes_org_date
  ON drive_notes (org_id, note_date);


-- 3. Verify.
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'donor_drives' AND column_name = 'overdue_notified_at';
-- expect one row: overdue_notified_at, YES

SELECT column_name FROM information_schema.columns
 WHERE table_name = 'drive_notes' ORDER BY ordinal_position;
-- expect 7: note_id, org_id, note_date, body, created_by, created_at, updated_at

SELECT indexname FROM pg_indexes
 WHERE tablename IN ('donor_drives', 'drive_notes')
   AND indexname IN ('idx_donor_drives_overdue', 'idx_drive_notes_org_date');
-- expect both
