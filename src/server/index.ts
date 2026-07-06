import express from 'express';
import { createServer, type Server } from 'http';
import { existsSync } from 'fs';
import { join } from 'path';
import { hooksRouter } from './routes/hooks';
import { agentsRouter } from './routes/agents';
import { activitiesRouter } from './routes/activities';
import { statsRouter } from './routes/stats';
import { attachWebSocket } from './ws';
import { purgeActivitiesBefore } from './db';

const DEFAULT_PORT = 3847;
const DEFAULT_RETENTION_DAYS = 30;

export interface StartOptions {
  port?: number;
  retentionDays?: number;
}

export interface RunningServer {
  server: Server;
  port: number;
}

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '5mb' }));

  app.use('/api/hook', hooksRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/activities', activitiesRouter);
  app.use('/api/stats', statsRouter);

  const clientDir = join(__dirname, '..', '..', 'client');
  if (existsSync(join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(join(clientDir, 'index.html'));
    });
  }

  return app;
}

export function purgeOldActivities(retentionDays = DEFAULT_RETENTION_DAYS): number {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400;
  return purgeActivitiesBefore(cutoff);
}

export function startServer(options: StartOptions = {}): Promise<RunningServer> {
  const requested = options.port ?? DEFAULT_PORT;

  const purged = purgeOldActivities(options.retentionDays);
  if (purged > 0) {
    console.log(`◈ Purged ${purged} activities older than ${options.retentionDays ?? DEFAULT_RETENTION_DAYS} days`);
  }

  const server = createServer(createApp());
  attachWebSocket(server);

  return new Promise((resolve) => {
    server.listen(requested, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : requested;
      resolve({ server, port });
    });
  });
}
