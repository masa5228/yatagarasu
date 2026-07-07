// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPipWindow, pipSupported } from '../src/client/lib/pip';

afterEach(() => {
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture;
});

function makeFakePip() {
  const doc = document.implementation.createHTMLDocument('pip');
  const listeners: Record<string, Array<() => void>> = {};
  return {
    document: doc,
    addEventListener: (type: string, cb: () => void) => {
      (listeners[type] ||= []).push(cb);
    },
    removeEventListener: vi.fn(),
    close: vi.fn(),
    fire: (type: string) => (listeners[type] ?? []).forEach((cb) => cb()),
  };
}

describe('pipSupported', () => {
  it('reflects presence of the Document PiP API', () => {
    expect(pipSupported()).toBe(false);
    (window as unknown as { documentPictureInPicture: unknown }).documentPictureInPicture = {
      requestWindow: vi.fn(),
    };
    expect(pipSupported()).toBe(true);
  });
});

describe('openPipWindow', () => {
  it('returns null when the API is unavailable', async () => {
    expect(await openPipWindow({ onClose: () => {} })).toBeNull();
  });

  it('requests a window, injects styles, sets title, and wires pagehide', async () => {
    const style = document.createElement('style');
    style.textContent = '.w { color: blue; }';
    document.head.appendChild(style);

    const fake = makeFakePip();
    const requestWindow = vi.fn().mockResolvedValue(fake);
    (window as unknown as { documentPictureInPicture: unknown }).documentPictureInPicture = { requestWindow };
    const onClose = vi.fn();

    const win = await openPipWindow({ width: 300, height: 200, onClose });

    expect(requestWindow).toHaveBeenCalledWith({ width: 300, height: 200 });
    expect(win).toBe(fake as unknown as Window);
    expect(fake.document.title).toBe('Yatagarasu');
    expect(fake.document.head.querySelectorAll('style').length).toBeGreaterThan(0);

    fake.fire('pagehide');
    expect(onClose).toHaveBeenCalledTimes(1);

    document.head.removeChild(style);
  });
});
