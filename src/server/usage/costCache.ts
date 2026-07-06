import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

export const CACHE_VERSION = 1;

export interface AggRow {
  provider: 'claude' | 'codex';
  model: string;
  date: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface FileContribution {
  size: number;
  mtimeMs: number;
  rows: AggRow[];
}

export interface CostCacheData {
  version: number;
  files: Record<string, FileContribution>;
}

export function emptyCache(): CostCacheData {
  return { version: CACHE_VERSION, files: {} };
}

export function defaultCachePath(): string {
  return process.env.YATA_COST_CACHE_PATH ?? join(homedir(), '.yatagarasu', 'cost-cache.json');
}

export function loadCache(path = defaultCachePath()): CostCacheData {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as CostCacheData;
    if (!data || data.version !== CACHE_VERSION || typeof data.files !== 'object' || data.files === null) {
      return emptyCache();
    }
    return data;
  } catch {
    return emptyCache();
  }
}

export function saveCache(data: CostCacheData, path = defaultCachePath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data));
  } catch {
    /* best-effort persistence */
  }
}
