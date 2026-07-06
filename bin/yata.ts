#!/usr/bin/env node
import { startServer } from '../src/server/index';

interface ParsedArgs {
  command: string;
  port?: number;
  retentionDays?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'start', ...rest] = argv;
  let port: number | undefined;
  let retentionDays: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--port' || rest[i] === '-p') {
      const value = Number(rest[i + 1]);
      if (!Number.isNaN(value)) port = value;
      i++;
    } else if (rest[i] === '--retention-days') {
      const value = Number(rest[i + 1]);
      if (!Number.isNaN(value)) retentionDays = value;
      i++;
    }
  }
  return { command, port, retentionDays };
}

async function main(): Promise<void> {
  const { command, port, retentionDays } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'start': {
      const { port: actualPort } = await startServer({ port, retentionDays });
      console.log(`◈ Yatagarasu running at http://localhost:${actualPort}`);
      break;
    }
    default:
      console.log('Usage: yata start [--port <number>] [--retention-days <number>]');
      process.exit(1);
  }
}

main();
