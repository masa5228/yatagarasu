import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/index';
import { _resetForTests } from '../src/server/db';

const app = createApp();

beforeEach(() => _resetForTests());

describe('agents API', () => {
  it('creates (201) and lists, preserving UTF-8 role', async () => {
    const res = await request(app)
      .post('/api/agents')
      .send({ name: 'researcher', role: '調査係', color: '#00ff9d' })
      .expect(201);
    expect(res.body.name).toBe('researcher');
    expect(res.body.role).toBe('調査係');

    const list = (await request(app).get('/api/agents')).body;
    expect(list).toHaveLength(1);
  });

  it('rejects a missing name with 400', async () => {
    await request(app).post('/api/agents').send({ role: 'x' }).expect(400);
  });

  it('rejects a duplicate name with 400', async () => {
    await request(app).post('/api/agents').send({ name: 'dup' }).expect(201);
    const res = await request(app).post('/api/agents').send({ name: 'dup' }).expect(400);
    expect(res.body.error).toMatch(/exists/);
  });

  it('updates an existing agent', async () => {
    const created = (await request(app).post('/api/agents').send({ name: 'a', role: 'r' })).body;
    const res = await request(app).put(`/api/agents/${created.id}`).send({ name: 'a', role: 'r2' }).expect(200);
    expect(res.body.role).toBe('r2');
  });

  it('rejects renaming onto a name used by another agent', async () => {
    const a = (await request(app).post('/api/agents').send({ name: 'a' })).body;
    await request(app).post('/api/agents').send({ name: 'b' });
    await request(app).put(`/api/agents/${a.id}`).send({ name: 'b' }).expect(400);
  });

  it('returns 404 for update/delete on a missing id', async () => {
    await request(app).put('/api/agents/nope').send({ name: 'x' }).expect(404);
    await request(app).delete('/api/agents/nope').expect(404);
  });

  it('deletes (204)', async () => {
    const a = (await request(app).post('/api/agents').send({ name: 'gone' })).body;
    await request(app).delete(`/api/agents/${a.id}`).expect(204);
    expect((await request(app).get('/api/agents')).body).toHaveLength(0);
  });
});
