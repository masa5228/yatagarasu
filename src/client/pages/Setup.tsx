import { useMemo, useState } from 'react';
import { buildHookConfig } from '../lib/hookSnippet';
import styles from './Setup.module.css';

export function Setup() {
  const [agentName, setAgentName] = useState('');
  const [port, setPort] = useState('3847');
  const [copied, setCopied] = useState(false);

  const snippet = useMemo(() => buildHookConfig(agentName, port), [agentName, port]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <h2 className={styles.title}>Setup Wizard</h2>
        <p className={styles.lead}>
          Claude Code のフック設定を生成します。下のJSONを <code>~/.claude/settings.json</code>
          （Windows: <code>%USERPROFILE%\.claude\settings.json</code>）の <code>hooks</code> に追加してください。
        </p>

        <div className={styles.fields}>
          <label className={styles.label}>
            エージェント名（任意）
            <input
              className={styles.input}
              value={agentName}
              placeholder="例: researcher（空欄なら default）"
              onChange={(e) => setAgentName(e.target.value)}
            />
          </label>
          <label className={styles.label}>
            ポート
            <input
              className={styles.input}
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>
        </div>

        <div className={styles.snippetHead}>
          <span className={styles.snippetLabel}>settings.json</span>
          <button className={styles.copy} onClick={copy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className={styles.snippet}>{snippet}</pre>

        <ol className={styles.steps}>
          <li>
            上の <strong>Copy</strong> でJSONをコピー
          </li>
          <li>
            <code>~/.claude/settings.json</code> を開き、<code>hooks</code> キーをマージ
          </li>
          <li>新しい Claude Code セッションから活動がフィードに流れます</li>
        </ol>
        <p className={styles.note}>
          複数のClaudeを役割別に動かす場合は、それぞれの設定でエージェント名を変えると、
          ダッシュボード上で別エージェントとして表示されます。
        </p>
      </div>
    </div>
  );
}
