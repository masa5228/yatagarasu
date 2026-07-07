import type { Activity, Agent } from '../types';

export interface AgentStatus {
  id: string;
  name: string;
  role: string;
  color?: string;
  active: boolean;
  last: Activity | null;
}

export const ACTIVE_WINDOW_SECONDS = 60;

export function computeAgentStatus(
  agents: Agent[],
  activities: Activity[],
  nowSec: number,
  colorMap: Map<string, string>,
): AgentStatus[] {
  const latest = new Map<string, Activity>();
  for (const activity of activities) {
    const prev = latest.get(activity.agent_name);
    if (!prev || activity.timestamp >= prev.timestamp) {
      latest.set(activity.agent_name, activity);
    }
  }

  return agents.map((agent) => {
    const last = latest.get(agent.name) ?? null;
    const active = last != null && nowSec - last.timestamp < ACTIVE_WINDOW_SECONDS;
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      color: colorMap.get(agent.name),
      active,
      last,
    };
  });
}
