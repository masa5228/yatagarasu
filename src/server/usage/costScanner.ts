import { readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { CostSummary, DailyTokens, ModelCost, TokenBreakdown } from './types';
import {
  type AggRow,
  type CostCacheData,
  defaultCachePath,
  loadCache,
  saveCache,
} from './costCache';

const MAX_WALK_DEPTH = 8;

export interface ScanOptions {
  claudeRoot?: string;
  codexRoot?: string;
  cachePath?: string;
  windowDays?: number;
  now?: number;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalDate(iso: unknown): string | null {
  if (typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : dateStr(new Date(ms));
}

function clampDays(days: number): number {
  if (!Number.isFinite(days) || days < 1) return 30;
  return Math.min(365, Math.floor(days));
}

function walkJsonl(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_WALK_DEPTH) return;
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full);
    }
  };
  walk(root, 0);
  return out;
}

function addRow(
  rows: Map<string, AggRow>,
  provider: 'claude' | 'codex',
  model: string,
  date: string,
  b: TokenBreakdown,
): void {
  const key = `${provider} ${model} ${date}`;
  const existing = rows.get(key);
  if (existing) {
    existing.inputTokens += b.inputTokens;
    existing.cachedInputTokens += b.cachedInputTokens;
    existing.cacheCreationTokens += b.cacheCreationTokens;
    existing.outputTokens += b.outputTokens;
    existing.reasoningTokens += b.reasoningTokens;
    existing.totalTokens += b.totalTokens;
  } else {
    rows.set(key, { provider, model, date, ...b });
  }
}

function parseClaudeFile(content: string): AggRow[] {
  const byKey = new Map<string, { model: string; date: string; b: TokenBreakdown }>();
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.indexOf('"usage"') === -1) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    if (o?.type !== 'assistant' || !o?.message?.usage) continue;
    const date = toLocalDate(o.timestamp);
    if (!date) continue;
    const u = o.message.usage;
    const model = typeof o.message.model === 'string' ? o.message.model : 'unknown';
    const input = num(u.input_tokens);
    const cacheRead = num(u.cache_read_input_tokens);
    const cacheCreate = num(u.cache_creation_input_tokens);
    const output = num(u.output_tokens);
    const b: TokenBreakdown = {
      inputTokens: input,
      cachedInputTokens: cacheRead,
      cacheCreationTokens: cacheCreate,
      outputTokens: output,
      reasoningTokens: 0,
      totalTokens: input + cacheRead + cacheCreate + output,
    };
    byKey.set(`${o.message.id ?? ''} ${o.requestId ?? ''}`, { model, date, b });
  }
  const rows = new Map<string, AggRow>();
  for (const { model, date, b } of byKey.values()) addRow(rows, 'claude', model, date, b);
  return [...rows.values()];
}

function parseCodexFile(content: string): AggRow[] {
  const rows = new Map<string, AggRow>();
  let currentModel = 'unknown';
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    if (o?.type === 'turn_context' && typeof o?.payload?.model === 'string') {
      currentModel = o.payload.model;
      continue;
    }
    if (o?.payload?.type === 'token_count') {
      const last = o.payload.info?.last_token_usage;
      if (!last) continue;
      const date = toLocalDate(o.timestamp);
      if (!date) continue;
      const cached = num(last.cached_input_tokens);
      const inputTotal = num(last.input_tokens);
      const output = num(last.output_tokens);
      const reasoning = num(last.reasoning_output_tokens);
      const b: TokenBreakdown = {
        inputTokens: Math.max(0, inputTotal - cached),
        cachedInputTokens: cached,
        cacheCreationTokens: 0,
        outputTokens: output,
        reasoningTokens: reasoning,
        totalTokens: inputTotal + output + reasoning,
      };
      addRow(rows, 'codex', currentModel, date, b);
    }
  }
  return [...rows.values()];
}

function updateContributions(
  files: string[],
  parse: (content: string) => AggRow[],
  cache: CostCacheData,
): void {
  for (const file of files) {
    let st: import('fs').Stats;
    try {
      st = statSync(file);
    } catch {
      continue;
    }
    const prev = cache.files[file];
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) continue;
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    cache.files[file] = { size: st.size, mtimeMs: st.mtimeMs, rows: parse(content) };
  }
}

function buildSummary(cache: CostCacheData, windowDays: number, now: number): CostSummary {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (windowDays - 1));
  const cutoff = dateStr(start);

  const modelMap = new Map<string, ModelCost>();
  const dailyMap = new Map<string, number>();
  for (const contribution of Object.values(cache.files)) {
    for (const r of contribution.rows) {
      if (r.date < cutoff) continue;
      const mk = `${r.provider} ${r.model}`;
      const m = modelMap.get(mk);
      if (m) {
        m.inputTokens += r.inputTokens;
        m.cachedInputTokens += r.cachedInputTokens;
        m.cacheCreationTokens += r.cacheCreationTokens;
        m.outputTokens += r.outputTokens;
        m.reasoningTokens += r.reasoningTokens;
        m.totalTokens += r.totalTokens;
      } else {
        modelMap.set(mk, {
          provider: r.provider,
          model: r.model,
          inputTokens: r.inputTokens,
          cachedInputTokens: r.cachedInputTokens,
          cacheCreationTokens: r.cacheCreationTokens,
          outputTokens: r.outputTokens,
          reasoningTokens: r.reasoningTokens,
          totalTokens: r.totalTokens,
        });
      }
      dailyMap.set(r.date, (dailyMap.get(r.date) ?? 0) + r.totalTokens);
    }
  }

  const byModel = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  const daily: DailyTokens[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < windowDays; i += 1) {
    const date = dateStr(cursor);
    daily.push({ date, totalTokens: dailyMap.get(date) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return { updatedAt: Math.floor(now / 1000), windowDays, byModel, daily };
}

export function scanCost(opts: ScanOptions = {}): CostSummary {
  const claudeRoot =
    opts.claudeRoot ?? process.env.YATA_CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects');
  const codexRoot =
    opts.codexRoot ??
    process.env.YATA_CODEX_SESSIONS_DIR ??
    join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions');
  const cachePath = opts.cachePath ?? defaultCachePath();
  const windowDays = clampDays(opts.windowDays ?? 30);
  const now = opts.now ?? Date.now();

  const cache = loadCache(cachePath);
  const claudeFiles = walkJsonl(claudeRoot);
  const codexFiles = walkJsonl(codexRoot);
  const union = new Set<string>([...claudeFiles, ...codexFiles]);

  updateContributions(claudeFiles, parseClaudeFile, cache);
  updateContributions(codexFiles, parseCodexFile, cache);
  for (const key of Object.keys(cache.files)) {
    if (!union.has(key)) delete cache.files[key];
  }
  saveCache(cache, cachePath);

  return buildSummary(cache, windowDays, now);
}
