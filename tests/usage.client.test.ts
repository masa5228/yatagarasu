import { describe, expect, it } from 'vitest';
import { usageSeverity, countdown } from '../src/client/lib/usage';

describe('usageSeverity', () => {
  it('maps percent to ok/warn/err at the boundaries', () => {
    expect(usageSeverity(0)).toBe('ok');
    expect(usageSeverity(69)).toBe('ok');
    expect(usageSeverity(70)).toBe('warn');
    expect(usageSeverity(90)).toBe('warn');
    expect(usageSeverity(91)).toBe('err');
    expect(usageSeverity(100)).toBe('err');
  });
});

describe('countdown', () => {
  const now = 1_000_000;

  it('handles null and already-reset windows', () => {
    expect(countdown(null, now)).toBe('');
    expect(countdown(now, now)).toBe('↺ now');
    expect(countdown(now - 10, now)).toBe('↺ now');
  });

  it('formats minutes, hours, and days', () => {
    expect(countdown(now + 5 * 60, now)).toBe('↺ 5m');
    expect(countdown(now + (2 * 3600 + 13 * 60), now)).toBe('↺ 2h13m');
    expect(countdown(now + (86400 + 5 * 3600), now)).toBe('↺ 1d5h');
  });
});
