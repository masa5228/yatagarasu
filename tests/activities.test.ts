import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/index';
import { _resetForTests } from '../src/server/db';

const app = createApp();

beforeEach(() => _resetForTests());

async function postHook(tool: string) {
  await request(app)
    .post('/api/hook?agent=a')
    .send({ session_id: 's', tool_name: tool, hook_event_name: 'PreToolUse' });
}

describe('GET /api/activities', () => {
  it('returns newest-first', async () => {
    await postHook('A');
    await postHook('B');
    const body = (await request(app).get('/api/activities')).body;
    expect(body[0].tool_name).toBe('B');
    expect(body[1].tool_name).toBe('A');
  });

  it('honors the limit query', async () => {
    for (let i = 0; i < 4; i++) await postHook('T');
    const body = (await request(app).get('/api/activities?limit=2')).body;
    expect(body).toHaveLength(2);
  });
});
