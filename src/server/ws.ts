import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { getRecentActivities, type Activity } from './db';

let wss: WebSocketServer | null = null;

export function attachWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    const activities = getRecentActivities(100).reverse();
    socket.send(JSON.stringify({ type: 'init', activities }));
  });
}

export function broadcastActivity(activity: Activity): void {
  if (!wss) return;
  const message = JSON.stringify({ type: 'activity', activity });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
