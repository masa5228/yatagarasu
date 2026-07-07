import { useEffect, useState } from 'react';
import { agentColorStyle } from '../lib/agentColors';
import { computeAgentStatus } from '../lib/agentStatus';
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
  const statuses = computeAgentStatus(agents, activities, Math.floor(now / 1000), colorMap);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.heading}>AGENTS</div>
      <ul className={styles.list}>
        {statuses.map((s) => {
          const isSelected = selected === s.name;
          const task = s.last ? `${s.last.tool_name}: ${summarize(s.last.tool_input)}` : '';
          return (
            <li
              key={s.id}
              className={`${styles.item} ${isSelected ? styles.selected : ''}`}
              onClick={() => onSelect(s.name)}
            >
              <span className={`${styles.status} ${s.active ? styles.active : styles.inactive}`}>
                {s.active ? '⬤' : '○'}
              </span>
              <span className={styles.meta}>
                <span className={styles.nameRow}>
                  <span className={styles.name} style={agentColorStyle(s.color)}>
                    {s.name}
                  </span>
                  {s.last?.status === 'error' && <span className={styles.errorBadge}>⚠</span>}
                  {s.last?.status === 'running' && <span className={styles.runningBadge}>◌</span>}
                </span>
                <span className={styles.role}>{s.role}</span>
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
