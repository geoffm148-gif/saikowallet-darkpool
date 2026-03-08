import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// On web, expo-secure-store is unavailable — fall back to localStorage
// NOTE: localStorage is NOT encrypted. For production, native builds use SecureStore.
const isWeb = Platform.OS === 'web';

async function getItem(key: string): Promise<string | null> {
  if (isWeb) return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}

const KEYS = {
  MNEMONIC: 'saiko_mnemonic',
  ADDRESS: 'saiko_address',
  HAS_WALLET: 'saiko_has_wallet',
  ACCOUNTS_STATE: 'saiko_accounts_state',
};

export async function storeWallet(mnemonic: string, address: string): Promise<void> {
  await setItem(KEYS.MNEMONIC, mnemonic);
  await setItem(KEYS.ADDRESS, address);
  await setItem(KEYS.HAS_WALLET, 'true');
}

export async function loadWallet(): Promise<{ mnemonic: string; address: string } | null> {
  const hasWalletFlag = await getItem(KEYS.HAS_WALLET);
  if (hasWalletFlag !== 'true') return null;
  const mnemonic = await getItem(KEYS.MNEMONIC);
  const address = await getItem(KEYS.ADDRESS);
  if (!mnemonic || !address) return null;
  return { mnemonic, address };
}

export async function clearWallet(): Promise<void> {
  await deleteItem(KEYS.MNEMONIC);
  await deleteItem(KEYS.ADDRESS);
  await deleteItem(KEYS.HAS_WALLET);
}

export async function hasWallet(): Promise<boolean> {
  return (await getItem(KEYS.HAS_WALLET)) === 'true';
}

export async function storeAccountsState(state: object): Promise<void> {
  await setItem(KEYS.ACCOUNTS_STATE, JSON.stringify(state));
}

export async function loadAccountsState(): Promise<object | null> {
  const raw = await getItem(KEYS.ACCOUNTS_STATE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as object;
  } catch {
    return null;
  }
}
