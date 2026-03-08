import { createContext } from 'react';
import type { ToastType } from '@saiko-wallet/ui-kit';
import type { SubWallet } from '@saiko-wallet/wallet-core';

export interface AppContext {
  addToast: (t: { type: ToastType; message: string }) => void;

  isWalletCreated: boolean;
  setWalletCreated: (v: boolean) => void;

  isLocked: boolean;
  setLocked: (v: boolean) => void;

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

export const AppCtx = createContext<AppContext>({
  addToast: () => {},
  isWalletCreated: false,
  setWalletCreated: () => {},
  isLocked: true,
  setLocked: () => {},
  walletAddress: '',
  setWalletAddress: () => {},
  accounts: [],
  activeAccountIndex: 0,
  switchAccount: () => {},
  createAccount: () => {},
  renameAccount: () => {},
  removeAccount: () => {},
  exportPrivateKey: () => '',
  activeNetworkId: 'mainnet',
  setActiveNetworkId: () => {},
  sessionMnemonic: null,
  setSessionMnemonic: () => {},
});
