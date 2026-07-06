import { describe, expect, it } from 'vitest';
import { agentColorStyle, buildAgentColorMap } from '../src/client/lib/agentColors';
import type { Agent } from '../src/client/types';

function agent(name: string, color: string | null): Agent {
  return {
    id: name,
    name,
    role: 'role',
    description: null,
    color,
    created_at: 0,
  };
}

describe('buildAgentColorMap', () => {
  it('maps agent names to colors', () => {
    const colorMap = buildAgentColorMap([
      agent('researcher', '#00ff9d'),
      agent('builder', '#c084fc'),
    ]);

    expect(colorMap.get('researcher')).toBe('#00ff9d');
    expect(colorMap.get('builder')).toBe('#c084fc');
  });

  it('omits agents with null colors', () => {
    const colorMap = buildAgentColorMap([agent('researcher', null)]);

    expect(colorMap.has('researcher')).toBe(false);
  });

  it('omits agents with empty or whitespace-only colors', () => {
    const colorMap = buildAgentColorMap([
      agent('empty', ''),
      agent('blank', '   '),
    ]);

    expect(colorMap.has('empty')).toBe(false);
    expect(colorMap.has('blank')).toBe(false);
  });
});

describe('agentColorStyle', () => {
  it('returns a CSS custom property style for a color', () => {
    expect(agentColorStyle('#c084fc')).toEqual({ '--agent-color': '#c084fc' });
  });

  it('returns undefined when no color is provided', () => {
    expect(agentColorStyle(undefined)).toBeUndefined();
  });
});
