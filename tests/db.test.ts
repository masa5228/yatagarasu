import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import {
  createAgent,
  ensureAgent,
  getAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  insertActivity,
  getRecentActivities,
  _resetForTests,
  type Activity,
} from '../src/server/db';

beforeEach(() => _resetForTests());

function makeActivity(over: Partial<Activity> = {}): Activity {
  return {
    id: randomUUID(),
    agent_name: 'researcher',
    session_id: 's1',
    tool_name: 'WebSearch',
    tool_input: '{"query":"x"}',
    tool_result: null,
    hook_event: 'PreToolUse',
    timestamp: Math.floor(Date.now() / 1000),
    status: 'completed',
    duration_ms: null,
    timestamp_ms: Date.now(),
    tool_use_id: null,
    ...over,
  };
}

describe('agents', () => {
  it('creates with default role and a uuid', () => {
    const a = createAgent({ name: 'researcher' });
    expect(a.name).toBe('researcher');
    expect(a.role).toBe('未設定');
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('keeps an explicitly provided role', () => {
    const a = createAgent({ name: 'git-hub', role: 'Git/GitHub', color: '#00b8ff' });
    expect(a.role).toBe('Git/GitHub');
    expect(a.color).toBe('#00b8ff');
  });

  it('ensureAgent registers once and is idempotent', () => {
    ensureAgent('git-hub');
    ensureAgent('git-hub');
    expect(getAgents().filter((a) => a.name === 'git-hub')).toHaveLength(1);
  });

  it('updates and deletes', () => {
    const a = createAgent({ name: 'x', role: 'r' });
    const updated = updateAgent(a.id, { name: 'x', role: 'r2' });
    expect(updated?.role).toBe('r2');
    expect(deleteAgent(a.id)).toBe(true);
    expect(getAgentById(a.id)).toBeUndefined();
    expect(deleteAgent(a.id)).toBe(false);
  });

  it('rejects duplicate names at the db level', () => {
    createAgent({ name: 'dup' });
    expect(() => createAgent({ name: 'dup' })).toThrow();
  });
});

describe('activities', () => {
  it('inserts and returns recent newest-first', () => {
    insertActivity(makeActivity({ tool_name: 'A' }));
    insertActivity(makeActivity({ tool_name: 'B' }));
    const recent = getRecentActivities(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].tool_name).toBe('B');
    expect(recent[1].tool_name).toBe('A');
  });

  it('respects the limit', () => {
    for (let i = 0; i < 5; i++) insertActivity(makeActivity());
    expect(getRecentActivities(3)).toHaveLength(3);
  });
});
