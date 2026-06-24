#!/usr/bin/env node
import { startServer } from '../src/server/index';

interface ParsedArgs {
  command: string;
  port?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'start', ...rest] = argv;
  let port: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--port' || rest[i] === '-p') {
      const value = Number(rest[i + 1]);
      if (!Number.isNaN(value)) port = value;
      i++;
    }
  }
  return { command, port };
}

async function main(): Promise<void> {
  const { command, port } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'start': {
      const actualPort = await startServer({ port });
      console.log(`◈ Yatagarasu running at http://localhost:${actualPort}`);
      break;
    }
    default:
      console.log('Usage: yata start [--port <number>]');
      process.exit(1);
  }
}

main();
