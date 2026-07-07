import { useEffect, useState } from 'react';
import { agentColorStyle } from '../lib/agentColors';
import { computeAgentStatus } from '../lib/agentStatus';
import { usageSeverity, type Severity } from '../lib/usage';
import type { Activity, Agent, ProviderUsage, RateWindow, UsageSnapshot } from '../types';
import styles from './Widget.module.css';

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

interface Props {
  usage: UsageSnapshot | null;
  agents: Agent[];
  activities: Activity[];
  colorMap: Map<string, string>;
}

function MiniWindow({ window: w }: { window: RateWindow }) {
  const pct = Math.min(100, Math.max(0, w.usedPercent));
  return (
    <span className={styles.win}>
      <span className={styles.winLabel}>{w.label}</span>
      <span className={styles.track}>
        <span className={`${styles.fill} ${FILL_CLASS[usageSeverity(pct)]}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={styles.pct}>{pct}%</span>
    </span>
  );
}

function UsageRow({ usage }: { usage: ProviderUsage }) {
  if (usage.status === 'disabled') return null;
  return (
    <div className={usage.status === 'error' ? `${styles.usageRow} ${styles.stale}` : styles.usageRow}>
      <span className={styles.provider}>
        {PROVIDER_LABEL[usage.provider]}
        {usage.plan ? <span className={styles.plan}> · {usage.plan}</span> : null}
      </span>
      {usage.status === 'expired' ? (
        <span className={styles.pill}>re-auth</span>
      ) : (
        <span className={styles.wins}>
          {usage.session ? <MiniWindow window={usage.session} /> : null}
          {usage.weekly ? <MiniWindow window={usage.weekly} /> : null}
        </span>
      )}
    </div>
  );
}

export function Widget({ usage, agents, activities, colorMap }: Props) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const statuses = computeAgentStatus(agents, activities, nowSec, colorMap);
  const usageRows = usage
    ? [usage.claude, usage.codex].filter((u) => u.status !== 'disabled')
    : [];

  return (
    <div className={styles.widget}>
      {usageRows.length > 0 && (
        <div className={styles.usage}>
          {usageRows.map((u) => (
            <UsageRow key={u.provider} usage={u} />
          ))}
        </div>
      )}
      <div className={styles.agents}>
        {statuses.map((s) => (
          <span key={s.id} className={styles.lamp} title={s.role}>
            <span className={s.active ? styles.on : styles.off}>{s.active ? '⬤' : '○'}</span>
            <span className={styles.agentName} style={agentColorStyle(s.color)}>
              {s.name}
            </span>
          </span>
        ))}
        {statuses.length === 0 && <span className={styles.empty}>No agents</span>}
      </div>
    </div>
  );
}
