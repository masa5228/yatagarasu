import { formatDuration } from '../lib/summarize';
import type { Activity } from '../types';
import styles from './ActivityDetail.module.css';

interface Props {
  activity: Activity;
}

function pretty(raw: string | null): string | null {
  if (raw == null) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function ActivityDetail({ activity }: Props) {
  const input = pretty(activity.tool_input);
  const result = pretty(activity.tool_result);

  return (
    <div className={styles.detail}>
      <div className={styles.block}>
        <span className={styles.key}>input</span>
        <pre className={styles.json}>{input ?? '—'}</pre>
      </div>
      {result != null && (
        <div className={styles.block}>
          <span className={styles.key}>result</span>
          <pre className={styles.json}>{result}</pre>
        </div>
      )}
      <div className={styles.metaRow}>
        <span>session: {activity.session_id}</span>
        <span>event: {activity.hook_event}</span>
        <span>
          status: {activity.status}
          {activity.duration_ms != null ? ` (${formatDuration(activity.duration_ms)})` : ''}
        </span>
      </div>
    </div>
  );
}
