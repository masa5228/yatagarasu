import type { ProviderUsage, UsageSnapshot } from './types';
import { getClaudeUsage } from './claudeUsage';
import { getCodexUsage } from './codexUsage';

const DEFAULT_POLL_MS = 60_000;
const MIN_POLL_MS = 30_000;

function initialProvider(provider: 'claude' | 'codex'): ProviderUsage {
  return { provider, status: 'disabled', updatedAt: 0 };
}

let snapshot: UsageSnapshot = {
  claude: initialProvider('claude'),
  codex: initialProvider('codex'),
};

export function getUsageSnapshot(): UsageSnapshot {
  return snapshot;
}

export interface RefreshDeps {
  claude?: () => Promise<ProviderUsage>;
  codex?: () => Promise<ProviderUsage>;
}

function mergeStale(prev: ProviderUsage, next: ProviderUsage): ProviderUsage {
  if (next.status === 'ok' || next.status === 'disabled' || prev.status !== 'ok') return next;
  return {
    ...next,
    plan: next.plan ?? prev.plan,
    session: prev.session,
    weekly: prev.weekly,
    models: prev.models,
  };
}

export function resetUsageForTests(): void {
  snapshot = { claude: initialProvider('claude'), codex: initialProvider('codex') };
}

export async function refreshUsage(deps: RefreshDeps = {}): Promise<UsageSnapshot> {
  const [claude, codex] = await Promise.all([
    (deps.claude ?? getClaudeUsage)().catch(() => snapshot.claude),
    (deps.codex ?? getCodexUsage)().catch(() => snapshot.codex),
  ]);
  snapshot = {
    claude: mergeStale(snapshot.claude, claude),
    codex: mergeStale(snapshot.codex, codex),
  };
  return snapshot;
}

export function startUsagePolling(opts: { intervalMs?: number } = {}): () => void {
  const envMs = Number(process.env.YATA_USAGE_POLL_MS);
  const requested = opts.intervalMs ?? (Number.isFinite(envMs) && envMs > 0 ? envMs : DEFAULT_POLL_MS);
  const intervalMs = Math.max(MIN_POLL_MS, requested);
  void refreshUsage();
  const timer = setInterval(() => void refreshUsage(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
