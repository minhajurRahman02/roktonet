-- RoktoNet -- restock urgency tier migration
-- Run in Supabase's SQL Editor against the existing database.
--
-- Adds 'restock' as a valid urgency_tier value, per the design already
-- locked in dashboard_specification.md Section 4: blood bank restock
-- requests flow through the exact same requests table and engine as
-- patient requests, at the lowest priority tier (weight 0.5, below
-- elective's 1) -- not a separate system.

ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_urgency_tier_check;
ALTER TABLE requests
  ADD CONSTRAINT requests_urgency_tier_check
  CHECK (urgency_tier IN ('elective', 'routine', 'urgent', 'critical', 'restock'));
