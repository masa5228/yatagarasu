export type Severity = 'ok' | 'warn' | 'err';

export function usageSeverity(percent: number): Severity {
  if (percent > 90) return 'err';
  if (percent >= 70) return 'warn';
  return 'ok';
}

export function countdown(resetsAt: number | null, nowSec: number): string {
  if (!resetsAt) return '';
  const remaining = resetsAt - nowSec;
  if (remaining <= 0) return '↺ now';
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  if (d > 0) return `↺ ${d}d${h}h`;
  if (h > 0) return `↺ ${h}h${m}m`;
  return `↺ ${m}m`;
}
