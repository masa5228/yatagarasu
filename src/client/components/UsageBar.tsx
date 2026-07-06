import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ProviderUsage, RateWindow, UsageSnapshot } from '../types';
import styles from './UsageBar.module.css';

const REFRESH_MS = 45000;
const TICK_MS = 30000;

const PROVIDER_LABEL: Record<ProviderUsage['provider'], string> = {
  claude: 'Claude',
  codex: 'Codex',
};

function severityClass(percent: number): string {
  if (percent > 90) return styles.fillErr;
  if (percent >= 70) return styles.fillWarn;
  return styles.fillOk;
}

function countdown(resetsAt: number | null, nowSec: number): string {
  if (!resetsAt) return '';
  const remaining = resetsAt - nowSec;
  if (remaining <= 0) return '↺ now';
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  if (d > 0) return `↺ ${d}d${h}h`;
  if (h > 0) return `↺ ${h}h${m}m`;
  return `↺ ${m}m`;
}

function Window({ window: w, nowSec }: { window: RateWindow; nowSec: number }) {
  const pct = Math.min(100, Math.max(0, w.usedPercent));
  return (
    <div className={styles.window}>
      <span className={styles.windowLabel}>{w.label}</span>
      <span className={styles.track}>
        <span className={`${styles.fill} ${severityClass(pct)}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={styles.percent}>{pct}%</span>
      <span className={styles.reset}>{countdown(w.resetsAt, nowSec)}</span>
    </div>
  );
}

function ProviderRow({ usage, nowSec }: { usage: ProviderUsage; nowSec: number }) {
  if (usage.status === 'disabled') return null;
  const name = PROVIDER_LABEL[usage.provider];
  return (
    <div className={usage.status === 'error' ? `${styles.row} ${styles.stale}` : styles.row}>
      <span className={styles.provider}>
        {name}
        {usage.plan ? <span className={styles.plan}> · {usage.plan}</span> : null}
      </span>
      {usage.status === 'expired' ? (
        <span className={styles.pill} title={usage.error}>
          re-auth
        </span>
      ) : (
        <div className={styles.windows}>
          {usage.session ? <Window window={usage.session} nowSec={nowSec} /> : null}
          {usage.weekly ? <Window window={usage.weekly} nowSec={nowSec} /> : null}
          {usage.status === 'error' ? <span className={styles.staleTag}>stale</span> : null}
        </div>
      )}
    </div>
  );
}

export function UsageBar() {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    let cancelled = false;
    function load() {
      api
        .getUsage()
        .then((data) => {
          if (!cancelled) setSnapshot(data);
        })
        .catch(() => {});
    }
    load();
    const fetchId = window.setInterval(load, REFRESH_MS);
    const tickId = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), TICK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(fetchId);
      window.clearInterval(tickId);
    };
  }, []);

  if (!snapshot) return null;
  const rows = [snapshot.claude, snapshot.codex].filter((u) => u.status !== 'disabled');
  if (rows.length === 0) return null;

  return (
    <div className={styles.bar}>
      {rows.map((usage) => (
        <ProviderRow key={usage.provider} usage={usage} nowSec={nowSec} />
      ))}
    </div>
  );
}
