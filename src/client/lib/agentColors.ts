import type { CSSProperties } from 'react';
import type { Agent } from '../types';

export function buildAgentColorMap(agents: Agent[]): Map<string, string> {
  const colorMap = new Map<string, string>();

  for (const agent of agents) {
    if (agent.color && agent.color.trim()) {
      colorMap.set(agent.name, agent.color);
    }
  }

  return colorMap;
}

export function agentColorStyle(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return { ['--agent-color']: color } as CSSProperties;
}
