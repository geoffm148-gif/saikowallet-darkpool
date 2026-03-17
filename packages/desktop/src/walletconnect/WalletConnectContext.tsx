/**
 * Global WalletConnect context — keeps the WC client alive regardless of
 * which screen the user is on, so session_request events are never missed.
 */
import React, { createContext, useContext, type ReactNode } from 'react';
import { useWalletConnect, type WCState } from './useWalletConnect.js';

const WalletConnectCtx = createContext<WCState | null>(null);

export function WalletConnectProvider({ children }: { children: ReactNode }): React.ReactElement {
  const wc = useWalletConnect();
  return (
    <WalletConnectCtx.Provider value={wc}>
      {children}
    </WalletConnectCtx.Provider>
  );
}

export function useWalletConnectContext(): WCState {
  const ctx = useContext(WalletConnectCtx);
  if (!ctx) throw new Error('useWalletConnectContext must be used inside WalletConnectProvider');
  return ctx;
}
