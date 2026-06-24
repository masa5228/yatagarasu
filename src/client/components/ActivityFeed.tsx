import { useEffect, useRef } from 'react';
import type { Activity } from '../types';
import styles from './ActivityFeed.module.css';

interface Props {
  activities: Activity[];
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-GB', { hour12: false });
}

function summarize(input: string | null): string {
  if (!input) return '';
  try {
    const obj = JSON.parse(input);
    if (typeof obj === 'string') return obj;
    if (obj.query) return String(obj.query);
    if (obj.command) return String(obj.command);
    if (obj.file_path) return String(obj.file_path);
    if (obj.path) return String(obj.path);
    if (obj.url) return String(obj.url);
    const str = JSON.stringify(obj);
    return str.length > 80 ? `${str.slice(0, 80)}…` : str;
  } catch {
    return input.length > 80 ? `${input.slice(0, 80)}…` : input;
  }
}

export function ActivityFeed({ activities }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activities.length]);

  return (
    <div className={styles.feed}>
      {activities.length === 0 && <div className={styles.empty}>Waiting for activity…</div>}
      {activities.map((activity) => (
        <div key={activity.id} className={styles.row}>
          <span className={styles.time}>{formatTime(activity.timestamp)}</span>
          <span className={styles.agent}>{activity.agent_name}</span>
          <span className={styles.tool}>{activity.tool_name}</span>
          <span className={styles.summary}>{summarize(activity.tool_input)}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
