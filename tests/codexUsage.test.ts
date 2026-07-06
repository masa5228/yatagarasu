import { describe, expect, it } from 'vitest';
import {
  mapCodexRateLimits,
  mapCodexWhamUsage,
  getCodexUsage,
} from '../src/server/usage/codexUsage';

const rpcResult = {
  rateLimits: {
    limitId: 'codex',
    primary: { usedPercent: 1, resetsAt: 1_783_363_874, windowDurationMins: 300 },
    secondary: { usedPercent: 11, resetsAt: 1_783_523_662, windowDurationMins: 10080 },
    planType: 'plus',
  },
  rateLimitsByLimitId: { codex: {} },
};

const whamBody = {
  user_id: 'user-secret',
  account_id: 'acct-secret',
  email: 'secret@example.com',
  plan_type: 'plus',
  rate_limit: {
    primary_window: { used_percent: 3, limit_window_seconds: 18000, reset_at: 1_783_365_127 },
    secondary_window: { used_percent: 12, limit_window_seconds: 604800, reset_at: 1_783_523_661 },
  },
};

describe('mapCodexRateLimits', () => {
  it('maps primary/secondary/planType with minute-derived labels', () => {
    const w = mapCodexRateLimits(rpcResult);
    expect(w.plan).toBe('plus');
    expect(w.session).toEqual({ label: '5h', usedPercent: 1, resetsAt: 1_783_363_874 });
    expect(w.weekly).toEqual({ label: 'week', usedPercent: 11, resetsAt: 1_783_523_662 });
  });

  it('returns empty object when rateLimits missing', () => {
    expect(mapCodexRateLimits({})).toEqual({});
    expect(mapCodexRateLimits(null)).toEqual({});
  });
});

describe('mapCodexWhamUsage', () => {
  it('maps rate_limit windows and plan_type, excluding PII', () => {
    const w = mapCodexWhamUsage(whamBody);
    expect(w.plan).toBe('plus');
    expect(w.session).toEqual({ label: '5h', usedPercent: 3, resetsAt: 1_783_365_127 });
    expect(w.weekly).toEqual({ label: 'week', usedPercent: 12, resetsAt: 1_783_523_661 });
    const serialized = JSON.stringify(w);
    expect(serialized).not.toContain('secret@example.com');
    expect(serialized).not.toContain('user-secret');
    expect(serialized).not.toContain('acct-secret');
  });
});

describe('getCodexUsage', () => {
  const now = () => 1_783_345_000_000;

  it('returns disabled when auth.json absent', async () => {
    const u = await getCodexUsage({ authAvailable: () => false, now });
    expect(u).toMatchObject({ provider: 'codex', status: 'disabled' });
  });

  it('returns ok from RPC (source rpc)', async () => {
    const u = await getCodexUsage({
      authAvailable: () => true,
      rpcRead: async () => rpcResult,
      now,
    });
    expect(u.status).toBe('ok');
    expect(u.source).toBe('rpc');
    expect(u.plan).toBe('plus');
    expect(u.session?.usedPercent).toBe(1);
  });

  it('falls back to wham HTTP when RPC fails (source http, no PII)', async () => {
    const u = await getCodexUsage({
      authAvailable: () => true,
      rpcRead: async () => {
        throw new Error('rpc down');
      },
      readAuthToken: () => 'tok',
      whamFetch: async () => ({ httpStatus: 200, json: whamBody }),
      now,
    });
    expect(u.status).toBe('ok');
    expect(u.source).toBe('http');
    expect(u.weekly?.label).toBe('week');
    expect(JSON.stringify(u)).not.toContain('secret@example.com');
  });

  it('returns error when both RPC and HTTP fail', async () => {
    const u = await getCodexUsage({
      authAvailable: () => true,
      rpcRead: async () => {
        throw new Error('rpc down');
      },
      readAuthToken: () => 'tok',
      whamFetch: async () => ({ httpStatus: 500, json: {} }),
      now,
    });
    expect(u.status).toBe('error');
  });
});
