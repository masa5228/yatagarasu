import { useEffect, useState } from 'react';
import { agentColorStyle } from '../lib/agentColors';
import { summarize } from '../lib/summarize';
import type { Agent, Activity } from '../types';
import styles from './AgentList.module.css';

interface Props {
  agents: Agent[];
  activities: Activity[];
  selected: string | null;
  colorMap: Map<string, string>;
  onSelect: (name: string) => void;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function AgentList({ agents, activities, selected, colorMap, onSelect }: Props) {
  const now = useNow(5000);

  const latest = new Map<string, Activity>();
  for (const activity of activities) {
    const prev = latest.get(activity.agent_name);
    if (!prev || activity.timestamp >= prev.timestamp) {
      latest.set(activity.agent_name, activity);
    }
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.heading}>AGENTS</div>
      <ul className={styles.list}>
        {agents.map((agent) => {
          const last = latest.get(agent.name);
          const active = last != null && now / 1000 - last.timestamp < 60;
          const isSelected = selected === agent.name;
          const task = last ? `${last.tool_name}: ${summarize(last.tool_input)}` : '';
          return (
            <li
              key={agent.id}
              className={`${styles.item} ${isSelected ? styles.selected : ''}`}
              onClick={() => onSelect(agent.name)}
            >
              <span className={`${styles.status} ${active ? styles.active : styles.inactive}`}>
                {active ? '⬤' : '○'}
              </span>
              <span className={styles.meta}>
                <span className={styles.nameRow}>
                  <span className={styles.name} style={agentColorStyle(colorMap.get(agent.name))}>
                    {agent.name}
                  </span>
                  {last?.status === 'error' && <span className={styles.errorBadge}>⚠</span>}
                  {last?.status === 'running' && <span className={styles.runningBadge}>◌</span>}
                </span>
                <span className={styles.role}>{agent.role}</span>
                {task && (
                  <span className={styles.task} title={task}>
                    {task}
                  </span>
                )}
              </span>
            </li>
          );
        })}
        {agents.length === 0 && <li className={styles.empty}>No agents yet</li>}
      </ul>
    </aside>
  );
}
