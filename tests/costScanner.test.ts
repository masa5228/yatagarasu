import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanCost } from '../src/server/usage/costScanner';

const NOW = Date.parse('2026-07-06T12:00:00Z');
const dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'yata-cost-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function claudeLine(id: string, requestId: string, model: string, ts: string, usage: Record<string, number>): string {
  return JSON.stringify({ type: 'assistant', requestId, timestamp: ts, message: { id, model, usage } });
}

function codexTurn(model: string): string {
  return JSON.stringify({ type: 'turn_context', payload: { model } });
}

function codexTokenCount(ts: string, last: Record<string, number>): string {
  return JSON.stringify({ type: 'event_msg', timestamp: ts, payload: { type: 'token_count', info: { last_token_usage: last } } });
}

function setup(): { claudeRoot: string; codexRoot: string; cachePath: string } {
  const base = tmp();
  const claudeRoot = join(base, 'claude');
  const codexRoot = join(base, 'codex');
  mkdirSync(join(claudeRoot, 'proj'), { recursive: true });
  mkdirSync(join(codexRoot, '2026', '07', '06'), { recursive: true });
  return { claudeRoot, codexRoot, cachePath: join(base, 'cost-cache.json') };
}

describe('scanCost — Claude', () => {
  it('counts only assistant+usage lines and normalizes token fields', () => {
    const s = setup();
    const file = join(s.claudeRoot, 'proj', 'a.jsonl');
    writeFileSync(
      file,
      [
        JSON.stringify({ type: 'user', text: 'hi' }),
        claudeLine('m1', 'r1', 'claude-sonnet-4-6', '2026-07-06T10:00:00Z', {
          input_tokens: 2,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 8,
          output_tokens: 40,
        }),
      ].join('\n'),
    );
    const out = scanCost({ ...s, now: NOW });
    expect(out.byModel).toHaveLength(1);
    expect(out.byModel[0]).toMatchObject({
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      inputTokens: 2,
      cachedInputTokens: 100,
      cacheCreationTokens: 8,
      outputTokens: 40,
      totalTokens: 150,
    });
  });

  it('dedupes on message.id + requestId keeping the last value', () => {
    const s = setup();
    writeFileSync(
      join(s.claudeRoot, 'proj', 'a.jsonl'),
      [
        claudeLine('m1', 'r1', 'claude-opus', '2026-07-06T10:00:00Z', { input_tokens: 5, output_tokens: 5 }),
        claudeLine('m1', 'r1', 'claude-opus', '2026-07-06T10:00:00Z', { input_tokens: 500, output_tokens: 500 }),
      ].join('\n'),
    );
    const out = scanCost({ ...s, now: NOW });
    expect(out.byModel[0].totalTokens).toBe(1000);
  });
});

describe('scanCost — Codex', () => {
  it('sums last_token_usage, ignores total, buckets by turn_context model', () => {
    const s = setup();
    writeFileSync(
      join(s.codexRoot, '2026', '07', '06', 'r.jsonl'),
      [
        codexTurn('gpt-5.5'),
        codexTokenCount('2026-07-06T10:00:00Z', { input_tokens: 100, cached_input_tokens: 90, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 999 }),
        codexTokenCount('2026-07-06T10:05:00Z', { input_tokens: 20, cached_input_tokens: 0, output_tokens: 4, reasoning_output_tokens: 1, total_tokens: 999 }),
      ].join('\n'),
    );
    const out = scanCost({ ...s, now: NOW });
    const codex = out.byModel.find((m) => m.provider === 'codex');
    expect(codex?.model).toBe('gpt-5.5');
    expect(codex?.cachedInputTokens).toBe(90);
    expect(codex?.inputTokens).toBe(10 + 20);
    expect(codex?.outputTokens).toBe(14);
    expect(codex?.reasoningTokens).toBe(6);
    expect(codex?.totalTokens).toBe(100 + 10 + 5 + (20 + 4 + 1));
  });

  it('attributes tokens to the model active at the time of each event', () => {
    const s = setup();
    writeFileSync(
      join(s.codexRoot, '2026', '07', '06', 'r.jsonl'),
      [
        codexTurn('gpt-5.5'),
        codexTokenCount('2026-07-06T10:00:00Z', { input_tokens: 10, output_tokens: 0 }),
        codexTurn('gpt-5.4'),
        codexTokenCount('2026-07-06T10:05:00Z', { input_tokens: 30, output_tokens: 0 }),
      ].join('\n'),
    );
    const out = scanCost({ ...s, now: NOW });
    expect(out.byModel.find((m) => m.model === 'gpt-5.5')?.totalTokens).toBe(10);
    expect(out.byModel.find((m) => m.model === 'gpt-5.4')?.totalTokens).toBe(30);
  });
});

describe('scanCost — robustness, window, incremental, sidecar', () => {
  it('skips broken JSON lines without failing', () => {
    const s = setup();
    writeFileSync(
      join(s.claudeRoot, 'proj', 'a.jsonl'),
      ['{ broken usage', claudeLine('m1', 'r1', 'claude-opus', '2026-07-06T10:00:00Z', { input_tokens: 7, output_tokens: 3 })].join('\n'),
    );
    const out = scanCost({ ...s, now: NOW });
    expect(out.byModel[0].totalTokens).toBe(10);
  });

  it('filters by day window and returns windowDays daily buckets', () => {
    const s = setup();
    writeFileSync(
      join(s.claudeRoot, 'proj', 'a.jsonl'),
      [
        claudeLine('recent', 'r1', 'claude-opus', '2026-07-06T10:00:00Z', { input_tokens: 100, output_tokens: 0 }),
        claudeLine('old', 'r2', 'claude-opus', '2026-05-01T10:00:00Z', { input_tokens: 999, output_tokens: 0 }),
      ].join('\n'),
    );
    const out = scanCost({ ...s, windowDays: 30, now: NOW });
    expect(out.daily).toHaveLength(30);
    expect(out.byModel[0].totalTokens).toBe(100);
    const totalDaily = out.daily.reduce((sum, d) => sum + d.totalTokens, 0);
    expect(totalDaily).toBe(100);

    const wide = scanCost({ ...s, windowDays: 120, now: NOW });
    expect(wide.byModel[0].totalTokens).toBe(1099);
  });

  it('reflects appended lines on rescan (incremental) and persists a sidecar', () => {
    const s = setup();
    const file = join(s.claudeRoot, 'proj', 'a.jsonl');
    writeFileSync(file, claudeLine('m1', 'r1', 'claude-opus', '2026-07-06T10:00:00Z', { input_tokens: 100, output_tokens: 0 }));
    const first = scanCost({ ...s, now: NOW });
    expect(first.byModel[0].totalTokens).toBe(100);

    appendFileSync(file, '\n' + claudeLine('m2', 'r2', 'claude-opus', '2026-07-06T11:00:00Z', { input_tokens: 50, output_tokens: 0 }));
    const second = scanCost({ ...s, now: NOW });
    expect(second.byModel[0].totalTokens).toBe(150);

    const cache = JSON.parse(readFileSync(s.cachePath, 'utf8'));
    expect(cache.version).toBe(1);
    expect(Object.keys(cache.files).length).toBeGreaterThan(0);

    const reloaded = scanCost({ ...s, now: NOW });
    expect(reloaded.byModel[0].totalTokens).toBe(150);
  });
});
