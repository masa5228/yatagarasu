import { useState } from 'react';
import { THEMES, applyTheme, getStoredThemeId, setStoredThemeId } from '../lib/theme';
import styles from './ThemePicker.module.css';

export function ThemePicker() {
  const [selected, setSelected] = useState<string>(() => getStoredThemeId());

  function choose(id: string) {
    setSelected(id);
    applyTheme(id);
    setStoredThemeId(id);
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>テーマカラー</h2>
      <p className={styles.lead}>
        ダッシュボードのアクセント色を選べます。選択は即時反映され、この端末（ブラウザ）に保存されます。
        正常（緑）・警告（黄）・異常（赤）のステータス色は、どのテーマでも固定です。
      </p>
      <ul className={styles.grid}>
        {THEMES.map((theme, index) => {
          const isActive = selected === theme.id;
          return (
            <li key={theme.id}>
              <button
                type="button"
                className={`${styles.option} ${isActive ? styles.active : ''}`}
                aria-pressed={isActive}
                onClick={() => choose(theme.id)}
              >
                <span className={styles.swatch} data-theme-id={theme.id} />
                <span className={styles.meta}>
                  <span className={styles.no}>No.{index + 1}</span>
                  <span className={styles.name}>{theme.jpName}</span>
                  <span className={styles.sub}>
                    {theme.enName}
                    {theme.gradient ? ' · 玉虫色グラデ' : ` · ${theme.accent.toUpperCase()}`}
                  </span>
                </span>
                <span className={styles.right}>
                  {theme.caveat && (
                    <span className={styles.caveat} title={theme.caveat} aria-label={theme.caveat}>
                      ⚠
                    </span>
                  )}
                  {isActive && <span className={styles.check}>✓</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
