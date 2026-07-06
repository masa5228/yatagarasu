import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/index';
import { _resetForTests } from '../src/server/db';

const app = createApp();

beforeEach(() => _resetForTests());

async function hook(agent: string, event: string, tool: string, extra: Record<string, unknown> = {}) {
  await request(app)
    .post(`/api/hook?agent=${agent}`)
    .send({ session_id: 's1', hook_event_name: event, tool_name: tool, ...extra })
    .expect(200);
}

describe('GET /api/stats', () => {
  it('returns empty agents array when there is no activity', async () => {
    const res = await request(app).get('/api/stats').expect(200);
    expect(res.body.agents).toEqual([]);
  });

  it('aggregates totals, errors, and tool counts per agent', async () => {
    await hook('r1', 'PreToolUse', 'Bash');
    await hook('r1', 'PostToolUse', 'Bash', { tool_response: { stdout: 'ok' } });
    await hook('r1', 'PreToolUse', 'WebSearch');
    await hook('r1', 'PostToolUse', 'WebSearch', { tool_response: { error: 'rate limit' } });
    await hook('r1', 'PreToolUse', 'Bash');
    await hook('r2', 'PreToolUse', 'Read');

    const res = await request(app).get('/api/stats').expect(200);
    const agents = res.body.agents as {
      name: string;
      total: number;
      errors: number;
      tools: { tool_name: string; count: number }[];
      hourly: number[];
    }[];

    const r1 = agents.find((a) => a.name === 'r1');
    const r2 = agents.find((a) => a.name === 'r2');

    expect(r1?.total).toBe(3);
    expect(r1?.errors).toBe(1);
    expect(r1?.tools).toEqual(
      expect.arrayContaining([
        { tool_name: 'Bash', count: 2 },
        { tool_name: 'WebSearch', count: 1 },
      ]),
    );
    expect(r2?.total).toBe(1);
    expect(r2?.errors).toBe(0);
  });

  it('reports paired-call average duration and 24h hourly buckets', async () => {
    await hook('r1', 'PreToolUse', 'Bash');
    await hook('r1', 'PostToolUse', 'Bash', { tool_response: { stdout: 'ok' } });

    const res = await request(app).get('/api/stats').expect(200);
    const r1 = res.body.agents.find((a: { name: string }) => a.name === 'r1');

    expect(r1.avg_duration_ms).toBeGreaterThanOrEqual(0);
    expect(r1.hourly).toHaveLength(24);
    const hourlySum = r1.hourly.reduce((sum: number, n: number) => sum + n, 0);
    expect(hourlySum).toBe(r1.total);
    expect(r1.hourly[23]).toBe(r1.total);
  });
});
