import { describe, expect, it } from 'vitest';
import { computeAgentStatus } from '../src/client/lib/agentStatus';
import type { Activity, Agent } from '../src/client/types';

function agent(name: string): Agent {
  return { id: `id-${name}`, name, role: `role-${name}`, description: null, color: null, created_at: 0 };
}

function activity(name: string, ts: number): Activity {
  return {
    id: `${name}-${ts}`,
    agent_name: name,
    session_id: 's1',
    tool_name: 'Bash',
    tool_input: null,
    tool_result: null,
    hook_event: 'PreToolUse',
    timestamp: ts,
    status: 'completed',
    duration_ms: null,
    timestamp_ms: null,
    tool_use_id: null,
  };
}

describe('computeAgentStatus', () => {
  const now = 1000;
  const colorMap = new Map([['a', '#ff0000']]);

  it('marks active only when latest activity is within 60s (boundary at 60)', () => {
    const agents = [agent('a'), agent('b'), agent('c')];
    const acts = [activity('a', now - 59), activity('b', now - 60), activity('c', now - 61)];
    const s = computeAgentStatus(agents, acts, now, colorMap);
    expect(s.find((x) => x.name === 'a')?.active).toBe(true);
    expect(s.find((x) => x.name === 'b')?.active).toBe(false);
    expect(s.find((x) => x.name === 'c')?.active).toBe(false);
  });

  it('is inactive with no activity and carries color/role/last', () => {
    const s = computeAgentStatus([agent('a')], [], now, colorMap);
    expect(s[0]).toMatchObject({ name: 'a', role: 'role-a', active: false, color: '#ff0000', last: null });
  });

  it('uses the most recent activity per agent', () => {
    const s = computeAgentStatus([agent('a')], [activity('a', now - 10), activity('a', now - 5)], now, colorMap);
    expect(s[0].last?.timestamp).toBe(now - 5);
    expect(s[0].active).toBe(true);
  });
});
