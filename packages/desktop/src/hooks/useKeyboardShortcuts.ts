import { useEffect } from 'react';

export interface ShortcutHandlers {
  onCommandPalette: () => void;
  onSend: () => void;
  onReceive: () => void;
  onWalletConnect: () => void;
  onSettings: () => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        if (e.key === 'Escape') {
          handlers.onEscape();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'k':
          e.preventDefault();
          handlers.onCommandPalette();
          break;
        case 's':
          e.preventDefault();
          handlers.onSend();
          break;
        case 'r':
          e.preventDefault();
          handlers.onReceive();
          break;
        case 'w':
          e.preventDefault();
          handlers.onWalletConnect();
          break;
        case ',':
          e.preventDefault();
          handlers.onSettings();
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
