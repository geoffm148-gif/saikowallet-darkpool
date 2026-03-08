import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { HDNodeWallet, Mnemonic, getAddress, Wallet } from 'ethers';
import { loadWallet, clearWallet, storeAccountsState, loadAccountsState } from './storage';
import { getEthBalance, getSaikoBalance, formatBalance } from './rpc';
import { fetchPrices, type PriceData } from './price';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubWalletData {
  index: number;
  name: string;
  address: string;
  derivationPath: string;
  createdAt: number;
  isDefault: boolean;
}

interface AccountsStateData {
  wallets: SubWalletData[];
  activeIndex: number;
  nextIndex: number;
}

interface WalletState {
  isLoaded: boolean;
  hasWallet: boolean;
  address: string;
  mnemonic: string;
  ethBalance: string;
  saikoBalance: string;
  isBalanceLoading: boolean;
  priceData: PriceData | null;
  accounts: SubWalletData[];
  activeAccountIndex: number;
  reload: () => Promise<void>;
  lock: () => void;
  wipe: () => Promise<void>;
  createAccount: (name?: string) => SubWalletData;
  switchAccount: (index: number) => void;
  renameAccount: (index: number, name: string) => void;
  removeAccount: (index: number) => void;
  getAllAccounts: () => SubWalletData[];
  exportPrivateKey: (index: number) => string;
}

// ─── Derivation helpers ───────────────────────────────────────────────────────

const BASE_PATH = "m/44'/60'/0'/0";
const MAX_ACCOUNTS = 256;
const DEFAULT_ACCOUNT_NAME = 'Account';

function buildPath(index: number): string {
  return `${BASE_PATH}/${index}`;
}

