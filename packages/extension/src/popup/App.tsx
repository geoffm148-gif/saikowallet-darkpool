/**
 * Saiko Wallet Extension — Main popup app with routing.
 *
 * Mirrors the desktop App.tsx architecture but adapted for:
 * - chrome.storage instead of localStorage
 * - 360x600 popup dimensions
 * - MemoryRouter (no URL bar in popup)
 */
import React, { type CSSProperties } from 'react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { COLORS, ToastContainer, useToasts } from '@saiko-wallet/ui-kit';
import type { SubWallet } from '@saiko-wallet/wallet-core';

import { ApprovalScreen } from './screens/ApprovalScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { UnlockScreen } from './screens/UnlockScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { SendScreen } from './screens/SendScreen';
import { ReceiveScreen } from './screens/ReceiveScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SwapScreen } from './screens/SwapScreen';
import { DarkPoolScreen } from './screens/DarkPoolScreen';
import { DarkPoolDepositScreen } from './screens/DarkPoolDepositScreen';
import { DarkPoolWithdrawScreen } from './screens/DarkPoolWithdrawScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { AppCtx } from './context';
import type { AppContext } from './context';
import {
  getState, setLocked as bgSetLocked, setWalletCreated as bgSetWalletCreated,
  setWalletAddress as bgSetWalletAddress, setNetwork as bgSetNetwork,
  saveAccountsState, loadAccountsState, connectPopupPort,
} from './storage';
import { HDNodeWallet, Mnemonic, getAddress } from 'ethers';

const appStyle: CSSProperties = {
  width: '360px',
  height: '600px',
  backgroundColor: COLORS.background,
  color: COLORS.textPrimary,
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  overflowX: 'hidden',
  overflowY: 'auto',
};

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const BASE_PATH = "m/44'/60'/0'/0";
const MAX_ACCOUNTS = 256;
const DEFAULT_ACCOUNT_NAME = 'Account';

function buildPath(index: number): string {
  return `${BASE_PATH}/${index}`;
}

function deriveSubWallet(mnemonic: string, index: number, name: string): SubWallet {
  const path = buildPath(index);
  const wallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), path);
  return {
    index,
    name,
    address: getAddress(wallet.address),
    derivationPath: path,
    createdAt: Date.now(),
    isDefault: index === 0,
  };
}

interface AccountsStateData {
  wallets: SubWallet[];
  activeIndex: number;
  nextIndex: number;
}

