CREATE TABLE IF NOT EXISTS admin_job_action_audit (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_job_id TEXT NULL,
  target_job_name TEXT NULL,
  status TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_job_action_audit_created_at_idx
  ON admin_job_action_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_job_action_audit_action_status_idx
  ON admin_job_action_audit (action, status, created_at DESC);