function deriveSubWallet(mnemonic: string, index: number, name: string): SubWalletData {
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

// ─── Context ──────────────────────────────────────────────────────────────────

const WalletCtx = createContext<WalletState>({
  isLoaded: false,
  hasWallet: false,
  address: '',
  mnemonic: '',
  ethBalance: '\u2014',
  saikoBalance: '\u2014',
  isBalanceLoading: false,
  priceData: null,
  accounts: [],
  activeAccountIndex: 0,
  reload: async () => {},
  lock: () => {},
  wipe: async () => {},
  createAccount: () => ({ index: 0, name: '', address: '', derivationPath: '', createdAt: 0, isDefault: false }),
  switchAccount: () => {},
  renameAccount: () => {},
  removeAccount: () => {},
  getAllAccounts: () => [],
  exportPrivateKey: () => '',
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [walletExists, setWalletExists] = useState(false);
  const [mnemonic, setMnemonic] = useState('');
  const [ethBalance, setEthBalance] = useState('\u2014');
  const [saikoBalance, setSaikoBalance] = useState('\u2014');
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [accounts, setAccounts] = useState<SubWalletData[]>([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);

  const activeAccount = accounts.find(a => a.index === activeAccountIndex) ?? accounts[0];
  const address = activeAccount?.address ?? '';

  const persistAccounts = useCallback((wallets: SubWalletData[], activeIdx: number, nextIdx: number) => {
    const state: AccountsStateData = { wallets, activeIndex: activeIdx, nextIndex: nextIdx };
    void storeAccountsState(state);
  }, []);

  const fetchBalances = useCallback(async (addr: string) => {
    if (!addr) return;
    setIsBalanceLoading(true);
    try {
      const [eth, saiko] = await Promise.allSettled([
        getEthBalance(addr),
        getSaikoBalance(addr),
      ]);
      if (eth.status === 'fulfilled') setEthBalance(formatBalance(eth.value, 18, 4));
      if (saiko.status === 'fulfilled') setSaikoBalance(formatBalance(saiko.value, 18, 0));
    } catch {
      /* ignore */
    } finally {
      setIsBalanceLoading(false);
    }
  }, []);

  const loadPrices = useCallback(async () => {
    try {
      const prices = await fetchPrices();
      setPriceData(prices);
    } catch {
      // keep previous
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const stored = await loadWallet();
      if (stored) {
        setWalletExists(true);
        setMnemonic(stored.mnemonic);

        // Load accounts state or init with account 0
        const savedState = await loadAccountsState() as AccountsStateData | null;
        if (savedState && savedState.wallets?.length > 0) {
          setAccounts(savedState.wallets);
          setActiveAccountIndex(savedState.activeIndex);
          setNextIndex(savedState.nextIndex);
          const active = savedState.wallets.find(a => a.index === savedState.activeIndex) ?? savedState.wallets[0];
          await fetchBalances(active.address);
        } else {
          const account0 = deriveSubWallet(stored.mnemonic, 0, `${DEFAULT_ACCOUNT_NAME} 1`);
          setAccounts([account0]);
          setActiveAccountIndex(0);
          setNextIndex(1);
          void storeAccountsState({ wallets: [account0], activeIndex: 0, nextIndex: 1 });
          await fetchBalances(account0.address);
        }
      }
      await loadPrices();
    } catch {
      // Storage unavailable (e.g. web preview) — treat as no wallet
    } finally {
      setIsLoaded(true);
    }
  }, [fetchBalances, loadPrices]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const lock = useCallback(() => {
    setMnemonic('');
  }, []);

  const wipe = useCallback(async () => {
    await clearWallet();
    setWalletExists(false);
    setMnemonic('');
    setAccounts([]);
    setActiveAccountIndex(0);
    setNextIndex(1);
    setEthBalance('\u2014');
    setSaikoBalance('\u2014');
  }, []);

  const createAccount = useCallback((name?: string): SubWalletData => {
    if (nextIndex >= MAX_ACCOUNTS) {
      throw new Error(`Maximum account limit of ${MAX_ACCOUNTS} reached`);
    }
    const accountName = name?.trim() || `${DEFAULT_ACCOUNT_NAME} ${nextIndex + 1}`;
    const subWallet = deriveSubWallet(mnemonic, nextIndex, accountName);
    const newAccounts = [...accounts, subWallet];
    const newNextIndex = nextIndex + 1;
    setAccounts(newAccounts);
    setNextIndex(newNextIndex);
    persistAccounts(newAccounts, activeAccountIndex, newNextIndex);
    return subWallet;
  }, [mnemonic, accounts, nextIndex, activeAccountIndex, persistAccounts]);

  const switchAccount = useCallback((index: number) => {
    const acct = accounts.find(a => a.index === index);
    if (!acct) throw new Error(`No account at index ${index}`);
    setActiveAccountIndex(index);
    persistAccounts(accounts, index, nextIndex);
    void fetchBalances(acct.address);
  }, [accounts, nextIndex, persistAccounts, fetchBalances]);

  const renameAccount = useCallback((index: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Account name cannot be empty');
    const newAccounts = accounts.map(w =>
      w.index === index ? { ...w, name: trimmed } : w
    );
    setAccounts(newAccounts);
    persistAccounts(newAccounts, activeAccountIndex, nextIndex);
  }, [accounts, activeAccountIndex, nextIndex, persistAccounts]);

  const removeAccount = useCallback((index: number) => {
    if (index === 0) throw new Error('Cannot remove the default account');
    if (!accounts.find(a => a.index === index)) throw new Error(`No account at index ${index}`);
    const wasActive = activeAccountIndex === index;
    const newAccounts = accounts.filter(w => w.index !== index);
    const newActiveIndex = wasActive ? 0 : activeAccountIndex;
    setAccounts(newAccounts);
    setActiveAccountIndex(newActiveIndex);
    persistAccounts(newAccounts, newActiveIndex, nextIndex);
    if (wasActive) {
      const fallback = newAccounts[0];
      if (fallback) void fetchBalances(fallback.address);
    }
  }, [accounts, activeAccountIndex, nextIndex, persistAccounts, fetchBalances]);

  const getAllAccounts = useCallback((): SubWalletData[] => {
    return [...accounts];
  }, [accounts]);

  const exportPrivateKeyFn = useCallback((index: number): string => {
    if (!accounts.find(a => a.index === index)) throw new Error(`No account at index ${index}`);
    const path = buildPath(index);
    const hdWallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), path);
    return hdWallet.privateKey;
  }, [accounts, mnemonic]);

  return (
    <WalletCtx.Provider
      value={{
        isLoaded,
        hasWallet: walletExists,
        address,
        mnemonic,
        ethBalance,
        saikoBalance,
        isBalanceLoading,
        priceData,
        accounts,
        activeAccountIndex,
        reload,
        lock,
        wipe,
        createAccount,
        switchAccount,
        renameAccount,
        removeAccount,
        getAllAccounts,
        exportPrivateKey: exportPrivateKeyFn,
      }}
    >
      {children}
    </WalletCtx.Provider>
  );
}

export const useWallet = () => useContext(WalletCtx);
