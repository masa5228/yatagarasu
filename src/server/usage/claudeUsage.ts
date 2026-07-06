import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ProviderUsage, RateWindow } from './types';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const REQUIRED_SCOPE = 'user:profile';
const TIMEOUT_MS = 10_000;

export interface ClaudeCredentials {
  accessToken: string;
  scopes: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
  expiresAt?: number;
}

export interface ClaudeWindows {
  session?: RateWindow;
  weekly?: RateWindow;
  models?: RateWindow[];
}

export interface ClaudeUsageDeps {
  readCredentials?: () => ClaudeCredentials | null;
  fetchUsage?: (token: string) => Promise<{ httpStatus: number; json: unknown }>;
  now?: () => number;
}

function credentialsPath(): string {
  return join(homedir(), '.claude', '.credentials.json');
}

export function readClaudeCredentials(path = credentialsPath()): ClaudeCredentials | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  const oauth = (raw as { claudeAiOauth?: Record<string, unknown> })?.claudeAiOauth;
  if (!oauth || typeof oauth.accessToken !== 'string' || oauth.accessToken.length === 0) {
    return null;
  }
  return {
    accessToken: oauth.accessToken,
    scopes: Array.isArray(oauth.scopes) ? (oauth.scopes as string[]) : [],
    subscriptionType: typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : undefined,
    rateLimitTier: typeof oauth.rateLimitTier === 'string' ? oauth.rateLimitTier : undefined,
    expiresAt: typeof oauth.expiresAt === 'number' ? oauth.expiresAt : undefined,
  };
}

function isoToUnix(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function windowFrom(label: string, percent: unknown, resetsAt: unknown): RateWindow | undefined {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return undefined;
  return { label, usedPercent: percent, resetsAt: isoToUnix(resetsAt) };
}

export function mapClaudeUsage(json: unknown): ClaudeWindows {
  const body = (json ?? {}) as Record<string, any>;
  const result: ClaudeWindows = {};

  if (Array.isArray(body.limits)) {
    const models: RateWindow[] = [];
    for (const entry of body.limits) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.kind === 'session' || entry.group === 'session') {
        result.session = windowFrom('5h', entry.percent, entry.resets_at) ?? result.session;
      } else if (entry.kind === 'weekly_all') {
        result.weekly = windowFrom('week', entry.percent, entry.resets_at) ?? result.weekly;
      } else if (entry.kind === 'weekly_scoped') {
        const label = entry.scope?.model?.display_name ?? 'model';
        const w = windowFrom(label, entry.percent, entry.resets_at);
        if (w) models.push(w);
      }
    }
    if (models.length > 0) result.models = models;
    if (result.session || result.weekly || result.models) return result;
  }

  result.session = windowFrom('5h', body.five_hour?.utilization, body.five_hour?.resets_at);
  result.weekly = windowFrom('week', body.seven_day?.utilization, body.seven_day?.resets_at);
  const models: RateWindow[] = [];
  const opus = windowFrom('opus', body.seven_day_opus?.utilization, body.seven_day_opus?.resets_at);
  const sonnet = windowFrom('sonnet', body.seven_day_sonnet?.utilization, body.seven_day_sonnet?.resets_at);
  if (opus) models.push(opus);
  if (sonnet) models.push(sonnet);
  if (models.length > 0) result.models = models;
  return result;
}

export async function fetchClaudeUsage(
  token: string,
): Promise<{ httpStatus: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { httpStatus: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export async function getClaudeUsage(deps: ClaudeUsageDeps = {}): Promise<ProviderUsage> {
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const base: ProviderUsage = { provider: 'claude', status: 'disabled', updatedAt: now };

  const creds = (deps.readCredentials ?? readClaudeCredentials)();
  if (!creds) return base;

  if (!creds.scopes.includes(REQUIRED_SCOPE)) {
    return { ...base, status: 'expired', error: 'requires user:profile scope' };
  }
  if (typeof creds.expiresAt === 'number' && creds.expiresAt < Date.now()) {
    return { ...base, status: 'expired', error: 'token expired' };
  }

  const plan = creds.subscriptionType ?? creds.rateLimitTier;
  try {
    const { httpStatus, json } = await (deps.fetchUsage ?? fetchClaudeUsage)(creds.accessToken);
    if (httpStatus === 401 || httpStatus === 403) {
      return { ...base, status: 'expired', plan, error: 're-auth required' };
    }
    if (httpStatus < 200 || httpStatus >= 300) {
      return { ...base, status: 'error', plan, error: `http ${httpStatus}` };
    }
    const windows = mapClaudeUsage(json);
    return { provider: 'claude', status: 'ok', plan, updatedAt: now, ...windows };
  } catch {
    return { ...base, status: 'error', plan, error: 'fetch failed' };
  }
}
