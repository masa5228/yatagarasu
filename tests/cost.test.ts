import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApp } from '../src/server/index';

const app = createApp();
let base: string;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'yata-costroute-'));
  const claudeRoot = join(base, 'claude');
  mkdirSync(join(claudeRoot, 'proj'), { recursive: true });
  writeFileSync(
    join(claudeRoot, 'proj', 'a.jsonl'),
    [
      JSON.stringify({ type: 'assistant', requestId: 'r1', timestamp: isoDaysAgo(1), message: { id: 'm1', model: 'claude-opus', usage: { input_tokens: 100, output_tokens: 0 } } }),
      JSON.stringify({ type: 'assistant', requestId: 'r2', timestamp: isoDaysAgo(10), message: { id: 'm2', model: 'claude-opus', usage: { input_tokens: 40, output_tokens: 0 } } }),
    ].join('\n'),
  );
  process.env.YATA_CLAUDE_PROJECTS_DIR = claudeRoot;
  process.env.YATA_CODEX_SESSIONS_DIR = join(base, 'codex-empty');
  process.env.YATA_COST_CACHE_PATH = join(base, 'cache.json');
});

afterEach(() => {
  delete process.env.YATA_CLAUDE_PROJECTS_DIR;
  delete process.env.YATA_CODEX_SESSIONS_DIR;
  delete process.env.YATA_COST_CACHE_PATH;
  rmSync(base, { recursive: true, force: true });
});

describe('GET /api/cost', () => {
  it('returns per-model and daily token aggregation over the default window', async () => {
    const res = await request(app).get('/api/cost').expect(200);
    expect(res.body.windowDays).toBe(30);
    expect(res.body.daily).toHaveLength(30);
    expect(res.body.byModel[0]).toMatchObject({ provider: 'claude', model: 'claude-opus', totalTokens: 140 });
  });

  it('applies the ?days= window filter', async () => {
    const res = await request(app).get('/api/cost?days=7').expect(200);
    expect(res.body.windowDays).toBe(7);
    expect(res.body.daily).toHaveLength(7);
    expect(res.body.byModel[0].totalTokens).toBe(100);
  });
});
