import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as SecureStore from 'expo-secure-store';

const BACKGROUND_FETCH_TASK = 'saiko-tx-check';
const LAST_CHECKED_KEY = 'saiko_notif_last_block';
const NOTIF_ENABLED_KEY = 'saiko_notif_enabled';
const WALLET_ADDRESS_KEY = 'saiko_address';

const SAIKO_CONTRACT = '0x4c89364F18Ecc562165820989549022e64eC2eD2';
const RPC_URL = 'https://cloudflare-eth.com';

const isWeb = Platform.OS === 'web';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function getStoredItem(key: string): Promise<string | null> {
  if (isWeb) return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  return SecureStore.getItemAsync(key);
}

async function setStoredItem(key: string, value: string): Promise<void> {
  if (isWeb) { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isWeb) return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function sendLocalNotification(title: string, body: string, data?: Record<string, string>): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null,
  });
}

export async function isNotificationsEnabled(): Promise<boolean> {
  const val = await getStoredItem(NOTIF_ENABLED_KEY);
  return val === 'true';
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await setStoredItem(NOTIF_ENABLED_KEY, String(enabled));
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  return json.result;
}

interface EtherscanTx {
  from: string;
  to: string;
  value: string;
  tokenName?: string;
  tokenSymbol?: string;
}

async function fetchNewTxs(address: string, fromBlock: string): Promise<{ ethTxs: EtherscanTx[]; tokenTxs: EtherscanTx[] }> {
  const ethUrl = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=${fromBlock}&sort=desc&page=1&offset=5`;
  const tokenUrl = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${SAIKO_CONTRACT}&address=${address}&startblock=${fromBlock}&sort=desc&page=1&offset=5`;

  const [ethRes, tokenRes] = await Promise.allSettled([
    fetch(ethUrl).then(r => r.json()),
    fetch(tokenUrl).then(r => r.json()),
  ]);

  const ethTxs: EtherscanTx[] = ethRes.status === 'fulfilled' && ethRes.value.status === '1' && Array.isArray(ethRes.value.result)
    ? ethRes.value.result : [];
  const tokenTxs: EtherscanTx[] = tokenRes.status === 'fulfilled' && tokenRes.value.status === '1' && Array.isArray(tokenRes.value.result)
    ? tokenRes.value.result : [];

  return { ethTxs, tokenTxs };
}

function formatEthAmount(weiStr: string): string {
  const wei = BigInt(weiStr);
  const eth = Number(wei) / 1e18;
  return eth.toFixed(4);
}

async function checkForNewTransactions(): Promise<boolean> {
  const address = await getStoredItem(WALLET_ADDRESS_KEY);
  if (!address) return false;

  const enabled = await isNotificationsEnabled();
  if (!enabled) return false;

  const currentBlockHex = await rpcCall('eth_blockNumber', []) as string;
  const currentBlock = parseInt(currentBlockHex, 16);
  const lastChecked = await getStoredItem(LAST_CHECKED_KEY);
  const lastBlock = lastChecked ? parseInt(lastChecked, 10) : currentBlock - 100;

  if (currentBlock <= lastBlock) return false;

  const fromBlock = String(lastBlock + 1);
  const { ethTxs, tokenTxs } = await fetchNewTxs(address, fromBlock);
  const addrLower = address.toLowerCase();

  let hasNew = false;

  for (const tx of ethTxs) {
    if (tx.to.toLowerCase() === addrLower && BigInt(tx.value) > 0n) {
      await sendLocalNotification(
        'Received ETH',
        `From ${tx.from.slice(0, 6)}...${tx.from.slice(-4)} — ${formatEthAmount(tx.value)} ETH`,
        { type: 'tx_received' },
      );
      hasNew = true;
    }
  }

  for (const tx of tokenTxs) {
    if (tx.to.toLowerCase() === addrLower && BigInt(tx.value) > 0n) {
      await sendLocalNotification(
        'Received SAIKO',
        `From ${tx.from.slice(0, 6)}...${tx.from.slice(-4)} — ${formatEthAmount(tx.value)} SAIKO`,
        { type: 'tx_received' },
      );
      hasNew = true;
    }
  }

  await setStoredItem(LAST_CHECKED_KEY, String(currentBlock));
  return hasNew;
}

// Register background task definition at module level
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const hasNew = await checkForNewTransactions();
    return hasNew
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTxCheck(_address: string): Promise<void> {
  if (isWeb) return;
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Background fetch not supported on this device
  }
}

export async function unregisterBackgroundTxCheck(): Promise<void> {
  if (isWeb) return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    }
  } catch {
    // ignore
  }
}
