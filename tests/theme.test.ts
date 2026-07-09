// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  THEMES,
  DEFAULT_THEME_ID,
  getStoredThemeId,
  setStoredThemeId,
  applyTheme,
} from '../src/client/lib/theme';

const STORAGE_KEY = 'yatagarasu.theme';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.removeProperty('--accent');
});

describe('THEMES', () => {
  it('lists the default theme id', () => {
    expect(THEMES.some((t) => t.id === DEFAULT_THEME_ID)).toBe(true);
  });
});

describe('getStoredThemeId', () => {
  it('returns the default when nothing is stored', () => {
    expect(getStoredThemeId()).toBe(DEFAULT_THEME_ID);
  });

  it('returns a stored id that matches a known theme', () => {
    localStorage.setItem(STORAGE_KEY, 'cyan');
    expect(getStoredThemeId()).toBe('cyan');
  });

  it('ignores a stored id that is not a known theme', () => {
    localStorage.setItem(STORAGE_KEY, 'not-a-theme');
    expect(getStoredThemeId()).toBe(DEFAULT_THEME_ID);
  });

  it('falls back to the default when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getStoredThemeId()).toBe(DEFAULT_THEME_ID);
  });
});

describe('setStoredThemeId', () => {
  it('persists the id to localStorage', () => {
    setStoredThemeId('magenta');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('magenta');
  });

  it('swallows errors when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setStoredThemeId('violet')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('sets the accent variable and data-theme attribute for a known theme', () => {
    const cyan = THEMES.find((t) => t.id === 'cyan');
    applyTheme('cyan');
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('cyan');
    expect(root.style.getPropertyValue('--accent')).toBe(cyan?.accent);
  });

  it('falls back to the first theme for an unknown id', () => {
    applyTheme('nope');
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe(THEMES[0].id);
    expect(root.style.getPropertyValue('--accent')).toBe(THEMES[0].accent);
  });
});
