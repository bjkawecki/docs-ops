CREATE TABLE IF NOT EXISTS user_notification (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS user_notification_user_created_idx
  ON user_notification (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notification_user_unread_idx
  ON user_notification (user_id)
  WHERE read_at IS NULL;
