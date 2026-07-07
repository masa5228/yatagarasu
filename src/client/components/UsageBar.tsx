import { useEffect, useState } from 'react';
import { countdown, usageSeverity, type Severity } from '../lib/usage';
import type { ProviderUsage, RateWindow, UsageSnapshot } from '../types';
import styles from './UsageBar.module.css';

const TICK_MS = 30000;

const PROVIDER_LABEL: Record<ProviderUsage['provider'], string> = {
  claude: 'Claude',
  codex: 'Codex',
};

const FILL_CLASS: Record<Severity, string> = {
  ok: styles.fillOk,
  warn: styles.fillWarn,
  err: styles.fillErr,
};

function Window({ window: w, nowSec }: { window: RateWindow; nowSec: number }) {
  const pct = Math.min(100, Math.max(0, w.usedPercent));
  return (
    <div className={styles.window}>
      <span className={styles.windowLabel}>{w.label}</span>
      <span className={styles.track}>
        <span className={`${styles.fill} ${FILL_CLASS[usageSeverity(pct)]}`} style={{ width: `${pct}%` }} />
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

export function UsageBar({ snapshot }: { snapshot: UsageSnapshot | null }) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), TICK_MS);
    return () => window.clearInterval(id);
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
