import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { schema } from './schema';

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string | null;
  color: string | null;
  created_at: number;
}

export interface Activity {
  id: string;
  agent_name: string;
  session_id: string;
  tool_name: string;
  tool_input: string | null;
  tool_result: string | null;
  hook_event: string;
  timestamp: number;
}

export interface AgentInput {
  name: string;
  role?: string;
  description?: string | null;
  color?: string | null;
}

const dbPath = process.env.YATA_DB_PATH ?? join(homedir(), '.yatagarasu', 'yatagarasu.sqlite');
if (dbPath !== ':memory:') {
  mkdirSync(dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(schema);

const statements = {
  insertActivity: db.prepare(
    `INSERT INTO activities (id, agent_name, session_id, tool_name, tool_input, tool_result, hook_event, timestamp)
     VALUES (@id, @agent_name, @session_id, @tool_name, @tool_input, @tool_result, @hook_event, @timestamp)`,
  ),
  recentActivities: db.prepare(
    `SELECT * FROM activities ORDER BY timestamp DESC, rowid DESC LIMIT ?`,
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
