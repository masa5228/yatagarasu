import { useEffect, useState } from 'react';
import type { Agent, Activity } from '../types';
import styles from './AgentList.module.css';

interface Props {
  agents: Agent[];
  activities: Activity[];
  selected: string | null;
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

export function AgentList({ agents, activities, selected, onSelect }: Props) {
  const now = useNow(5000);

  const lastSeen = new Map<string, number>();
  for (const activity of activities) {
    const prev = lastSeen.get(activity.agent_name) ?? 0;
    if (activity.timestamp > prev) lastSeen.set(activity.agent_name, activity.timestamp);
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.heading}>AGENTS</div>
      <ul className={styles.list}>
        {agents.map((agent) => {
          const seen = lastSeen.get(agent.name) ?? 0;
          const active = now / 1000 - seen < 60;
          const isSelected = selected === agent.name;
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
                <span className={styles.name}>{agent.name}</span>
                <span className={styles.role}>{agent.role}</span>
              </span>
            </li>
          );
        })}
        {agents.length === 0 && <li className={styles.empty}>No agents yet</li>}
      </ul>
    </aside>
  );
}
