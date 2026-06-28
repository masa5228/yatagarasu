import { describe, expect, it } from 'vitest';
import { resolveAgentName } from '../src/server/routes/hooks';

describe('resolveAgentName', () => {
  it('prefers ?agent= over body.agent_type (forced identity contract)', () => {
    expect(resolveAgentName({ agent: 'forced' }, { agent_type: 'sub' })).toBe('forced');
  });

  it('keeps a subagent name over ?fallback= (subagents are not painted)', () => {
    expect(resolveAgentName({ fallback: 'concierge' }, { agent_type: 'researcher' })).toBe(
      'researcher',
    );
  });

  it('uses ?fallback= for a lead session with no body name (lead becomes identifiable)', () => {
    expect(resolveAgentName({ fallback: 'concierge' }, {})).toBe('concierge');
  });

  it('prefers body.agent_name over ?fallback=', () => {
    expect(resolveAgentName({ fallback: 'x' }, { agent_name: 'sub' })).toBe('sub');
  });

  it('falls back to "default" when nothing identifies the agent', () => {
    expect(resolveAgentName({}, {})).toBe('default');
  });

  it('treats empty/whitespace-only values as absent', () => {
    expect(resolveAgentName({ agent: '   ' }, { agent_type: 'sub' })).toBe('sub');
    expect(resolveAgentName({ agent: '', fallback: '' }, {})).toBe('default');
  });
});
