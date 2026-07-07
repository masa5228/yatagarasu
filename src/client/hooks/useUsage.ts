import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { UsageSnapshot } from '../types';

const REFRESH_MS = 45000;

export function useUsage(): UsageSnapshot | null {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api
        .getUsage()
        .then((data) => {
          if (!cancelled) setSnapshot(data);
        })
        .catch(() => {});
    }
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return snapshot;
}
