import { useEffect, useMemo, useState } from 'react';
import { useActivities } from '../hooks/useWebSocket';
import { AgentList } from '../components/AgentList';
import { ActivityFeed } from '../components/ActivityFeed';
import { UsageBar } from '../components/UsageBar';
import { api } from '../lib/api';
import { buildAgentColorMap } from '../lib/agentColors';
import type { Agent } from '../types';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const { activities, connected } = useActivities();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [session, setSession] = useState<string>('all');

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

  const colorMap = useMemo(() => buildAgentColorMap(agents), [agents]);

  const sessions = useMemo(
    () => Array.from(new Set(activities.map((a) => a.session_id))),
    [activities],
  );

  const visible = activities.filter(
    (a) =>
      (!filter || a.agent_name === filter) && (session === 'all' || a.session_id === session),
  );

  return (
    <div className={styles.page}>
      <UsageBar />
      <div className={styles.dashboard}>
        <AgentList
          agents={agents}
          activities={activities}
          selected={filter}
          colorMap={colorMap}
          onSelect={(name) => setFilter((current) => (current === name ? null : name))}
        />
        <section className={styles.feedPane}>
        <div className={styles.feedHeader}>
          <span className={styles.feedTitle}>Activity Feed</span>
          <div className={styles.headerRight}>
            <select
              className={styles.sessionSelect}
              value={session}
              onChange={(e) => setSession(e.target.value)}
            >
              <option value="all">All sessions</option>
              {sessions.map((s) => (
                <option key={s} value={s}>
                  {s.length > 12 ? `${s.slice(0, 12)}…` : s}
                </option>
              ))}
            </select>
            <span className={connected ? styles.live : styles.offline}>
              {connected ? '⬤ Live' : '○ Offline'}
            </span>
          </div>
        </div>
          <ActivityFeed activities={visible} colorMap={colorMap} />
        </section>
      </div>
    </div>
  );
}
