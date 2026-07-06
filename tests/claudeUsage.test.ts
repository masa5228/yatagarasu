import { describe, expect, it } from 'vitest';
import { mapClaudeUsage, getClaudeUsage, type ClaudeCredentials } from '../src/server/usage/claudeUsage';

const limitsBody = {
  limits: [
    { kind: 'session', group: 'session', percent: 41, resets_at: '2026-07-06T18:20:00.000000+00:00', scope: null },
    { kind: 'weekly_all', group: 'weekly', percent: 18, resets_at: '2026-07-08T03:00:00.000000+00:00', scope: null },
    {
      kind: 'weekly_scoped',
      group: 'weekly',
      percent: 20,
      resets_at: '2026-07-08T03:00:00.000000+00:00',
      scope: { model: { id: null, display_name: 'Fable' } },
    },
  ],
};

const legacyBody = {
  five_hour: { utilization: 55, resets_at: '2026-07-06T18:20:00.000000+00:00' },
  seven_day: { utilization: 12, resets_at: '2026-07-08T03:00:00.000000+00:00' },
  seven_day_opus: { utilization: 30, resets_at: '2026-07-08T03:00:00.000000+00:00' },
  seven_day_sonnet: null,
};

const creds: ClaudeCredentials = {
  accessToken: 'tok',
  scopes: ['user:inference', 'user:profile'],
  subscriptionType: 'pro',
};

describe('mapClaudeUsage', () => {
  it('maps limits[] into session/weekly/models with ISO reset parsed to unix seconds', () => {
    const w = mapClaudeUsage(limitsBody);
    expect(w.session).toEqual({ label: '5h', usedPercent: 41, resetsAt: Math.floor(Date.parse(limitsBody.limits[0].resets_at) / 1000) });
    expect(w.weekly?.usedPercent).toBe(18);
    expect(w.models).toEqual([
      { label: 'Fable', usedPercent: 20, resetsAt: Math.floor(Date.parse(limitsBody.limits[2].resets_at) / 1000) },
    ]);
  });

  it('falls back to five_hour/seven_day/opus/sonnet when limits absent', () => {
    const w = mapClaudeUsage(legacyBody);
    expect(w.session?.usedPercent).toBe(55);
    expect(w.weekly?.usedPercent).toBe(12);
    expect(w.models).toEqual([
      { label: 'opus', usedPercent: 30, resetsAt: Math.floor(Date.parse('2026-07-08T03:00:00.000000+00:00') / 1000) },
    ]);
  });

  it('omits windows for null/missing fields without throwing', () => {
    expect(mapClaudeUsage({})).toEqual({});
    expect(mapClaudeUsage({ five_hour: null, seven_day: { utilization: 'x' } })).toEqual({});
  });
});

describe('getClaudeUsage', () => {
  const now = () => 1_783_345_000_000;

  it('returns disabled when no credentials', async () => {
    const u = await getClaudeUsage({ readCredentials: () => null, now });
    expect(u).toMatchObject({ provider: 'claude', status: 'disabled' });
  });

  it('returns expired when user:profile scope missing', async () => {
    const u = await getClaudeUsage({
      readCredentials: () => ({ accessToken: 't', scopes: ['user:inference'] }),
      now,
    });
    expect(u.status).toBe('expired');
  });

  it('returns expired when token already expired', async () => {
    const u = await getClaudeUsage({
      readCredentials: () => ({ ...creds, expiresAt: 1 }),
      now,
    });
    expect(u.status).toBe('expired');
  });

  it('returns ok with mapped windows and plan on 200', async () => {
    const u = await getClaudeUsage({
      readCredentials: () => creds,
      fetchUsage: async () => ({ httpStatus: 200, json: limitsBody }),
      now,
    });
    expect(u.status).toBe('ok');
    expect(u.plan).toBe('pro');
    expect(u.session?.usedPercent).toBe(41);
    expect(JSON.stringify(u)).not.toContain('tok');
  });

  it('returns expired on 401 and error on 500', async () => {
    const expired = await getClaudeUsage({
      readCredentials: () => creds,
      fetchUsage: async () => ({ httpStatus: 401, json: {} }),
      now,
    });
    expect(expired.status).toBe('expired');
    const errored = await getClaudeUsage({
      readCredentials: () => creds,
      fetchUsage: async () => ({ httpStatus: 500, json: {} }),
      now,
    });
    expect(errored.status).toBe('error');
  });
});
