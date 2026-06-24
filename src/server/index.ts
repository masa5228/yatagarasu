import express from 'express';
import { createServer, type Server } from 'http';
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

  const clientDir = join(__dirname, '..', '..', 'client');
  if (existsSync(join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(join(clientDir, 'index.html'));
    });
  }

  return app;
}

export function startServer(options: StartOptions = {}): Promise<RunningServer> {
  const requested = options.port ?? DEFAULT_PORT;
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
