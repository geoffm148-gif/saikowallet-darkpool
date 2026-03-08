/**
 * Chrome storage helpers for the extension popup.
 * Uses chrome.storage.local for persistent data and
 * chrome.storage.session for session-only data.
 */

const KEYSTORE_KEY = 'saiko:keystore';
const STATE_KEY = 'saiko:state';
const ACCOUNTS_KEY = 'saiko:accounts';

interface PopupState {
  walletCreated: boolean;
  locked: boolean;
  address: string;
  networkId: string;
}

const DEFAULT_STATE: PopupState = {
  walletCreated: false,
  locked: true,
  address: '',
  networkId: 'mainnet',
};

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

function storageSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

export async function getState(): Promise<PopupState> {
  const raw = await storageGet<PopupState>(STATE_KEY);
  return raw ?? DEFAULT_STATE;
}

async function mergeState(patch: Partial<PopupState>): Promise<void> {
  const current = await getState();
  await storageSet(STATE_KEY, { ...current, ...patch });
}

export function setLocked(locked: boolean): Promise<void> {
  return mergeState({ locked });
}

export function setWalletCreated(walletCreated: boolean): Promise<void> {
  return mergeState({ walletCreated });
}

export function setWalletAddress(address: string): Promise<void> {
  return mergeState({ address });
}

export function setNetwork(networkId: string): Promise<void> {
  return mergeState({ networkId });
}

export function saveKeystore(json: string): Promise<void> {
  return storageSet(KEYSTORE_KEY, json);
}

export async function loadKeystore(): Promise<string | null> {
  const raw = await storageGet<string>(KEYSTORE_KEY);
  return raw ?? null;
}

export async function saveAccountsState(data: unknown): Promise<void> {
  await storageSet(ACCOUNTS_KEY, data);
}

export async function loadAccountsState(): Promise<unknown> {
  return storageGet(ACCOUNTS_KEY);
}

/**
 * Keep-alive port to prevent service worker from sleeping while popup is open.
 */
export function connectPopupPort(): void {
  try {
    chrome.runtime.connect({ name: 'popup' });
  } catch {
    // Extension context may not be available in dev
  }
}
