import express from 'express';
import { createServer } from 'http';
import { existsSync } from 'fs';
import { join } from 'path';
import { hooksRouter } from './routes/hooks';
import { agentsRouter } from './routes/agents';
import { activitiesRouter } from './routes/activities';
import { attachWebSocket } from './ws';

const DEFAULT_PORT = 3847;

export interface StartOptions {
  port?: number;
}

export function startServer(options: StartOptions = {}): Promise<number> {
  const port = options.port ?? DEFAULT_PORT;
  const app = express();

  app.use(express.json({ limit: '5mb' }));

  app.use('/api/hook', hooksRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/activities', activitiesRouter);

  const clientDir = join(__dirname, '..', '..', 'client');
  if (existsSync(join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(join(clientDir, 'index.html'));
    });
  }

  const server = createServer(app);
  attachWebSocket(server);

  return new Promise((resolve) => {
    server.listen(port, () => resolve(port));
  });
}
