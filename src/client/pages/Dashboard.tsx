import { useEffect, useState } from 'react';
import { useActivities } from '../hooks/useWebSocket';
import { AgentList } from '../components/AgentList';
import { ActivityFeed } from '../components/ActivityFeed';
import { api } from '../lib/api';
import type { Agent } from '../types';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const { activities, connected } = useActivities();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    api.getAgents().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    const known = new Set(agents.map((a) => a.name));
    const hasUnknown = activities.some((a) => !known.has(a.agent_name));
    if (hasUnknown) {
      api.getAgents().then(setAgents).catch(() => {});
    }
  }, [activities, agents]);

  const visible = filter ? activities.filter((a) => a.agent_name === filter) : activities;

  return (
    <div className={styles.dashboard}>
      <AgentList
        agents={agents}
        activities={activities}
        selected={filter}
        onSelect={(name) => setFilter((current) => (current === name ? null : name))}
      />
      <section className={styles.feedPane}>
        <div className={styles.feedHeader}>
          <span className={styles.feedTitle}>Activity Feed</span>
          <span className={connected ? styles.live : styles.offline}>
            {connected ? '⬤ Live' : '○ Offline'}
          </span>
        </div>
        <ActivityFeed activities={visible} />
      </section>
    </div>
  );
}
