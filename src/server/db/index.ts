import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { schema, activityColumnMigrations } from './schema';

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string | null;
  color: string | null;
  created_at: number;
}

export type ActivityStatus = 'running' | 'completed' | 'error';

export interface Activity {
  id: string;
  agent_name: string;
  session_id: string;
  tool_name: string;
  tool_input: string | null;
  tool_result: string | null;
  hook_event: string;
  timestamp: number;
  status: ActivityStatus;
  duration_ms: number | null;
  timestamp_ms: number | null;
  tool_use_id: string | null;
}

export interface AgentInput {
  name: string;
  role?: string;
  description?: string | null;
  color?: string | null;
}

export interface ToolCount {
  tool_name: string;
  count: number;
}

export interface AgentStats {
  name: string;
  total: number;
  errors: number;
  avg_duration_ms: number | null;
  last_ts: number;
  tools: ToolCount[];
  hourly: number[];
}

const dbPath = process.env.YATA_DB_PATH ?? join(homedir(), '.yatagarasu', 'yatagarasu.sqlite');
if (dbPath !== ':memory:') {
  mkdirSync(dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(schema);

const existingColumns = new Set(
  (db.prepare(`PRAGMA table_info(activities)`).all() as { name: string }[]).map((c) => c.name),
);
for (const [column, ddl] of Object.entries(activityColumnMigrations)) {
  if (!existingColumns.has(column)) db.exec(ddl);
}

const PAIRING_WINDOW_SECONDS = 3600;
export const HOURLY_BUCKETS = 24;

const statements = {
  insertActivity: db.prepare(
    `INSERT INTO activities (id, agent_name, session_id, tool_name, tool_input, tool_result, hook_event, timestamp, status, duration_ms, timestamp_ms, tool_use_id)
     VALUES (@id, @agent_name, @session_id, @tool_name, @tool_input, @tool_result, @hook_event, @timestamp, @status, @duration_ms, @timestamp_ms, @tool_use_id)`,
  ),
  recentActivities: db.prepare(
    `SELECT * FROM activities ORDER BY timestamp DESC, rowid DESC LIMIT ?`,
  ),
  activityById: db.prepare(`SELECT * FROM activities WHERE id = ?`),
  runningByToolUseId: db.prepare(
    `SELECT * FROM activities WHERE tool_use_id = ? AND status = 'running'
     ORDER BY rowid DESC LIMIT 1`,
  ),
  runningByContext: db.prepare(
    `SELECT * FROM activities
     WHERE agent_name = ? AND session_id = ? AND tool_name = ? AND status = 'running' AND timestamp >= ?
     ORDER BY rowid DESC LIMIT 1`,
  ),
  completeActivity: db.prepare(
    `UPDATE activities
     SET tool_result = @tool_result, status = @status, duration_ms = @duration_ms, hook_event = @hook_event
     WHERE id = @id`,
  ),
  purgeActivities: db.prepare(`DELETE FROM activities WHERE timestamp < ?`),
  agentTotals: db.prepare(
    `SELECT agent_name,
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
            AVG(duration_ms) AS avg_duration_ms,
            MAX(timestamp) AS last_ts
     FROM activities GROUP BY agent_name`,
  ),
  toolCounts: db.prepare(
    `SELECT agent_name, tool_name, COUNT(*) AS count
     FROM activities GROUP BY agent_name, tool_name
     ORDER BY count DESC, tool_name ASC`,
  ),
  hourlyCounts: db.prepare(
    `SELECT agent_name, CAST(timestamp / 3600 AS INTEGER) AS bucket, COUNT(*) AS count
     FROM activities WHERE timestamp >= ?
     GROUP BY agent_name, bucket`,
  ),
  agentByName: db.prepare(`SELECT * FROM agents WHERE name = ?`),
  allAgents: db.prepare(`SELECT * FROM agents ORDER BY created_at ASC`),
  agentById: db.prepare(`SELECT * FROM agents WHERE id = ?`),
  insertAgent: db.prepare(
    `INSERT INTO agents (id, name, role, description, color, created_at)
     VALUES (@id, @name, @role, @description, @color, @created_at)`,
  ),
  updateAgent: db.prepare(
    `UPDATE agents SET name = @name, role = @role, description = @description, color = @color WHERE id = @id`,
  ),
  deleteAgent: db.prepare(`DELETE FROM agents WHERE id = ?`),
};

const PALETTE = ['#00ff9d', '#00b8ff', '#ff6b6b', '#ffd93d', '#c084fc', '#ff9f1c'];

export function insertActivity(activity: Activity): void {
  statements.insertActivity.run(activity);
}

export function getRecentActivities(limit = 100): Activity[] {
  return statements.recentActivities.all(limit) as Activity[];
}

export function getActivityById(id: string): Activity | undefined {
  return statements.activityById.get(id) as Activity | undefined;
}

export function findRunningActivity(match: {
  tool_use_id: string | null;
  agent_name: string;
  session_id: string;
  tool_name: string;
}): Activity | undefined {
  if (match.tool_use_id) {
    return statements.runningByToolUseId.get(match.tool_use_id) as Activity | undefined;
  }
  const windowStart = Math.floor(Date.now() / 1000) - PAIRING_WINDOW_SECONDS;
  return statements.runningByContext.get(
    match.agent_name,
    match.session_id,
    match.tool_name,
    windowStart,
  ) as Activity | undefined;
}

export function completeActivity(
  id: string,
  update: {
    tool_result: string | null;
    status: ActivityStatus;
    duration_ms: number | null;
    hook_event: string;
  },
): Activity | undefined {
  const changed = statements.completeActivity.run({ id, ...update }).changes;
  if (changed === 0) return undefined;
  return getActivityById(id);
}

export function purgeActivitiesBefore(cutoff: number): number {
  return statements.purgeActivities.run(cutoff).changes;
}

export function getAgentStats(now = Math.floor(Date.now() / 1000)): AgentStats[] {
  const totals = statements.agentTotals.all() as {
    agent_name: string;
    total: number;
    errors: number;
    avg_duration_ms: number | null;
    last_ts: number;
  }[];
  const tools = statements.toolCounts.all() as {
    agent_name: string;
    tool_name: string;
    count: number;
  }[];
  const currentBucket = Math.floor(now / 3600);
  const hourlyStart = (currentBucket - (HOURLY_BUCKETS - 1)) * 3600;
  const hourly = statements.hourlyCounts.all(hourlyStart) as {
    agent_name: string;
    bucket: number;
    count: number;
  }[];

  return totals.map((t) => {
    const buckets = new Array<number>(HOURLY_BUCKETS).fill(0);
    for (const h of hourly) {
      if (h.agent_name !== t.agent_name) continue;
      const index = HOURLY_BUCKETS - 1 - (currentBucket - h.bucket);
      if (index >= 0 && index < HOURLY_BUCKETS) buckets[index] = h.count;
    }
    return {
      name: t.agent_name,
      total: t.total,
      errors: t.errors,
      avg_duration_ms: t.avg_duration_ms == null ? null : Math.round(t.avg_duration_ms),
      last_ts: t.last_ts,
      tools: tools
        .filter((tc) => tc.agent_name === t.agent_name)
        .map(({ tool_name, count }) => ({ tool_name, count })),
      hourly: buckets,
    };
  });
}

export function getAgentByName(name: string): Agent | undefined {
  return statements.agentByName.get(name) as Agent | undefined;
}

export function getAgents(): Agent[] {
  return statements.allAgents.all() as Agent[];
}

export function getAgentById(id: string): Agent | undefined {
  return statements.agentById.get(id) as Agent | undefined;
}

export function createAgent(input: AgentInput): Agent {
  const agent: Agent = {
    id: randomUUID(),
    name: input.name,
    role: input.role && input.role.length > 0 ? input.role : '未設定',
    description: input.description ?? null,
    color: input.color ?? null,
    created_at: Math.floor(Date.now() / 1000),
  };
  statements.insertAgent.run(agent);
  return agent;
}

export function ensureAgent(name: string): void {
  if (getAgentByName(name)) return;
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  createAgent({ name, role: '未設定', color });
}

export function updateAgent(id: string, input: AgentInput): Agent | undefined {
  if (!getAgentById(id)) return undefined;
  statements.updateAgent.run({
    id,
    name: input.name,
    role: input.role && input.role.length > 0 ? input.role : '未設定',
    description: input.description ?? null,
    color: input.color ?? null,
  });
  return getAgentById(id);
}

export function deleteAgent(id: string): boolean {
  return statements.deleteAgent.run(id).changes > 0;
}

export function _resetForTests(): void {
  db.exec('DELETE FROM activities; DELETE FROM agents;');
}
