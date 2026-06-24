import { useEffect, useRef, useState } from 'react';
import type { Activity } from '../types';

interface InitMessage {
  type: 'init';
  activities: Activity[];
}

interface ActivityMessage {
  type: 'activity';
  activity: Activity;
}

type ServerMessage = InitMessage | ActivityMessage;

export function useActivities(): { activities: Activity[]; connected: boolean } {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: number | undefined;

    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      socketRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, 2000);
      };
      ws.onmessage = (event) => {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === 'init') {
          setActivities(msg.activities);
        } else if (msg.type === 'activity') {
          setActivities((prev) => [...prev, msg.activity].slice(-100));
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  return { activities, connected };
}
