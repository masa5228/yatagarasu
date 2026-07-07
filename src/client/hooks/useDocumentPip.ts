import { useCallback, useEffect, useRef, useState } from 'react';
import { openPipWindow, pipSupported } from '../lib/pip';

export interface DocumentPip {
  supported: boolean;
  pipWindow: Window | null;
  open: () => Promise<void>;
  close: () => void;
}

export function useDocumentPip(opts: { width?: number; height?: number } = {}): DocumentPip {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipRef = useRef<Window | null>(null);
  const openingRef = useRef(false);
  const { width, height } = opts;

  const handleClose = useCallback(() => {
    pipRef.current = null;
    setPipWindow(null);
  }, []);

  const open = useCallback(async () => {
    if (pipRef.current || openingRef.current) return;
    openingRef.current = true;
    try {
      const win = await openPipWindow({ width, height, onClose: handleClose });
      if (win) {
        pipRef.current = win;
        setPipWindow(win);
      }
    } finally {
      openingRef.current = false;
    }
  }, [width, height, handleClose]);

  const close = useCallback(() => {
    pipRef.current?.close();
  }, []);

  useEffect(() => {
    return () => {
      const win = pipRef.current;
      if (win) {
        win.removeEventListener('pagehide', handleClose);
        win.close();
      }
    };
  }, [handleClose]);

  return { supported: pipSupported(), pipWindow, open, close };
}
