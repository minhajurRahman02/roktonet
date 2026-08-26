-- RoktoNet — request tracking log (Phase 7.7 follow-up)
-- Real events logged at each genuine pipeline stage -- no fabricated
-- steps. Reusable later for Admin's system-wide audit view.

CREATE TABLE request_events (
  event_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES requests(request_id),
  event_type  VARCHAR(50) NOT NULL,
  message     TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_request_events_request_id ON request_events(request_id);

-- event_type values in use (documented here, not DB-enforced, for flexibility):
--   posted, engine_invoked, engine_resolved_inventory, engine_shortfall,
--   donor_search_triggered, donors_invited, donor_responded, escalation_triggered
