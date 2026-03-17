/**
 * Saiko Wallet Desktop — Main app with routing.
 *
 * Screen flow:
 *   /             → redirect based on wallet state
 *   /onboarding   → Create new wallet flow
 *   /import       → Import via seed phrase
 *   /unlock       → PIN/passphrase unlock
 *   /dashboard    → Main wallet view
 *   /send         → Send tokens
 *   /receive      → Receive tokens (QR code)
 *   /contacts     → Address book
 *   /settings     → Settings & security
 */
import React, { type CSSProperties } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { COLORS } from '@saiko-wallet/ui-kit';
import { ToastContainer, useToasts } from '@saiko-wallet/ui-kit';

import { OnboardingScreen } from './screens/OnboardingScreen.js';
import { ImportWalletScreen } from './screens/ImportWalletScreen.js';
import { DashboardScreen } from './screens/DashboardScreen.js';
import { SendScreen } from './screens/SendScreen.js';
import { ReceiveScreen } from './screens/ReceiveScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { UnlockScreen } from './screens/UnlockScreen.js';
import { SwapScreen } from './screens/SwapScreen.js';
import { DarkPoolScreen } from './screens/DarkPoolScreen.js';
import { DarkPoolDepositScreen } from './screens/DarkPoolDepositScreen.js';
import { DarkPoolNoteBackupScreen } from './screens/DarkPoolNoteBackupScreen.js';
import { DarkPoolWithdrawScreen } from './screens/DarkPoolWithdrawScreen.js';
import { DarkPoolProofScreen } from './screens/DarkPoolProofScreen.js';
import { AccountDetailsScreen } from './screens/AccountDetailsScreen.js';
import { WalletConnectScreen } from './screens/WalletConnectScreen.js';
import { ContactsScreen } from './screens/ContactsScreen.js';
import { ApprovalsScreen } from './screens/ApprovalsScreen.js';
import { LegalScreen } from './screens/LegalScreen.js';
import { TokenDetailScreen } from './screens/TokenDetailScreen.js';
import { StarshipSaikoScreen } from './screens/StarshipSaikoScreen.js';
import { CommandPalette } from './components/CommandPalette.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { WalletConnectProvider } from './walletconnect/WalletConnectContext.js';
import { GlobalWCModals } from './walletconnect/GlobalWCModals.js';
import { UpdateBanner } from './components/UpdateBanner.js';
import { getActiveNetwork, setActiveNetwork as persistNetwork } from './utils/network.js';
import { HDNodeWallet, Mnemonic, getAddress } from 'ethers';
import type { SubWallet } from '@saiko-wallet/wallet-core';
export type { AppContext } from './context.js';
export { AppCtx } from './context.js';
import { AppCtx } from './context.js';
import type { AppContext } from './context.js';

const appStyle: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  color: COLORS.textPrimary,
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
};

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = { duration: 0.2, ease: 'easeOut' as const };

/** Testnet banner shown at top of all screens when on a testnet */
function TestnetBanner(): React.ReactElement | null {
  const { activeNetworkId } = React.useContext(AppCtx);
  const network = getActiveNetwork();
  if (!network.isTestnet) return null;
  return (
    <div style={{
      backgroundColor: `${COLORS.warning}26`,
      borderBottom: `1px solid ${COLORS.warning}4D`,
      padding: '8px 16px',
      textAlign: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '13px',
      fontWeight: 600,
      color: COLORS.warning,
      letterSpacing: '0.5px',
    }}>
      &#9888; TESTNET MODE — {network.name} — Transactions have no real value
    </div>
  );
}

