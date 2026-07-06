import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { purgeOldActivities } from '../src/server/index';
import { insertActivity, getRecentActivities, _resetForTests, type Activity } from '../src/server/db';

beforeEach(() => _resetForTests());

function makeActivity(ageSeconds: number): Activity {
  const ts = Math.floor(Date.now() / 1000) - ageSeconds;
  return {
    id: randomUUID(),
    agent_name: 'r',
    session_id: 's',
    tool_name: 'Bash',
    tool_input: null,
    tool_result: null,
    hook_event: 'PostToolUse',
    timestamp: ts,
    status: 'completed',
    duration_ms: null,
    timestamp_ms: ts * 1000,
    tool_use_id: null,
  };
}

describe('purgeOldActivities', () => {
  it('deletes activities older than the retention window and keeps the rest', () => {
    insertActivity(makeActivity(40 * 86400));
    insertActivity(makeActivity(10 * 86400));
    insertActivity(makeActivity(0));

    const purged = purgeOldActivities(30);

    expect(purged).toBe(1);
    expect(getRecentActivities(10)).toHaveLength(2);
  });

  it('uses the 30-day default', () => {
    insertActivity(makeActivity(31 * 86400));
    insertActivity(makeActivity(29 * 86400));

    expect(purgeOldActivities()).toBe(1);
    expect(getRecentActivities(10)).toHaveLength(1);
  });

  it('does nothing for zero or negative retention', () => {
    insertActivity(makeActivity(100 * 86400));

    expect(purgeOldActivities(0)).toBe(0);
    expect(purgeOldActivities(-5)).toBe(0);
    expect(getRecentActivities(10)).toHaveLength(1);
  });
});
