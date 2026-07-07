// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { copyStyles, syncTheme } from '../src/client/lib/copyStyles';

describe('copyStyles', () => {
  it('copies stylesheet rules into the target document head', () => {
    const style = document.createElement('style');
    style.textContent = '.x { color: red; }';
    document.head.appendChild(style);

    const target = document.implementation.createHTMLDocument('target');
    copyStyles(document, target);

    const styles = target.head.querySelectorAll('style');
    expect(styles.length).toBeGreaterThan(0);
    const combined = Array.from(styles)
      .map((s) => s.textContent)
      .join('');
    expect(combined).toContain('color: red');

    document.head.removeChild(style);
  });

  it('does nothing for a source without stylesheets', () => {
    const source = document.implementation.createHTMLDocument('source');
    const target = document.implementation.createHTMLDocument('target');
    copyStyles(source, target);
    expect(target.head.querySelectorAll('style, link').length).toBe(0);
  });
});

describe('syncTheme', () => {
  it('copies data-theme from source to target', () => {
    const source = document.implementation.createHTMLDocument('source');
    source.documentElement.dataset.theme = 'oil';
    const target = document.implementation.createHTMLDocument('target');
    syncTheme(target, source);
    expect(target.documentElement.dataset.theme).toBe('oil');
  });

  it('clears target theme when source has none', () => {
    const source = document.implementation.createHTMLDocument('source');
    const target = document.implementation.createHTMLDocument('target');
    target.documentElement.dataset.theme = 'oil';
    syncTheme(target, source);
    expect(target.documentElement.dataset.theme).toBeUndefined();
  });
});
