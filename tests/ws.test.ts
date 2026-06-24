import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import { startServer } from '../src/server/index';
import { _resetForTests } from '../src/server/db';

let server: Server;
let port: number;

beforeAll(async () => {
  const running = await startServer({ port: 0 });
  server = running.server;
  port = running.port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => _resetForTests());

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error('ws error')), { once: true });
  });
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.addEventListener('message', (ev) => resolve(JSON.parse(ev.data as string)), { once: true });
  });
}

async function postHook() {
  await fetch(`http://127.0.0.1:${port}/api/hook?agent=ws-tester`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: 'ws', tool_name: 'Bash', hook_event_name: 'PreToolUse' }),
  });
}

describe('WebSocket feed', () => {
  it('is reachable over HTTP', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/activities`);
    expect(res.status).toBe(200);
  });

  it('sends an init snapshot on connect', async () => {
    const ws = await connect();
    const msg = await nextMessage(ws);
    expect(msg.type).toBe('init');
    expect(Array.isArray(msg.activities)).toBe(true);
    ws.close();
  });

  it('broadcasts new activity to connected clients', async () => {
    const ws = await connect();
    await nextMessage(ws);
    const incoming = nextMessage(ws);
    await postHook();
    const msg = (await incoming) as { type: string; activity: { agent_name: string; tool_name: string } };
    expect(msg.type).toBe('activity');
    expect(msg.activity.agent_name).toBe('ws-tester');
    expect(msg.activity.tool_name).toBe('Bash');
    ws.close();
  });
});
