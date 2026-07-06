import { useEffect, useRef, useState } from 'react';
import { agentColorStyle } from '../lib/agentColors';
import { summarize, formatDuration } from '../lib/summarize';
import type { Activity } from '../types';
import { ActivityDetail } from './ActivityDetail';
import styles from './ActivityFeed.module.css';

interface Props {
  activities: Activity[];
  colorMap: Map<string, string>;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-GB', { hour12: false });
}

function StatusBadge({ activity }: { activity: Activity }) {
  if (activity.status === 'running') {
    return <span className={styles.running}>◌ running</span>;
  }
  if (activity.status === 'error') {
    return (
      <span className={styles.error}>
        ✕ error{activity.duration_ms != null ? ` ${formatDuration(activity.duration_ms)}` : ''}
      </span>
    );
  }
  if (activity.duration_ms != null) {
    return <span className={styles.duration}>{formatDuration(activity.duration_ms)}</span>;
  }
  return null;
}

export function ActivityFeed({ activities, colorMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);

  function scrollToBottom() {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    followRef.current = true;
    setNewCount(0);
  }

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    followRef.current = nearBottom;
    if (nearBottom) setNewCount(0);
  }

  useEffect(() => {
    if (followRef.current) {
      scrollToBottom();
    } else {
      setNewCount((count) => count + 1);
    }
  }, [activities.length]);

  return (
    <div className={styles.feedWrap}>
      <div className={styles.feed} ref={containerRef} onScroll={handleScroll}>
        {activities.length === 0 && <div className={styles.empty}>Waiting for activity…</div>}
        {activities.map((activity) => {
          const expanded = expandedId === activity.id;
          const rowClasses = [
            styles.row,
            expanded ? styles.rowActive : '',
            activity.status === 'error' ? styles.rowError : '',
          ].join(' ');
          return (
            <div key={activity.id} className={styles.rowWrap}>
              <div
                className={rowClasses}
                onClick={() => setExpandedId(expanded ? null : activity.id)}
              >
                <span className={styles.caret}>{expanded ? '▾' : '▸'}</span>
                <span className={styles.time}>{formatTime(activity.timestamp)}</span>
                <span
                  className={styles.agent}
                  style={agentColorStyle(colorMap.get(activity.agent_name))}
                >
                  {activity.agent_name}
                </span>
                <span className={styles.tool}>{activity.tool_name}</span>
                <span className={styles.summary}>{summarize(activity.tool_input)}</span>
                <span className={styles.status}>
                  <StatusBadge activity={activity} />
                </span>
              </div>
              {expanded && <ActivityDetail activity={activity} />}
            </div>
          );
        })}
      </div>
      {newCount > 0 && (
        <button className={styles.newPill} onClick={scrollToBottom}>
          ↓ {newCount} new
        </button>
      )}
    </div>
  );
}