/** Keyboard shortcuts + command palette — must be inside BrowserRouter */
function ShortcutsProvider({
  children,
  isLocked,
  setLocked,
}: {
  children: React.ReactNode;
  isLocked: boolean;
  setLocked: (v: boolean) => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress } = React.useContext(AppCtx);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const handlers = React.useMemo(() => ({
    onCommandPalette: () => { if (!isLocked) setPaletteOpen((v) => !v); },
    onSend: () => { if (!isLocked) void navigate('/send'); },
    onReceive: () => { if (!isLocked) void navigate('/receive'); },
    onWalletConnect: () => { if (!isLocked) void navigate('/walletconnect'); },
    onSettings: () => { if (!isLocked) void navigate('/settings'); },
    onEscape: () => { if (paletteOpen) setPaletteOpen(false); else window.history.back(); },
  }), [isLocked, navigate, paletteOpen]);

  useKeyboardShortcuts(handlers);

  const commands = React.useMemo(() => [
    { id: 'send', label: 'Send ETH / Tokens', shortcut: 'Ctrl+S', action: () => void navigate('/send') },
    { id: 'receive', label: 'Receive', shortcut: 'Ctrl+R', action: () => void navigate('/receive') },
    { id: 'swap', label: 'Swap', action: () => void navigate('/swap') },
    { id: 'darkpool', label: 'DarkPool', action: () => void navigate('/darkpool') },
    { id: 'contacts', label: 'Contacts', action: () => void navigate('/contacts') },
    { id: 'walletconnect', label: 'WalletConnect', shortcut: 'Ctrl+W', action: () => void navigate('/walletconnect') },
    { id: 'approvals', label: 'Token Approvals', action: () => void navigate('/approvals') },
    { id: 'settings', label: 'Settings', shortcut: 'Ctrl+,', action: () => void navigate('/settings') },
    { id: 'lock', label: 'Lock Wallet', action: () => { setLocked(true); void navigate('/unlock'); } },
    { id: 'etherscan', label: 'View on Etherscan', action: () => { const net = getActiveNetwork(); window.open(`${net.explorerUrl}/address/${walletAddress}`, '_blank', 'noopener,noreferrer'); } },
  ], [navigate, setLocked, walletAddress]);

  return (
    <>
      {children}
      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </>
  );
}

