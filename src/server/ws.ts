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

function broadcast(message: string): void {
  if (!wss) return;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export function broadcastActivity(activity: Activity): void {
  broadcast(JSON.stringify({ type: 'activity', activity }));
}

export function broadcastActivityUpdate(activity: Activity): void {
  broadcast(JSON.stringify({ type: 'activity_update', activity }));
}
