CREATE TABLE of_webhook_events (
  event_id text PRIMARY KEY,
  event text NOT NULL,
  payload_enc text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  outcome text
);
CREATE INDEX idx_of_webhook_pending ON of_webhook_events(next_attempt_at) WHERE processed_at IS NULL;
