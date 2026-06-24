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
  timestamp   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
`;
