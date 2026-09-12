CREATE TABLE request_events (
  event_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES requests(request_id),
  event_type  VARCHAR(50) NOT NULL,
  message     TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_request_events_request_id ON request_events(request_id);
