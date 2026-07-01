export interface ThemeOption {
  id: string;
  accent: string;
  jpName: string;
  enName: string;
  caveat?: string;
  gradient?: boolean;
}

export const THEMES: ThemeOption[] = [
  { id: 'violet', accent: '#A06CFF', jpName: 'ストラクチュラル・バイオレット', enName: 'Structural Violet' },
  { id: 'indigo', accent: '#6E8BFF', jpName: 'アイリス・インディゴ', enName: 'Iris Indigo' },
  { id: 'cyan', accent: '#22D3C5', jpName: 'ペトロール・シアン', enName: 'Petrol Cyan' },
  { id: 'magenta', accent: '#E45CCB', jpName: 'マゼンタ・バイオレット', enName: 'Magenta Violet' },
  {
    id: 'emerald',
    accent: '#13B981',
    jpName: 'ディープ・エメラルド',
    enName: 'Deep Emerald',
    caveat: 'ステータスの緑（正常）と色相が近い',
  },
  {
    id: 'amber',
    accent: '#F5B13C',
    jpName: 'アンバー・ゴールド',
    enName: 'Amber Gold',
    caveat: 'ステータスの黄（警告）と色相が近い',
  },
  {
    id: 'crimson',
    accent: '#FB5470',
    jpName: 'クリムゾン・ルビー',
    enName: 'Crimson Ruby',
    caveat: 'ステータスの赤（異常）と色相が近い',
  },
  { id: 'oil', accent: '#9D6BFF', jpName: 'オイルスリック（玉虫色）', enName: 'Oil Slick', gradient: true },
];

export const DEFAULT_THEME_ID = 'violet';

const STORAGE_KEY = 'yatagarasu.theme';

export function getStoredThemeId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored;
  } catch {
    return DEFAULT_THEME_ID;
  }
  return DEFAULT_THEME_ID;
}

export function setStoredThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    return;
  }
}

export function applyTheme(id: string): void {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  const root = document.documentElement;
  root.style.setProperty('--accent', theme.accent);
  root.setAttribute('data-theme', theme.id);
}
