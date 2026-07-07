import { copyStyles, syncTheme } from './copyStyles';

interface DocumentPictureInPictureApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

function getApi(): DocumentPictureInPictureApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { documentPictureInPicture?: DocumentPictureInPictureApi })
    .documentPictureInPicture;
  return api ?? null;
}

export function pipSupported(): boolean {
  return getApi() != null;
}

export interface OpenPipOptions {
  width?: number;
  height?: number;
  onClose: () => void;
}

export async function openPipWindow(opts: OpenPipOptions): Promise<Window | null> {
  const api = getApi();
  if (!api) return null;
  const win = await api.requestWindow({ width: opts.width ?? 340, height: opts.height ?? 210 });
  copyStyles(document, win.document);
  syncTheme(win.document);
  win.document.title = 'Yatagarasu';
  win.addEventListener('pagehide', opts.onClose);
  return win;
}
