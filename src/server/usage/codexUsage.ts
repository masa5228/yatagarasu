import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ProviderUsage, RateWindow } from './types';

const WHAM_URL = 'https://chatgpt.com/backend-api/wham/usage';
const INIT_TIMEOUT_MS = 15_000;
const METHOD_TIMEOUT_MS = 8_000;
const HTTP_TIMEOUT_MS = 10_000;

export interface CodexUsageDeps {
  authAvailable?: () => boolean;
  rpcRead?: () => Promise<unknown>;
  readAuthToken?: () => string | null;
  whamFetch?: (token: string) => Promise<{ httpStatus: number; json: unknown }>;
  now?: () => number;
}

export interface CodexWindows {
  plan?: string;
  session?: RateWindow;
  weekly?: RateWindow;
  models?: RateWindow[];
}

function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), '.codex');
}

function authPath(): string {
  return join(codexHome(), 'auth.json');
}

export function codexAuthAvailable(): boolean {
  return existsSync(authPath());
}

export function readCodexAuthToken(): string | null {
  try {
    const raw = JSON.parse(readFileSync(authPath(), 'utf8')) as { tokens?: { access_token?: unknown } };
    const token = raw?.tokens?.access_token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function labelForMinutes(minutes: unknown): string {
  const m = typeof minutes === 'number' ? minutes : 0;
  if (m <= 0) return 'window';
  if (m % 10080 === 0) return m === 10080 ? 'week' : `${m / 10080}w`;
  if (m % 1440 === 0) return `${m / 1440}d`;
  if (m % 60 === 0) return `${m / 60}h`;
  return `${m}m`;
}

function rpcWindow(raw: unknown): RateWindow | undefined {
  const w = raw as { usedPercent?: unknown; resetsAt?: unknown; windowDurationMins?: unknown } | null;
  if (!w || typeof w.usedPercent !== 'number') return undefined;
  return {
    label: labelForMinutes(w.windowDurationMins),
    usedPercent: w.usedPercent,
    resetsAt: typeof w.resetsAt === 'number' ? w.resetsAt : null,
  };
}

export function mapCodexRateLimits(result: unknown): CodexWindows {
  const rl = (result as { rateLimits?: Record<string, any> })?.rateLimits;
  if (!rl) return {};
  const out: CodexWindows = {};
  out.session = rpcWindow(rl.primary);
  out.weekly = rpcWindow(rl.secondary);
  if (typeof rl.planType === 'string') out.plan = rl.planType;
  return out;
}

function whamWindow(raw: unknown): RateWindow | undefined {
  const w = raw as { used_percent?: unknown; reset_at?: unknown; limit_window_seconds?: unknown } | null;
  if (!w || typeof w.used_percent !== 'number') return undefined;
  const minutes = typeof w.limit_window_seconds === 'number' ? w.limit_window_seconds / 60 : 0;
  return {
    label: labelForMinutes(minutes),
    usedPercent: w.used_percent,
    resetsAt: typeof w.reset_at === 'number' ? w.reset_at : null,
  };
}

export function mapCodexWhamUsage(json: unknown): CodexWindows {
  const body = (json ?? {}) as Record<string, any>;
  const rl = body.rate_limit ?? {};
  const out: CodexWindows = {};
  out.session = whamWindow(rl.primary_window);
  out.weekly = whamWindow(rl.secondary_window);
  if (typeof body.plan_type === 'string') out.plan = body.plan_type;
  return out;
}

export function fetchCodexRpc(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;

    const child = spawn('codex app-server', { env, stdio: ['pipe', 'pipe', 'ignore'], shell: true });
    let settled = false;
    let buffer = '';

    const initTimer = setTimeout(() => fail(new Error('initialize timeout')), INIT_TIMEOUT_MS);
    let methodTimer: NodeJS.Timeout | null = null;

    function cleanup(): void {
      clearTimeout(initTimer);
      if (methodTimer) clearTimeout(methodTimer);
      try {
        child.stdin.end();
      } catch {
        /* noop */
      }
      try {
        child.kill();
      } catch {
        /* noop */
      }
    }

    function fail(err: Error): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function done(value: unknown): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function send(obj: unknown): void {
      child.stdin.write(`${JSON.stringify(obj)}\n`);
    }

    child.on('error', (err) => fail(err));
    child.on('exit', () => {
      if (!settled) fail(new Error('app-server exited'));
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (!line) continue;
        let msg: { id?: unknown; result?: unknown; error?: unknown };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1) {
          clearTimeout(initTimer);
          send({ jsonrpc: '2.0', method: 'initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'account/rateLimits/read', params: null });
          methodTimer = setTimeout(() => fail(new Error('rateLimits timeout')), METHOD_TIMEOUT_MS);
        } else if (msg.id === 2) {
          if (msg.error) fail(new Error('rateLimits error'));
          else done(msg.result);
        }
      }
    });

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'yatagarasu', title: null, version: '0.1.0' }, capabilities: null },
    });
  });
}

export async function fetchCodexWham(
  token: string,
): Promise<{ httpStatus: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(WHAM_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { httpStatus: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export async function getCodexUsage(deps: CodexUsageDeps = {}): Promise<ProviderUsage> {
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const base: ProviderUsage = { provider: 'codex', status: 'disabled', updatedAt: now };

  if (!(deps.authAvailable ?? codexAuthAvailable)()) return base;

  try {
    const result = await (deps.rpcRead ?? fetchCodexRpc)();
    const windows = mapCodexRateLimits(result);
    return { provider: 'codex', status: 'ok', updatedAt: now, source: 'rpc', ...windows };
  } catch {
    /* fall through to HTTP fallback */
  }

  const token = (deps.readAuthToken ?? readCodexAuthToken)();
  if (token) {
    try {
      const { httpStatus, json } = await (deps.whamFetch ?? fetchCodexWham)(token);
      if (httpStatus === 401 || httpStatus === 403) {
        return { ...base, status: 'expired', error: 're-auth required', source: 'http' };
      }
      if (httpStatus >= 200 && httpStatus < 300) {
        const windows = mapCodexWhamUsage(json);
        return { provider: 'codex', status: 'ok', updatedAt: now, source: 'http', ...windows };
      }
    } catch {
      /* fall through to error */
    }
  }

  return { ...base, status: 'error', error: 'rpc and http failed' };
}
