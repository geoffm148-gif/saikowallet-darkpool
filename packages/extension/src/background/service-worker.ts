/**
 * Saiko Wallet — Background Service Worker (Manifest V3).
 *
 * Handles wallet operations, RPC proxy, and state management.
 * Uses Web Crypto API for AES-GCM encryption with PBKDF2 key derivation.
 */

// Keep-alive: hold open ports from popup
const ports = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
});

// ─── Encryption Helpers (AES-GCM + PBKDF2) ──────────────────────────────────

const ENC_ALGO = 'AES-GCM';
const KDF_ITERATIONS = 100_000;
const SALT_BYTES = 32;
const IV_BYTES = 12;

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ENC_ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

interface EncryptedBlob {
  salt: string;
  iv: string;
  ciphertext: string;
  version: 1;
}

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function encryptData(plaintext: string, passphrase: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ENC_ALGO, iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as BufferSource,
  );
  return { salt: toHex(salt), iv: toHex(iv), ciphertext: toHex(new Uint8Array(ciphertext)), version: 1 };
}

async function decryptData(blob: EncryptedBlob, passphrase: string): Promise<string> {
  const salt = fromHex(blob.salt);
  const iv = fromHex(blob.iv);
  const ciphertext = fromHex(blob.ciphertext);
  const key = await deriveAesKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt({ name: ENC_ALGO, iv: iv as BufferSource }, key, ciphertext as BufferSource);
  return new TextDecoder().decode(plaintext);
}

// ─── Storage Keys ────────────────────────────────────────────────────────────

const KEYS = {
  KEYSTORE: 'saiko:keystore',
  STATE: 'saiko:state',
} as const;

// ─── Message Handler ─────────────────────────────────────────────────────────

interface MessagePayload {
  action: string;
  [key: string]: unknown;
}

chrome.runtime.onMessage.addListener(
  (message: MessagePayload, _sender, sendResponse: (response: unknown) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ error: err.message }));
    return true; // async response
  },
);

async function handleMessage(msg: MessagePayload): Promise<unknown> {
  switch (msg.action) {
    case 'wallet:create': {
      const { encryptedKeystore } = msg as { encryptedKeystore: string; action: string };
      await chrome.storage.local.set({ [KEYS.KEYSTORE]: encryptedKeystore });
      return { ok: true };
    }

    // Encrypt mnemonic + store state. Address derived by popup (ethers in popup bundle, not SW).
    case 'wallet:setup': {
      const { mnemonic, passphrase, address } = msg as { mnemonic: string; passphrase: string; address: string; action: string };
      if (!mnemonic || !passphrase) throw new Error('Missing mnemonic or passphrase');
      const blob = await encryptData(mnemonic, passphrase);
      await chrome.storage.local.set({ [KEYS.KEYSTORE]: JSON.stringify(blob) });
      const existing = await chrome.storage.local.get(KEYS.STATE);
      const state = (existing[KEYS.STATE] as Record<string, unknown>) ?? {};
      await chrome.storage.local.set({ [KEYS.STATE]: { ...state, walletCreated: true, address: address ?? '', locked: false } });
      await chrome.storage.session.set({ mnemonic });
      return { ok: true, address: address ?? '' };
    }

    case 'wallet:hasWallet': {
      const result = await chrome.storage.local.get(KEYS.KEYSTORE);
      return { hasWallet: !!result[KEYS.KEYSTORE] };
    }

    case 'wallet:unlock': {
      const { passphrase } = msg as { passphrase: string; action: string };
      const result = await chrome.storage.local.get(KEYS.KEYSTORE);
      const keystoreJson = result[KEYS.KEYSTORE] as string | undefined;
      if (!keystoreJson) throw new Error('No wallet found');

      // Try decrypting. If the keystore is our EncryptedBlob format, use our decrypt.
      // Otherwise, it might be wallet-core's EncryptedKeystore format.
      let mnemonic: string | null = null;

      try {
        const blob = JSON.parse(keystoreJson) as EncryptedBlob;
        if (blob.version === 1) {
          mnemonic = await decryptData(blob, passphrase);
        }
      } catch {
        // Fall through to try wallet-core format
      }

      if (!mnemonic) {
        // wallet-core EncryptedKeystore format (libsodium — dynamic import)
        const { decryptPayload } = await import('@saiko-wallet/wallet-core');
        const keystore = JSON.parse(keystoreJson);
        const plaintextBytes = await decryptPayload(keystore, passphrase);
        mnemonic = new TextDecoder().decode(plaintextBytes);
      }

      await chrome.storage.session.set({ mnemonic });

      // Read address from persisted state (set during wallet:setup — no ethers needed in SW)
      const stateResult = await chrome.storage.local.get(KEYS.STATE);
      const stateObj = (stateResult[KEYS.STATE] as Record<string, unknown>) ?? {};
      const address = (stateObj.address as string) ?? '';
      await chrome.storage.local.set({ [KEYS.STATE]: { ...stateObj, locked: false } });

      return { ok: true, mnemonic, address };
    }

    case 'wallet:lock': {
      await chrome.storage.session.remove('mnemonic');
      return { ok: true };
    }

    case 'wallet:isUnlocked': {
      const session = await chrome.storage.session.get('mnemonic');
      return { unlocked: !!session.mnemonic };
    }

    case 'wallet:getMnemonic': {
      const session = await chrome.storage.session.get('mnemonic');
      return { mnemonic: session.mnemonic ?? null };
    }

    case 'wallet:getAddress': {
      const state = await chrome.storage.local.get(KEYS.STATE);
      const s = state[KEYS.STATE] as Record<string, unknown> | undefined;
      return { address: s?.address ?? '' };
    }

    case 'rpc:call': {
      const { method, params, rpcUrl } = msg as {
        method: string; params: unknown[]; rpcUrl: string; action: string;
      };
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const json = await resp.json() as { result?: unknown; error?: { message: string } };
      if (json.error) throw new Error(json.error.message);
      return { result: json.result };
    }

    case 'provider:request': {
      // EIP-1193 provider request forwarding
      const { method, params: providerParams } = msg as {
        method: string; params?: unknown[]; action: string;
      };
      return handleProviderRequest(method, providerParams);
    }

    case 'darkpool:getNotes': {
      const { address } = msg as { address: string; action: string };
      const key = `${address.toLowerCase()}:saiko-darkpool-notes-v1`;
      const result = await chrome.storage.local.get(key);
      return { notes: result[key] ?? [] };
    }

    case 'darkpool:saveNote': {
      const { address, note } = msg as { address: string; note: unknown; action: string };
      const key = `${address.toLowerCase()}:saiko-darkpool-notes-v1`;
      const result = await chrome.storage.local.get(key);
      const notes = (result[key] as unknown[] | undefined) ?? [];
      notes.push(note);
      await chrome.storage.local.set({ [key]: notes });
      return { ok: true };
    }

    default:
      throw new Error(`Unknown action: ${msg.action}`);
  }
}

