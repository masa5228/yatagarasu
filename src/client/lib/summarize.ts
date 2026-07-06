export function summarize(input: string | null): string {
  if (!input) return '';
  try {
    const obj = JSON.parse(input);
    if (typeof obj === 'string') return obj;
    if (obj.query) return String(obj.query);
    if (obj.command) return String(obj.command);
    if (obj.file_path) return String(obj.file_path);
    if (obj.path) return String(obj.path);
    if (obj.url) return String(obj.url);
    const str = JSON.stringify(obj);
    return str.length > 80 ? `${str.slice(0, 80)}…` : str;
  } catch {
    return input.length > 80 ? `${input.slice(0, 80)}…` : input;
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m${seconds}s`;
}
