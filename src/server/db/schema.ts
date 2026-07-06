export const schema = `
CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL,
  description TEXT,
  color       TEXT,
  created_at  INTEGER
);

CREATE TABLE IF NOT EXISTS activities (
  id          TEXT PRIMARY KEY,
  agent_name  TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  tool_input  TEXT,
  tool_result TEXT,
  hook_event  TEXT NOT NULL,
  timestamp   INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'completed',
  duration_ms INTEGER,
  timestamp_ms INTEGER,
  tool_use_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
`;

export const activityColumnMigrations: Record<string, string> = {
  status: `ALTER TABLE activities ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`,
  duration_ms: `ALTER TABLE activities ADD COLUMN duration_ms INTEGER`,
  timestamp_ms: `ALTER TABLE activities ADD COLUMN timestamp_ms INTEGER`,
  tool_use_id: `ALTER TABLE activities ADD COLUMN tool_use_id TEXT`,
};
