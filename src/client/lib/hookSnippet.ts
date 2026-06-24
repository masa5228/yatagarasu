export function buildHookCommand(agentName: string, port: string): string {
  const query = agentName.trim() ? `?agent=${encodeURIComponent(agentName.trim())}` : '';
  return `curl -s -X POST "http://localhost:${port}/api/hook${query}" -H "Content-Type: application/json" -d @-`;
}

export function buildHookConfig(agentName: string, port: string): string {
  const command = buildHookCommand(agentName, port);
  const config = {
    hooks: {
      PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command }] }],
      PostToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command }] }],
    },
  };
  return JSON.stringify(config, null, 2);
}
