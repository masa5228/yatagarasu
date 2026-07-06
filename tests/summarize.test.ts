import { describe, expect, it } from 'vitest';
import { summarize, formatDuration } from '../src/client/lib/summarize';

describe('summarize', () => {
  it('returns empty string for null input', () => {
    expect(summarize(null)).toBe('');
  });

  it('extracts well-known fields', () => {
    expect(summarize(JSON.stringify({ query: 'mastra' }))).toBe('mastra');
    expect(summarize(JSON.stringify({ command: 'ls -la' }))).toBe('ls -la');
    expect(summarize(JSON.stringify({ file_path: '/tmp/a.txt' }))).toBe('/tmp/a.txt');
    expect(summarize(JSON.stringify({ url: 'https://x.dev' }))).toBe('https://x.dev');
  });

  it('truncates long payloads to 80 chars plus ellipsis', () => {
    const long = JSON.stringify({ data: 'x'.repeat(200) });
    const result = summarize(long);
    expect(result.length).toBe(81);
    expect(result.endsWith('…')).toBe(true);
  });

  it('falls back to the raw string for invalid JSON', () => {
    expect(summarize('not json')).toBe('not json');
  });
});

describe('formatDuration', () => {
  it('formats sub-second durations as ms', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds with one decimal', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(12400)).toBe('12.4s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m0s');
    expect(formatDuration(83000)).toBe('1m23s');
  });
});