/** Animated routes — must live inside BrowserRouter to use useLocation */
function AnimatedRoutes({
  isWalletCreated,
  isLocked,
  setLocked,
}: {
  isWalletCreated: boolean;
  isLocked: boolean;
  setLocked: (v: boolean) => void;
}): React.ReactElement {
  const location = useLocation();

  function DefaultRoute(): React.ReactElement {
    if (!isWalletCreated) return <Navigate to="/onboarding" replace />;
    if (isLocked) return <Navigate to="/unlock" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <ShortcutsProvider isLocked={isLocked} setLocked={setLocked}>
      <TestnetBanner />
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={pageTransition}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
        >
          <Routes location={location}>
            <Route path="/" element={<DefaultRoute />} />
            <Route path="/onboarding" element={<OnboardingScreen />} />
            <Route path="/import" element={<ImportWalletScreen />} />
            <Route path="/unlock" element={<UnlockScreen />} />
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/send" element={<SendScreen />} />
            <Route path="/receive" element={<ReceiveScreen />} />
            <Route path="/swap" element={<SwapScreen />} />
            <Route path="/darkpool" element={<DarkPoolScreen />} />
            <Route path="/darkpool/deposit" element={<DarkPoolDepositScreen />} />
            <Route path="/darkpool/backup" element={<DarkPoolNoteBackupScreen />} />
            <Route path="/darkpool/withdraw" element={<DarkPoolWithdrawScreen />} />
            <Route path="/darkpool/proof" element={<DarkPoolProofScreen />} />
            <Route path="/walletconnect" element={<WalletConnectScreen />} />
            <Route path="/contacts" element={<ContactsScreen />} />
            <Route path="/approvals" element={<ApprovalsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/token/:address" element={<TokenDetailScreen />} />
            <Route path="/legal/:page" element={<LegalScreen />} />
            <Route path="/account/:index" element={<AccountDetailsScreen />} />
            <Route path="/starship" element={<StarshipSaikoScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </ShortcutsProvider>
  );
}

const LS_WALLET_CREATED = 'saiko_wallet_created';
const LS_WALLET_ADDRESS = 'saiko_wallet_address';
const LS_MNEMONIC = 'saiko_mnemonic'; // Legacy plaintext — migration fallback only
const LS_KEYSTORE = 'saiko_keystore'; // Encrypted keystore (Argon2id + XSalsa20-Poly1305)
const LS_LOCKED = 'saiko_locked';
const LS_ACCOUNTS_STATE = 'saiko_accounts_state';

const BASE_PATH = "m/44'/60'/0'/0";
const MAX_ACCOUNTS = 256;
const DEFAULT_ACCOUNT_NAME = 'Account';

function buildPath(index: number): string {
  return `${BASE_PATH}/${index}`;
}

function deriveSubWalletDesktop(mnemonic: string, index: number, name: string): SubWallet {
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

function loadAccountsFromStorage(): AccountsStateData | null {
  try {
    const raw = localStorage.getItem(LS_ACCOUNTS_STATE);
    if (!raw) return null;
    return JSON.parse(raw) as AccountsStateData;
  } catch {
    return null;
  }
}

function saveAccountsToStorage(state: AccountsStateData): void {
  try {
    localStorage.setItem(LS_ACCOUNTS_STATE, JSON.stringify(state));
  } catch {
    // localStorage full — ignore
  }
}

const LS_AUTO_LOCK = 'saiko_auto_lock_minutes';

export function App(): React.ReactElement {
  const { toasts, addToast, dismissToast } = useToasts();

  const [isWalletCreated, setWalletCreatedRaw] = React.useState(
    () => localStorage.getItem(LS_WALLET_CREATED) === 'true'
  );
  const [isLocked, setLockedRaw] = React.useState(
    // Default to locked when wallet exists, but respect an explicit
    // saiko_locked=false (e.g. set by unlock flow or test fixtures).
    () => {
      if (localStorage.getItem(LS_WALLET_CREATED) !== 'true') return false;
      return localStorage.getItem(LS_LOCKED) !== 'false';
    }
  );
  const [walletAddress, setWalletAddressRaw] = React.useState(
    () => localStorage.getItem(LS_WALLET_ADDRESS) ?? ''
  );
  const [activeNetworkId, setActiveNetworkIdRaw] = React.useState(
    () => getActiveNetwork().id
  );

  // Runtime-only decrypted mnemonic — NEVER written to localStorage.
  // Set on unlock, cleared on lock.
  const [sessionMnemonic, setSessionMnemonic] = React.useState<string | null>(null);

  // Accounts state
  const [accounts, setAccountsRaw] = React.useState<SubWallet[]>(() => {
    const saved = loadAccountsFromStorage();
    if (saved?.wallets?.length) return saved.wallets;
    // If encrypted keystore exists, don't try to derive — wait for unlock
    if (localStorage.getItem(LS_KEYSTORE)) {
      // Accounts will be initialized after unlock when sessionMnemonic is available
      const existingAddress = localStorage.getItem(LS_WALLET_ADDRESS);
      if (existingAddress) {
        const synthetic: SubWallet = {
          index: 0,
          name: `${DEFAULT_ACCOUNT_NAME} 1`,
          address: existingAddress,
          derivationPath: `${BASE_PATH}/0`,
          createdAt: Date.now(),
          isDefault: true,
        };
        saveAccountsToStorage({ wallets: [synthetic], activeIndex: 0, nextIndex: 1 });
        return [synthetic];
      }
      return [];
    }
    // H-4: Migration cleanup — if legacy plaintext mnemonic exists alongside keystore, delete it
    if (localStorage.getItem(LS_MNEMONIC) && localStorage.getItem(LS_KEYSTORE)) {
      localStorage.removeItem(LS_MNEMONIC);
    }
    // Fallback: existing session has address but no mnemonic — synthesise a view-only account
    const existingAddress = localStorage.getItem(LS_WALLET_ADDRESS);
    if (existingAddress) {
      const synthetic: SubWallet = {
        index: 0,
        name: `${DEFAULT_ACCOUNT_NAME} 1`,
        address: existingAddress,
        derivationPath: `${BASE_PATH}/0`,
        createdAt: Date.now(),
        isDefault: true,
      };
      saveAccountsToStorage({ wallets: [synthetic], activeIndex: 0, nextIndex: 1 });
      return [synthetic];
    }
    return [];
  });
  const [activeAccountIndex, setActiveAccountIndexRaw] = React.useState(() => {
    const saved = loadAccountsFromStorage();
    return saved?.activeIndex ?? 0;
  });
  const [nextAccountIndex, setNextAccountIndex] = React.useState(() => {
    const saved = loadAccountsFromStorage();
    return saved?.nextIndex ?? 1;
  });

  const persistAccounts = React.useCallback((wallets: SubWallet[], activeIdx: number, nextIdx: number) => {
    saveAccountsToStorage({ wallets, activeIndex: activeIdx, nextIndex: nextIdx });
  }, []);

  const setWalletCreated = React.useCallback((val: boolean) => {
    setWalletCreatedRaw(val);
    localStorage.setItem(LS_WALLET_CREATED, String(val));
    if (val) {
      setLockedRaw(true);
      localStorage.setItem(LS_LOCKED, 'true');
      // Init accounts if needed — use sessionMnemonic (in-memory) or legacy plaintext
      const mnemonic = sessionMnemonic ?? localStorage.getItem(LS_MNEMONIC);
      if (mnemonic && accounts.length === 0) {
        try {
          const acct0 = deriveSubWalletDesktop(mnemonic, 0, `${DEFAULT_ACCOUNT_NAME} 1`);
          setAccountsRaw([acct0]);
          setActiveAccountIndexRaw(0);
          setNextAccountIndex(1);
          persistAccounts([acct0], 0, 1);
        } catch { /* ignore */ }
      }
    } else {
      localStorage.removeItem(LS_WALLET_CREATED);
      localStorage.removeItem(LS_WALLET_ADDRESS);
      localStorage.removeItem(LS_MNEMONIC);
      localStorage.removeItem(LS_KEYSTORE);
      localStorage.removeItem(LS_LOCKED);
      localStorage.removeItem(LS_ACCOUNTS_STATE);
      setSessionMnemonic(null);
      setAccountsRaw([]);
      setActiveAccountIndexRaw(0);
      setNextAccountIndex(1);
    }
  }, [accounts.length, persistAccounts, sessionMnemonic]);

  const setWalletAddress = React.useCallback((addr: string) => {
    setWalletAddressRaw(addr);
    localStorage.setItem(LS_WALLET_ADDRESS, addr);
  }, []);

  const setLocked = React.useCallback((val: boolean) => {
    setLockedRaw(val);
    localStorage.setItem(LS_LOCKED, String(val));
    if (val) {
      setSessionMnemonic(null); // Clear decrypted mnemonic on lock
    }
  }, []);

  const switchAccount = React.useCallback((index: number) => {
    const acct = accounts.find(a => a.index === index);
    if (!acct) return;
    setActiveAccountIndexRaw(index);
    setWalletAddressRaw(acct.address);
    localStorage.setItem(LS_WALLET_ADDRESS, acct.address);
    persistAccounts(accounts, index, nextAccountIndex);
  }, [accounts, nextAccountIndex, persistAccounts]);

  const createAccount = React.useCallback((name?: string) => {
    if (nextAccountIndex >= MAX_ACCOUNTS) return;
    if (!sessionMnemonic) return; // Must be unlocked
    const accountName = name?.trim() || `${DEFAULT_ACCOUNT_NAME} ${nextAccountIndex + 1}`;
    const subWallet = deriveSubWalletDesktop(sessionMnemonic, nextAccountIndex, accountName);
    const newAccounts = [...accounts, subWallet];
    const newNextIndex = nextAccountIndex + 1;
    setAccountsRaw(newAccounts);
    setNextAccountIndex(newNextIndex);
    persistAccounts(newAccounts, activeAccountIndex, newNextIndex);
  }, [accounts, nextAccountIndex, activeAccountIndex, persistAccounts, sessionMnemonic]);

  const renameAccount = React.useCallback((index: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const newAccounts = accounts.map(w =>
      w.index === index ? { ...w, name: trimmed } : w
    );
    setAccountsRaw(newAccounts);
    persistAccounts(newAccounts, activeAccountIndex, nextAccountIndex);
  }, [accounts, activeAccountIndex, nextAccountIndex, persistAccounts]);

  const removeAccount = React.useCallback((index: number) => {
    if (index === 0) return;
    if (!accounts.find(a => a.index === index)) return;
    const wasActive = activeAccountIndex === index;
    const newAccounts = accounts.filter(w => w.index !== index);
    const newActiveIndex = wasActive ? 0 : activeAccountIndex;
    setAccountsRaw(newAccounts);
    setActiveAccountIndexRaw(newActiveIndex);
    if (wasActive && newAccounts[0]) {
      setWalletAddressRaw(newAccounts[0].address);
      localStorage.setItem(LS_WALLET_ADDRESS, newAccounts[0].address);
    }
    persistAccounts(newAccounts, newActiveIndex, nextAccountIndex);
  }, [accounts, activeAccountIndex, nextAccountIndex, persistAccounts]);

  const exportPrivateKey = React.useCallback((index: number): string => {
    if (!sessionMnemonic) return ''; // Must be unlocked
    const path = buildPath(index);
    const hdWallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(sessionMnemonic), path);
    return hdWallet.privateKey;
  }, [sessionMnemonic]);

  const setActiveNetworkId = React.useCallback((id: string) => {
    persistNetwork(id);
    setActiveNetworkIdRaw(id);
  }, []);

  // ── Auto-lock timer ──────────────────────────────────────────────────
  const lastActivityRef = React.useRef(Date.now());

  React.useEffect(() => {
    function resetActivity(): void {
      lastActivityRef.current = Date.now();
    }
    document.addEventListener('mousemove', resetActivity);
    document.addEventListener('keydown', resetActivity);
    document.addEventListener('click', resetActivity);
    return () => {
      document.removeEventListener('mousemove', resetActivity);
      document.removeEventListener('keydown', resetActivity);
      document.removeEventListener('click', resetActivity);
    };
  }, []);

  // C-7: Use a ref to always call the latest setLocked (avoids stale closure)
  const setLockedRef = React.useRef(setLocked);
  React.useEffect(() => { setLockedRef.current = setLocked; }, [setLocked]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      if (isLocked || !isWalletCreated) return;
      const minutes = parseInt(localStorage.getItem(LS_AUTO_LOCK) ?? '5', 10);
      if (minutes === 0) return;
      const timeoutMs = minutes * 60 * 1000;
      if (Date.now() - lastActivityRef.current > timeoutMs) {
        setLockedRef.current(true);
        localStorage.setItem(LS_LOCKED, 'true');
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [isLocked, isWalletCreated]);

  // TODO P-2: Split AppCtx into AuthCtx (stable: lock/unlock/mnemonic functions)
  // and WalletCtx (dynamic: accounts, network, balances) to reduce re-renders.
  // AuthCtx values change rarely, while WalletCtx changes on every balance refresh.
  const ctx: AppContext = {
    addToast,
    isWalletCreated,
    setWalletCreated,
    isLocked,
    setLocked,
    walletAddress,
    setWalletAddress,
    accounts,
    activeAccountIndex,
    switchAccount,
    createAccount,
    renameAccount,
    removeAccount,
    exportPrivateKey,
    activeNetworkId,
    setActiveNetworkId,
    sessionMnemonic,
    setSessionMnemonic,
  };

  return (
    <AppCtx.Provider value={ctx}>
      <WalletConnectProvider>
        <div style={appStyle}>
          <UpdateBanner />
          <BrowserRouter>
            <AnimatedRoutes isWalletCreated={isWalletCreated} isLocked={isLocked} setLocked={setLocked} />
          </BrowserRouter>
          <ToastContainer toasts={toasts} onDismiss={dismissToast} />
          <GlobalWCModals />
        </div>
      </WalletConnectProvider>
    </AppCtx.Provider>
  );
}
