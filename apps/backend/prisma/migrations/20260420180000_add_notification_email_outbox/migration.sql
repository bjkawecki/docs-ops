CREATE TABLE IF NOT EXISTS notification_email_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,
  error TEXT NULL
);

CREATE INDEX IF NOT EXISTS notification_email_outbox_status_idx
  ON notification_email_outbox (status, queued_at ASC);
