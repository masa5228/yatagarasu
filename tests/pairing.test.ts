import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/index';
import { detectToolError } from '../src/server/routes/hooks';
import { _resetForTests } from '../src/server/db';

const app = createApp();

beforeEach(() => _resetForTests());

async function activities() {
  return (await request(app).get('/api/activities')).body;
}

function pre(tool = 'Bash', extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/hook?agent=r')
    .send({ session_id: 's1', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command: 'ls' }, ...extra });
}

function post(tool = 'Bash', extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/hook?agent=r')
    .send({ session_id: 's1', hook_event_name: 'PostToolUse', tool_name: tool, tool_response: { stdout: 'ok' }, ...extra });
}

describe('Pre/Post pairing', () => {
  it('marks a PreToolUse activity as running', async () => {
    await pre();
    const acts = await activities();
    expect(acts).toHaveLength(1);
    expect(acts[0].status).toBe('running');
    expect(acts[0].tool_result).toBeNull();
  });

  it('merges PostToolUse into the running Pre row', async () => {
    await pre();
    await post();
    const acts = await activities();
    expect(acts).toHaveLength(1);
    expect(acts[0].status).toBe('completed');
    expect(acts[0].tool_result).toBe(JSON.stringify({ stdout: 'ok' }));
    expect(acts[0].hook_event).toBe('PostToolUse');
    expect(typeof acts[0].duration_ms).toBe('number');
    expect(acts[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('pairs by tool_use_id when provided', async () => {
    await pre('Bash', { tool_use_id: 'call-1' });
    await pre('Bash', { tool_use_id: 'call-2' });
    await post('Bash', { tool_use_id: 'call-1', tool_response: { stdout: 'first' } });

    const acts = await activities();
    expect(acts).toHaveLength(2);
    const first = acts.find((a: { tool_use_id: string }) => a.tool_use_id === 'call-1');
    const second = acts.find((a: { tool_use_id: string }) => a.tool_use_id === 'call-2');
    expect(first.status).toBe('completed');
    expect(first.tool_result).toBe(JSON.stringify({ stdout: 'first' }));
    expect(second.status).toBe('running');
  });

  it('pairs the most recent running row for the same agent/session/tool', async () => {
    await pre('WebSearch');
    await pre('Bash');
    await post('Bash');

    const acts = await activities();
    const bash = acts.find((a: { tool_name: string }) => a.tool_name === 'Bash');
    const search = acts.find((a: { tool_name: string }) => a.tool_name === 'WebSearch');
    expect(bash.status).toBe('completed');
    expect(search.status).toBe('running');
  });

  it('does not pair across different sessions', async () => {
    await pre('Bash', { session_id: 'other' });
    await post('Bash');

    const acts = await activities();
    expect(acts).toHaveLength(2);
    const running = acts.filter((a: { status: string }) => a.status === 'running');
    expect(running).toHaveLength(1);
    expect(running[0].session_id).toBe('other');
  });

  it('inserts a standalone completed row when Post has no matching Pre', async () => {
    await post();
    const acts = await activities();
    expect(acts).toHaveLength(1);
    expect(acts[0].status).toBe('completed');
    expect(acts[0].duration_ms).toBeNull();
  });

  it('marks a paired activity as error when the response contains an error', async () => {
    await pre();
    await post('Bash', { tool_response: { error: 'command not found' } });
    const acts = await activities();
    expect(acts).toHaveLength(1);
    expect(acts[0].status).toBe('error');
  });

  it('marks a standalone Post as error when the response contains an error', async () => {
    await post('Bash', { tool_response: { is_error: true } });
    const acts = await activities();
    expect(acts[0].status).toBe('error');
  });
});

describe('detectToolError', () => {
  it('detects explicit error flags', () => {
    expect(detectToolError({ is_error: true })).toBe(true);
    expect(detectToolError({ isError: true })).toBe(true);
    expect(detectToolError({ success: false })).toBe(true);
  });

  it('detects error message fields', () => {
    expect(detectToolError({ error: 'boom' })).toBe(true);
    expect(detectToolError({ error: { code: 1 } })).toBe(true);
  });

  it('treats normal responses as success', () => {
    expect(detectToolError({ stdout: 'ok', stderr: '' })).toBe(false);
    expect(detectToolError({ success: true })).toBe(false);
    expect(detectToolError({ error: '' })).toBe(false);
    expect(detectToolError({ error: '   ' })).toBe(false);
    expect(detectToolError(null)).toBe(false);
    expect(detectToolError(undefined)).toBe(false);
    expect(detectToolError('plain text result')).toBe(false);
    expect(detectToolError({ results: 8 })).toBe(false);
  });
});
