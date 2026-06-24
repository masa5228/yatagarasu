import { describe, expect, it } from 'vitest';
import { buildHookCommand, buildHookConfig } from '../src/client/lib/hookSnippet';

describe('buildHookCommand', () => {
  it('appends ?agent= when a name is given', () => {
    expect(buildHookCommand('researcher', '3847')).toContain(
      'http://localhost:3847/api/hook?agent=researcher',
    );
  });

  it('omits the query for empty or whitespace-only names', () => {
    expect(buildHookCommand('', '3847')).toContain('/api/hook"');
    expect(buildHookCommand('   ', '3847')).not.toContain('?agent=');
  });

  it('url-encodes the agent name', () => {
    expect(buildHookCommand('a b/c', '3847')).toContain('?agent=a%20b%2Fc');
  });

  it('uses the given port', () => {
    expect(buildHookCommand('x', '4000')).toContain('localhost:4000');
  });
});

describe('buildHookConfig', () => {
  it('produces valid JSON with the command on both Pre/PostToolUse', () => {
    const parsed = JSON.parse(buildHookConfig('researcher', '3847'));
    expect(parsed.hooks.PreToolUse[0].matcher).toBe('.*');
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toContain('?agent=researcher');
    expect(parsed.hooks.PostToolUse[0].hooks[0].command).toContain('?agent=researcher');
  });
});