// ─── EIP-1193 Provider Request Handler ───────────────────────────────────────

async function handleProviderRequest(method: string, params?: unknown[]): Promise<unknown> {
  switch (method) {
    case 'eth_accounts':
    case 'eth_requestAccounts': {
      const state = await chrome.storage.local.get(KEYS.STATE);
      const s = state[KEYS.STATE] as Record<string, unknown> | undefined;
      const address = s?.address as string | undefined;
      return { result: address ? [address] : [] };
    }

    case 'eth_chainId': {
      const state = await chrome.storage.local.get(KEYS.STATE);
      const s = state[KEYS.STATE] as Record<string, unknown> | undefined;
      const networkId = (s?.networkId as string) ?? 'mainnet';
      const chainId = networkId === 'sepolia' ? 11155111 : 1;
      return { result: `0x${chainId.toString(16)}` };
    }

    case 'net_version': {
      const state = await chrome.storage.local.get(KEYS.STATE);
      const s = state[KEYS.STATE] as Record<string, unknown> | undefined;
      const networkId = (s?.networkId as string) ?? 'mainnet';
      const chainId = networkId === 'sepolia' ? 11155111 : 1;
      return { result: chainId.toString() };
    }

    case 'wallet_switchEthereumChain': {
      // Acknowledge but don't switch (extension handles this via settings)
      return { result: null };
    }

    case 'personal_sign':
    case 'eth_signTypedData_v4':
    case 'eth_sendTransaction': {
      // These require user approval — return error for now
      return { error: { code: 4100, message: 'Unauthorized — approve in Saiko Wallet popup' } };
    }

    default: {
      // Forward to RPC
      const state = await chrome.storage.local.get(KEYS.STATE);
      const s = state[KEYS.STATE] as Record<string, unknown> | undefined;
      const networkId = (s?.networkId as string) ?? 'mainnet';
      const rpcUrl = networkId === 'sepolia'
        ? 'https://ethereum-sepolia-rpc.publicnode.com'
        : 'https://ethereum.publicnode.com';

      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }),
      });
      const json = await resp.json() as { result?: unknown; error?: { code: number; message: string } };
      if (json.error) return { error: json.error };
      return { result: json.result };
    }
  }
}
