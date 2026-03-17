/**
 * App-wide React context — split into its own file so Vite Fast Refresh
 * can handle App.tsx correctly (mixing context exports + components breaks HMR).
 */
import React from 'react';
import type { SubWallet } from '@saiko-wallet/wallet-core';

export interface AppContext {
  addToast: (toast: { type: 'success' | 'error' | 'warning' | 'info'; message: string; title?: string }) => void;
  isWalletCreated: boolean;
  setWalletCreated: (val: boolean) => void;
  isLocked: boolean;
  setLocked: (val: boolean) => void;
  walletAddress: string;
  setWalletAddress: (addr: string) => void;
  accounts: SubWallet[];
  activeAccountIndex: number;
  switchAccount: (index: number) => void;
  createAccount: (name?: string) => void;
  renameAccount: (index: number, name: string) => void;
  removeAccount: (index: number) => void;
  exportPrivateKey: (index: number) => string;
  activeNetworkId: string;
  setActiveNetworkId: (id: string) => void;
  sessionMnemonic: string | null;
  setSessionMnemonic: (m: string | null) => void;
}

export const AppCtx = React.createContext<AppContext>({
  addToast: () => undefined,
  isWalletCreated: false,
  setWalletCreated: () => undefined,
  isLocked: false,
  setLocked: () => undefined,
  walletAddress: '',
  setWalletAddress: () => undefined,
  accounts: [],
  activeAccountIndex: 0,
  switchAccount: () => undefined,
  createAccount: () => undefined,
  renameAccount: () => undefined,
  removeAccount: () => undefined,
  exportPrivateKey: () => '',
  activeNetworkId: 'mainnet',
  setActiveNetworkId: () => undefined,
  sessionMnemonic: null,
  setSessionMnemonic: () => undefined,
});
