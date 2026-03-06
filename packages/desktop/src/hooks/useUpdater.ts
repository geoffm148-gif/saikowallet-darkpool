/**
 * useUpdater — listens for electron-updater events from the main process
 * and exposes controls to download + install updates.
 */
import { useEffect, useState } from 'react';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

interface UpdaterAPI {
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  onEvent: (cb: (payload: { event: string; data?: unknown }) => void) => () => void;
}

function getUpdaterAPI(): UpdaterAPI | null {
  return (window as unknown as { electronAPI?: { updater?: UpdaterAPI } })
    .electronAPI?.updater ?? null;
}

export function useUpdater(): {
  update: UpdateState;
  download: () => void;
  install: () => void;
  dismiss: () => void;
} {
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    const api = getUpdaterAPI();
    if (!api) return; // dev mode / web — no updater

    const unsub = api.onEvent(({ event, data }) => {
      const info = data as Record<string, unknown> | undefined;

      switch (event) {
        case 'checking':
          setUpdate({ status: 'checking' });
          break;
        case 'available':
          setUpdate({
            status: 'available',
            version: (info?.version as string) ?? '',
            releaseNotes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : undefined,
          });
          break;
        case 'not-available':
          setUpdate({ status: 'idle' });
          break;
        case 'progress':
          setUpdate({ status: 'downloading', percent: (info?.percent as number) ?? 0 });
          break;
        case 'downloaded':
          setUpdate({ status: 'ready', version: (info?.version as string) ?? '' });
          break;
        case 'error':
          setUpdate({ status: 'error', message: (data as string) ?? 'Update failed' });
          break;
      }
    });

    return unsub;
  }, []);

  const download = () => {
    const api = getUpdaterAPI();
    if (!api) return;
    setUpdate((prev) => prev.status === 'available'
      ? { status: 'downloading', percent: 0 }
      : prev);
    void api.download();
  };

  const install = () => {
    const api = getUpdaterAPI();
    if (!api) return;
    void api.install();
  };

  const dismiss = () => setUpdate({ status: 'idle' });

  return { update, download, install, dismiss };
}
