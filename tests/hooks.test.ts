import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/index';
import { _resetForTests, getAgents } from '../src/server/db';

const app = createApp();

beforeEach(() => _resetForTests());

async function activities() {
  return (await request(app).get('/api/activities')).body;
}

describe('POST /api/hook', () => {
  it('uses ?agent= query as the highest-priority agent name', async () => {
    await request(app)
      .post('/api/hook?agent=researcher')
      .send({ session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'WebSearch', tool_input: { query: 'x' } })
      .expect(200);

    const acts = await activities();
    expect(acts).toHaveLength(1);
    expect(acts[0].agent_name).toBe('researcher');
    expect(acts[0].hook_event).toBe('PreToolUse');
    expect(acts[0].session_id).toBe('s1');
    expect(acts[0].tool_input).toBe(JSON.stringify({ query: 'x' }));
  });

  it('auto-registers an unknown agent', async () => {
    await request(app).post('/api/hook?agent=newbie').send({ session_id: 's', tool_name: 'Bash' }).expect(200);
    expect(getAgents().map((a) => a.name)).toContain('newbie');
  });

  it('falls back query -> agent_type -> agent_name -> default', async () => {
    await request(app).post('/api/hook').send({ agent_type: 'fromType', tool_name: 'X', session_id: 's' });
    await request(app).post('/api/hook').send({ agent_name: 'fromName', tool_name: 'X', session_id: 's' });
    await request(app).post('/api/hook').send({ tool_name: 'X', session_id: 's' });

    const names = getAgents().map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(['fromType', 'fromName', 'default']));
  });

  it('maps tool_response onto tool_result', async () => {
    await request(app)
      .post('/api/hook?agent=r')
      .send({ session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'WebSearch', tool_response: { results: 8 } });

    const acts = await activities();
    expect(acts[0].tool_result).toBe(JSON.stringify({ results: 8 }));
  });

  it('defaults missing fields and always returns 200', async () => {
    await request(app).post('/api/hook').send({}).expect(200);

    const acts = await activities();
    expect(acts[0].agent_name).toBe('default');
    expect(acts[0].session_id).toBe('unknown');
    expect(acts[0].tool_name).toBe('unknown');
    expect(acts[0].hook_event).toBe('unknown');
    expect(acts[0].tool_input).toBeNull();
    expect(acts[0].tool_result).toBeNull();
  });
});