function AnimatedRoutes({
  isWalletCreated, isLocked,
}: {
  isWalletCreated: boolean; isLocked: boolean;
}): React.ReactElement {
  const location = useLocation();

  function DefaultRoute(): React.ReactElement {
    if (!isWalletCreated) return <Navigate to="/onboarding" replace />;
    if (isLocked) return <Navigate to="/unlock" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.15, ease: 'easeOut' }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}
      >
        <Routes location={location}>
          <Route path="/" element={<DefaultRoute />} />
          <Route path="/onboarding" element={<OnboardingScreen />} />
          <Route path="/import" element={<OnboardingScreen />} />
          <Route path="/unlock" element={<UnlockScreen />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/send" element={<SendScreen />} />
          <Route path="/receive" element={<ReceiveScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/swap" element={<SwapScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/darkpool" element={<DarkPoolScreen />} />
          <Route path="/darkpool/deposit" element={<DarkPoolDepositScreen />} />
          <Route path="/darkpool/withdraw" element={<DarkPoolWithdrawScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export function App(): React.ReactElement {
  // If opened as approval window (has requestId param), show approval screen directly
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('requestId')) {
    return <ApprovalScreen />;
  }

  const { toasts, addToast, dismissToast } = useToasts();

  const [isWalletCreated, setWalletCreatedRaw] = React.useState(false);
  const [isLocked, setLockedRaw] = React.useState(true);
  const [walletAddress, setWalletAddressRaw] = React.useState('');
  const [activeNetworkId, setActiveNetworkIdRaw] = React.useState('mainnet');
  const [sessionMnemonic, setSessionMnemonic] = React.useState<string | null>(null);
  const [accounts, setAccountsRaw] = React.useState<SubWallet[]>([]);
  const [activeAccountIndex, setActiveAccountIndexRaw] = React.useState(0);
  const [nextAccountIndex, setNextAccountIndex] = React.useState(1);
  const [initialized, setInitialized] = React.useState(false);

  // Load state from background on popup open
  React.useEffect(() => {
    connectPopupPort();
    getState().then(async state => {
      setWalletCreatedRaw(state.walletCreated);
      setLockedRaw(state.locked);
      setWalletAddressRaw(state.address);
      setActiveNetworkIdRaw(state.networkId);
      // If wallet is already unlocked, restore session mnemonic from SW session storage
      if (!state.locked) {
        try {
          const resp = await new Promise<{ mnemonic?: string | null }>((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'wallet:getMnemonic' }, (r) => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve(r as { mnemonic?: string | null });
            });
          });
          if (resp?.mnemonic) setSessionMnemonic(resp.mnemonic);
        } catch { /* mnemonic unavailable — wallet effectively locked */ }
      }
      setInitialized(true);
    }).catch(() => setInitialized(true));

    loadAccountsState().then(raw => {
      if (raw) {
        const data = raw as AccountsStateData;
        if (data.wallets?.length) {
          setAccountsRaw(data.wallets);
          setActiveAccountIndexRaw(data.activeIndex ?? 0);
          setNextAccountIndex(data.nextIndex ?? 1);
        }
      }
    }).catch(() => {});
  }, []);

  const persistAccounts = React.useCallback((wallets: SubWallet[], activeIdx: number, nextIdx: number) => {
    void saveAccountsState({ wallets, activeIndex: activeIdx, nextIndex: nextIdx });
  }, []);

  const setWalletCreated = React.useCallback((val: boolean) => {
    setWalletCreatedRaw(val);
    void bgSetWalletCreated(val);
    if (!val) {
      setSessionMnemonic(null);
      setAccountsRaw([]);
      setActiveAccountIndexRaw(0);
      setNextAccountIndex(1);
    }
  }, []);

  const setWalletAddress = React.useCallback((addr: string) => {
    setWalletAddressRaw(addr);
    void bgSetWalletAddress(addr);
  }, []);

  const setLocked = React.useCallback((val: boolean) => {
    setLockedRaw(val);
    void bgSetLocked(val);
    if (val) {
      setSessionMnemonic(null);
      // Clear session mnemonic from service worker
      chrome.runtime.sendMessage({ action: 'wallet:lock' });
    }
  }, []);

  const switchAccount = React.useCallback((index: number) => {
    const acct = accounts.find(a => a.index === index);
    if (!acct) return;
    setActiveAccountIndexRaw(index);
    setWalletAddressRaw(acct.address);
    void bgSetWalletAddress(acct.address);
    persistAccounts(accounts, index, nextAccountIndex);
  }, [accounts, nextAccountIndex, persistAccounts]);

  const createAccount = React.useCallback((name?: string) => {
    if (nextAccountIndex >= MAX_ACCOUNTS || !sessionMnemonic) return;
    const accountName = name?.trim() || `${DEFAULT_ACCOUNT_NAME} ${nextAccountIndex + 1}`;
    const subWallet = deriveSubWallet(sessionMnemonic, nextAccountIndex, accountName);
    const newAccounts = [...accounts, subWallet];
    const newNextIndex = nextAccountIndex + 1;
    setAccountsRaw(newAccounts);
    setNextAccountIndex(newNextIndex);
    persistAccounts(newAccounts, activeAccountIndex, newNextIndex);
  }, [accounts, nextAccountIndex, activeAccountIndex, persistAccounts, sessionMnemonic]);

  const renameAccount = React.useCallback((index: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const newAccounts = accounts.map(w => w.index === index ? { ...w, name: trimmed } : w);
    setAccountsRaw(newAccounts);
    persistAccounts(newAccounts, activeAccountIndex, nextAccountIndex);
  }, [accounts, activeAccountIndex, nextAccountIndex, persistAccounts]);

  const removeAccount = React.useCallback((index: number) => {
    if (index === 0 || !accounts.find(a => a.index === index)) return;
    const wasActive = activeAccountIndex === index;
    const newAccounts = accounts.filter(w => w.index !== index);
    const newActiveIndex = wasActive ? 0 : activeAccountIndex;
    setAccountsRaw(newAccounts);
    setActiveAccountIndexRaw(newActiveIndex);
    if (wasActive && newAccounts[0]) {
      setWalletAddressRaw(newAccounts[0].address);
      void bgSetWalletAddress(newAccounts[0].address);
    }
    persistAccounts(newAccounts, newActiveIndex, nextAccountIndex);
  }, [accounts, activeAccountIndex, nextAccountIndex, persistAccounts]);

  const exportPrivateKey = React.useCallback((index: number): string => {
    if (!sessionMnemonic) return '';
    const path = buildPath(index);
    const hdWallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(sessionMnemonic), path);
    return hdWallet.privateKey;
  }, [sessionMnemonic]);

  const setActiveNetworkId = React.useCallback((id: string) => {
    setActiveNetworkIdRaw(id);
    void bgSetNetwork(id);
  }, []);

  const ctx: AppContext = {
    addToast,
    isWalletCreated, setWalletCreated,
    isLocked, setLocked,
    walletAddress, setWalletAddress,
    accounts, activeAccountIndex,
    switchAccount, createAccount, renameAccount, removeAccount, exportPrivateKey,
    activeNetworkId, setActiveNetworkId,
    sessionMnemonic, setSessionMnemonic,
  };

  if (!initialized) {
    return (
      <div style={{
        ...appStyle,
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px', color: COLORS.textMuted,
      }}>
        Loading...
      </div>
    );
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div style={appStyle}>
        <MemoryRouter>
          <AnimatedRoutes isWalletCreated={isWalletCreated} isLocked={isLocked} />
        </MemoryRouter>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppCtx.Provider>
  );
}
