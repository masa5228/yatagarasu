import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CostSummary, DailyTokens, ModelCost } from '../types';
import styles from './CostPanel.module.css';

const REFRESH_MS = 60000;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function breakdownTitle(m: ModelCost): string {
  return [
    `input ${m.inputTokens.toLocaleString()}`,
    `cached ${m.cachedInputTokens.toLocaleString()}`,
    `cache-write ${m.cacheCreationTokens.toLocaleString()}`,
    `output ${m.outputTokens.toLocaleString()}`,
    `reasoning ${m.reasoningTokens.toLocaleString()}`,
  ].join(' · ');
}

function DailyBars({ daily }: { daily: DailyTokens[] }) {
  const max = Math.max(...daily.map((d) => d.totalTokens), 1);
  const barWidth = 8;
  const gap = 2;
  const height = 36;
  const width = daily.length * (barWidth + gap) - gap;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.spark}
      role="img"
      aria-label="Daily token usage"
    >
      {daily.map((d, i) => {
        const barHeight = d.totalTokens === 0 ? 1.5 : Math.max(3, (d.totalTokens / max) * (height - 2));
        return (
          <rect
            key={d.date}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1.5}
            className={d.totalTokens === 0 ? styles.sparkEmpty : styles.sparkBar}
          >
            <title>{`${d.date} — ${d.totalTokens.toLocaleString()} tokens`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function CostPanel() {
  const [cost, setCost] = useState<CostSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api
        .getCost()
        .then((data) => {
          if (!cancelled) setCost(data);
        })
        .catch(() => {});
    }
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!cost) return null;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>Token usage (last {cost.windowDays}d)</div>
      {cost.byModel.length === 0 ? (
        <p className={styles.empty}>No local token usage recorded yet</p>
      ) : (
        <>
          <div className={styles.grid}>
            {cost.byModel.map((m) => (
              <div key={`${m.provider}-${m.model}`} className={styles.tile} title={breakdownTitle(m)}>
                <span className={styles.model}>{m.model}</span>
                <span className={styles.provider}>{m.provider}</span>
                <span className={styles.tokens}>{formatTokens(m.totalTokens)} tok</span>
              </div>
            ))}
          </div>
          <div className={styles.sectionLabel}>Daily</div>
          <DailyBars daily={cost.daily} />
        </>
      )}
    </section>
  );
}
