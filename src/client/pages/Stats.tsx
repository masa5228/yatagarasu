import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { agentColorStyle, buildAgentColorMap } from '../lib/agentColors';
import { formatDuration } from '../lib/summarize';
import { CostPanel } from '../components/CostPanel';
import type { Agent, AgentStats } from '../types';
import styles from './Stats.module.css';

const REFRESH_MS = 15000;
const MAX_TOOL_ROWS = 6;

function Sparkline({ hourly }: { hourly: number[] }) {
  const max = Math.max(...hourly, 1);
  const barWidth = 8;
  const gap = 2;
  const height = 36;
  const width = hourly.length * (barWidth + gap) - gap;
  const now = Date.now();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.sparkline}
      role="img"
      aria-label="Tool calls per hour, last 24 hours"
    >
      {hourly.map((count, i) => {
        const barHeight = count === 0 ? 1.5 : Math.max(3, (count / max) * (height - 2));
        const hour = new Date(now - (hourly.length - 1 - i) * 3600_000).getHours();
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1.5}
            className={count === 0 ? styles.sparkEmpty : styles.sparkBar}
          >
            <title>{`${hour}:00 — ${count} calls`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function ToolBars({ tools }: { tools: AgentStats['tools'] }) {
  const top = tools.slice(0, MAX_TOOL_ROWS);
  const rest = tools.length - top.length;
  const max = Math.max(...top.map((t) => t.count), 1);

  return (
    <div className={styles.toolBars}>
      {top.map((tool) => (
        <div key={tool.tool_name} className={styles.toolRow} title={`${tool.tool_name}: ${tool.count}`}>
          <span className={styles.toolName}>{tool.tool_name}</span>
          <span className={styles.toolTrack}>
            <span className={styles.toolFill} style={{ width: `${(tool.count / max) * 100}%` }} />
          </span>
          <span className={styles.toolCount}>{tool.count}</span>
        </div>
      ))}
      {rest > 0 && <div className={styles.toolMore}>+{rest} more tools</div>}
    </div>
  );
}

function lastActiveLabel(lastTs: number): string {
  const diff = Math.floor(Date.now() / 1000) - lastTs;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function Stats() {
  const [stats, setStats] = useState<AgentStats[] | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api
        .getStats()
        .then((data) => {
          if (!cancelled) setStats(data.agents);
        })
        .catch(() => {});
      api
        .getAgents()
        .then((data) => {
          if (!cancelled) setAgents(data);
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

  const colorMap = useMemo(() => buildAgentColorMap(agents), [agents]);
  const sorted = useMemo(
    () => (stats ?? []).slice().sort((a, b) => b.total - a.total),
    [stats],
  );

  if (stats === null) {
    return <div className={styles.page}><p className={styles.empty}>Loading…</p></div>;
  }

  if (sorted.length === 0) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>No activity recorded yet</p>
        <CostPanel />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        {sorted.map((agent) => (
          <section key={agent.name} className={styles.card}>
            <header className={styles.cardHeader}>
              <span className={styles.agentName} style={agentColorStyle(colorMap.get(agent.name))}>
                {agent.name}
              </span>
              <span className={styles.lastActive}>{lastActiveLabel(agent.last_ts)}</span>
            </header>
            <div className={styles.tiles}>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Calls</span>
                <span className={styles.tileValue}>{agent.total}</span>
              </div>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Errors</span>
                <span className={agent.errors > 0 ? styles.tileValueError : styles.tileValue}>
                  {agent.errors > 0 ? `⚠ ${agent.errors}` : '0'}
                </span>
              </div>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Avg time</span>
                <span className={styles.tileValue}>
                  {agent.avg_duration_ms == null ? '—' : formatDuration(agent.avg_duration_ms)}
                </span>
              </div>
            </div>
            <div className={styles.sectionLabel}>Last 24h</div>
            <Sparkline hourly={agent.hourly} />
            <div className={styles.sectionLabel}>Tools</div>
            <ToolBars tools={agent.tools} />
          </section>
        ))}
      </div>
      <CostPanel />
    </div>
  );
}
