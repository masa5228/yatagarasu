import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/index';
import { refreshUsage, resetUsageForTests } from '../src/server/usage';
import { getClaudeUsage } from '../src/server/usage/claudeUsage';
import { getCodexUsage } from '../src/server/usage/codexUsage';
import type { ProviderUsage } from '../src/server/usage/types';

const app = createApp();

beforeEach(() => resetUsageForTests());

const okClaude: ProviderUsage = {
  provider: 'claude',
  status: 'ok',
  plan: 'pro',
  session: { label: '5h', usedPercent: 41, resetsAt: 1_783_362_000 },
  weekly: { label: 'week', usedPercent: 18, resetsAt: 1_783_523_600 },
  updatedAt: 1_783_345_000,
};

const okCodex: ProviderUsage = {
  provider: 'codex',
  status: 'ok',
  plan: 'plus',
  source: 'rpc',
  session: { label: '5h', usedPercent: 1, resetsAt: 1_783_363_874 },
  weekly: { label: 'week', usedPercent: 11, resetsAt: 1_783_523_662 },
  updatedAt: 1_783_345_000,
};

describe('GET /api/usage', () => {
  it('returns ok snapshots for both providers without secrets', async () => {
    await refreshUsage({ claude: async () => okClaude, codex: async () => okCodex });
    const res = await request(app).get('/api/usage').expect(200);
    expect(res.body.claude.status).toBe('ok');
    expect(res.body.codex.status).toBe('ok');
    expect(res.body.claude.session.usedPercent).toBe(41);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/accessToken|Bearer|sk-ant|access_token/i);
  });

  it('returns disabled for both when no credentials are present', async () => {
    await refreshUsage({
      claude: () => getClaudeUsage({ readCredentials: () => null }),
      codex: () => getCodexUsage({ authAvailable: () => false }),
    });
    const res = await request(app).get('/api/usage').expect(200);
    expect(res.body.claude.status).toBe('disabled');
    expect(res.body.codex.status).toBe('disabled');
  });

  it('supports a mixed expired/ok snapshot', async () => {
    await refreshUsage({
      claude: async () => ({ provider: 'claude', status: 'expired', updatedAt: 1, error: 're-auth required' }),
      codex: async () => okCodex,
    });
    const res = await request(app).get('/api/usage').expect(200);
    expect(res.body.claude.status).toBe('expired');
    expect(res.body.codex.status).toBe('ok');
  });
});
