export type ProviderStatus = 'ok' | 'disabled' | 'expired' | 'error';

export interface RateWindow {
  label: string;
  usedPercent: number;
  resetsAt: number | null;
}

export interface ProviderUsage {
  provider: 'claude' | 'codex';
  status: ProviderStatus;
  plan?: string;
  session?: RateWindow;
  weekly?: RateWindow;
  models?: RateWindow[];
  updatedAt: number;
  error?: string;
  source?: string;
}

export interface UsageSnapshot {
  claude: ProviderUsage;
  codex: ProviderUsage;
}

export interface TokenBreakdown {
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface ModelCost extends TokenBreakdown {
  provider: 'claude' | 'codex';
  model: string;
}

export interface DailyTokens {
  date: string;
  totalTokens: number;
}

export interface CostSummary {
  updatedAt: number;
  windowDays: number;
  byModel: ModelCost[];
  daily: DailyTokens[];
}
