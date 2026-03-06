/**
 * TypeScript types for window.electronAPI — injected by the Electron preload script.
 * In browser mode this is undefined; always check isElectron() before use.
 */
interface ElectronAPI {
  safeStorage: {
    isAvailable: () => Promise<boolean>;
    encrypt: (text: string) => Promise<string>;
    decrypt: (b64: string) => Promise<string>;
  };
  tor: {
    getStatus: () => Promise<boolean>;
    enable: () => Promise<void>;
    disable: () => Promise<void>;
  };
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
