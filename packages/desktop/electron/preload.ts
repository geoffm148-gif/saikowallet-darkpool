import { contextBridge, ipcRenderer } from 'electron';

/**
 * Secure IPC bridge — exposes a minimal typed API to the renderer via window.electronAPI.
 * WHY contextBridge: prevents the renderer from accessing Node.js APIs directly while
 * allowing controlled communication with the main process.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  safeStorage: {
    isAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('safeStorage:isAvailable'),
    encrypt: (text: string): Promise<string> =>
      ipcRenderer.invoke('safeStorage:encrypt', text),
    decrypt: (b64: string): Promise<string> =>
      ipcRenderer.invoke('safeStorage:decrypt', b64),
  },
  tor: {
    getStatus: (): Promise<boolean> => ipcRenderer.invoke('tor:getStatus'),
    enable: (): Promise<void> => ipcRenderer.invoke('tor:enable'),
    disable: (): Promise<void> => ipcRenderer.invoke('tor:disable'),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    getPlatform: (): Promise<string> => ipcRenderer.invoke('app:getPlatform'),
    getResourcesPath: (): Promise<string> => ipcRenderer.invoke('app:getResourcesPath'),
  },
  rpc: {
    call: (url: string, method: string, params: unknown[]): Promise<{ result?: unknown; error?: { message?: string } }> =>
      ipcRenderer.invoke('rpc:call', url, method, params),
  },
  updater: {
    check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<void> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    onEvent: (cb: (payload: { event: string; data?: unknown }) => void): (() => void) => {
      const handler = (_: unknown, payload: { event: string; data?: unknown }) => cb(payload);
      ipcRenderer.on('updater:event', handler);
      return () => ipcRenderer.off('updater:event', handler);
    },
  },
});
