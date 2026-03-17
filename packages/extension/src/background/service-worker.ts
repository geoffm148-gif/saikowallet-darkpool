/**
 * Saiko Wallet — Background Service Worker (Manifest V3).
 *
 * Handles wallet operations, RPC proxy, and state management.
 * Uses Web Crypto API for AES-GCM encryption with PBKDF2 key derivation.
 */

// Keep-alive: hold open ports from popup
const ports = new Set<chrome.runtime.Port>();

// Pending dApp requests awaiting user approval
const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

function generateRequestId(): string {
  return crypto.randomUUID();
}

async function createApprovalWindow(
  requestId: string,
  type: 'connect' | 'sign' | 'sendTx',
  origin: string,
  params: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timed out'));
    }, 120_000); // 2 minute timeout

    pendingRequests.set(requestId, { resolve, reject, timer });

    const queryStr = new URLSearchParams({
      requestId,
      type,
      origin,
      params: JSON.stringify(params),
    }).toString();

    chrome.windows.create({
      url: chrome.runtime.getURL(`popup.html?${queryStr}`),
      type: 'popup',
      width: 400,
      height: 620,
      focused: true,
    });
  });
}

// ─── Connected Sites Helpers ────────────────────────────────────────────────

const CONNECTED_SITES_KEY = 'saiko:connectedSites';

interface ConnectedSite {
  address: string;
  connectedAt: number;
  origin: string;
}

async function isOriginConnected(origin: string): Promise<boolean> {
  const result = await chrome.storage.local.get(CONNECTED_SITES_KEY);
  const sites = (result[CONNECTED_SITES_KEY] as Record<string, ConnectedSite>) ?? {};
  return origin in sites;
}

async function addConnectedSite(origin: string, address: string): Promise<void> {
  const result = await chrome.storage.local.get(CONNECTED_SITES_KEY);
  const sites = (result[CONNECTED_SITES_KEY] as Record<string, ConnectedSite>) ?? {};
  sites[origin] = { address, connectedAt: Date.now(), origin };
  await chrome.storage.local.set({ [CONNECTED_SITES_KEY]: sites });
}

async function removeConnectedSite(origin: string): Promise<void> {
  const result = await chrome.storage.local.get(CONNECTED_SITES_KEY);
  const sites = (result[CONNECTED_SITES_KEY] as Record<string, ConnectedSite>) ?? {};
  delete sites[origin];
  await chrome.storage.local.set({ [CONNECTED_SITES_KEY]: sites });
}

async function getConnectedSites(): Promise<Record<string, ConnectedSite>> {
  const result = await chrome.storage.local.get(CONNECTED_SITES_KEY);
  return (result[CONNECTED_SITES_KEY] as Record<string, ConnectedSite>) ?? {};
}

// ─── Broadcast Helpers ──────────────────────────────────────────────────────

async function broadcastToOrigin(origin: string | null, message: unknown): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id == null) continue;
    try {
      if (origin === null || (tab.url && new URL(tab.url).origin === origin)) {
        await chrome.tabs.sendMessage(tab.id, message);
      }
    } catch { /* tab may not have content script */ }
  }
}

async function broadcastToAllContentScripts(message: unknown): Promise<void> {
  return broadcastToOrigin(null, message);
}

// ─── Origin / Hex Helpers ───────────────────────────────────────────────────

function getOrigin(sender: chrome.runtime.MessageSender): string {
  try {
    if (sender.url) return new URL(sender.url).origin;
    if (sender.tab?.url) return new URL(sender.tab.url).origin;
  } catch {}
  return 'unknown';
}

function tryHexDecode(hex: string): string {
  try {
    if (hex.startsWith('0x')) {
      const bytes = new Uint8Array(hex.slice(2).match(/.{2}/g)!.map(b => parseInt(b, 16)));
      return new TextDecoder().decode(bytes);
    }
  } catch {}
  return hex;
}

chrome.runtime.onConnect.addListener((port) => {
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
});

// ─── Service Worker Startup — ensure locked state is consistent ──────────────
// On SW restart (browser start, extension reload), session storage is wiped.
// Force locked:true in persistent state so the popup always shows the unlock
// screen rather than an unlocked UI with no session mnemonic.
async function resetLockedState(): Promise<void> {
  try {
    const STATE_KEY = 'saiko:state';
    const result = await chrome.storage.local.get(STATE_KEY);
    const state = (result[STATE_KEY] as Record<string, unknown>) ?? {};
    await chrome.storage.local.set({ [STATE_KEY]: { ...state, locked: true } });
  } catch { /* non-critical */ }
}

chrome.runtime.onInstalled.addListener(() => { void resetLockedState(); });
chrome.runtime.onStartup.addListener(() => { void resetLockedState(); });

// ─── Auto-lock via chrome.alarms ─────────────────────────────────────────────

const AUTO_LOCK_ALARM = 'saiko-auto-lock';
const DEFAULT_AUTO_LOCK_MINUTES = 5;

async function resetAutoLockAlarm(): Promise<void> {
  const result = await chrome.storage.local.get('saiko:autoLockMinutes');
  const minutes = (result['saiko:autoLockMinutes'] as number) ?? DEFAULT_AUTO_LOCK_MINUTES;
  if (minutes <= 0) {
    await chrome.alarms.clear(AUTO_LOCK_ALARM);
    return;
  }
  await chrome.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: minutes });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) {
    const session = await chrome.storage.session.get('mnemonic');
    if (session.mnemonic) {
      await chrome.storage.session.remove('mnemonic');
      const stateResult = await chrome.storage.local.get(KEYS.STATE);
      const stateObj = (stateResult[KEYS.STATE] as Record<string, unknown>) ?? {};
      await chrome.storage.local.set({ [KEYS.STATE]: { ...stateObj, locked: true } });
    }
  }
});

// ─── Encryption Helpers (AES-GCM + PBKDF2) ──────────────────────────────────

const ENC_ALGO = 'AES-GCM';
const KDF_ITERATIONS = 600_000; // OWASP 2023 minimum for SHA-256 PBKDF2
const KDF_ITERATIONS_LEGACY = 100_000; // Pre-v0.1.9 iteration count for migration
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

/** Decrypt with legacy 100k iterations (for migration from pre-v0.1.9). */
async function decryptDataLegacy(blob: EncryptedBlob, passphrase: string): Promise<string> {
  const salt = fromHex(blob.salt);
  const iv = fromHex(blob.iv);
  const ciphertext = fromHex(blob.ciphertext);
  const key = await deriveAesKeyWithIterations(passphrase, salt, KDF_ITERATIONS_LEGACY);
  const plaintext = await crypto.subtle.decrypt({ name: ENC_ALGO, iv: iv as BufferSource }, key, ciphertext as BufferSource);
  return new TextDecoder().decode(plaintext);
}

async function deriveAesKeyWithIterations(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: ENC_ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt data using the session passphrase (for notes encryption). */
async function encryptWithSessionKey(plaintext: string): Promise<string | null> {
  const session = await chrome.storage.session.get('sessionPassphrase');
  const passphrase = session.sessionPassphrase as string | undefined;
  if (!passphrase) return null;
  const blob = await encryptData(plaintext, passphrase);
  return JSON.stringify(blob);
}

/** Decrypt data using the session passphrase (for notes decryption). */
async function decryptWithSessionKey(encrypted: string): Promise<string | null> {
  const session = await chrome.storage.session.get('sessionPassphrase');
  const passphrase = session.sessionPassphrase as string | undefined;
  if (!passphrase) return null;
  try {
    const blob = JSON.parse(encrypted) as EncryptedBlob;
    return await decryptData(blob, passphrase);
  } catch {
    return null;
  }
}

// ─── Offscreen Document (ZK Proof Generation) ───────────────────────────────

async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await (chrome.runtime as any).getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (existingContexts.length > 0) return;
  await (chrome.offscreen as any).createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'ZK proof generation requires WASM execution',
  });
}

async function generateZKProof(input: Record<string, unknown>): Promise<{ proof: unknown; publicSignals: string[] }> {
  await ensureOffscreenDocument();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'zk:generateProof', input }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.success) {
        resolve({ proof: response.proof, publicSignals: response.publicSignals });
      } else {
        reject(new Error(response?.error ?? 'ZK proof generation failed'));
      }
    });
  });
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
  (message: MessagePayload, sender, sendResponse: (response: unknown) => void) => {
    // SEC-6: Origin validation — wallet:* actions only from extension pages, provider:request only from tabs.
    // Extension pages opened as tabs still have sender.tab set, so we check sender.url origin
    // rather than sender.tab alone. Web content scripts cannot have a chrome-extension:// sender URL.
    const isFromTab = !!sender.tab;
    const senderIsExtensionPage = !!sender.url?.startsWith('chrome-extension://');
    const action = message?.action ?? '';

    if (action.startsWith('wallet:') && isFromTab && !senderIsExtensionPage) {
      sendResponse({ error: 'Unauthorized: wallet actions not allowed from web pages' });
      return true;
    }
    if (action === 'provider:request' && !isFromTab) {
      sendResponse({ error: 'Unauthorized: provider requests must come from content scripts' });
      return true;
    }

    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ error: err.message }));
    return true; // async response
  },
);

async function handleMessage(msg: MessagePayload, sender: chrome.runtime.MessageSender): Promise<unknown> {
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
      await chrome.storage.session.set({ mnemonic, sessionPassphrase: passphrase });
      void resetAutoLockAlarm();
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
      if (!keystoreJson) return { error: 'NO_WALLET' };

      // Parse keystore JSON — if corrupted, return typed error
      let blob: EncryptedBlob;
      try {
        blob = JSON.parse(keystoreJson) as EncryptedBlob;
      } catch {
        return { error: 'CORRUPTED_KEYSTORE' };
      }

      let mnemonic: string | null = null;
      let needsMigration = false;

      if (blob.version === 1) {
        // Try current iteration count (600k) first
        try {
          mnemonic = await decryptData(blob, passphrase);
        } catch {
          // Try legacy iteration count (100k) for migration
          try {
            mnemonic = await decryptDataLegacy(blob, passphrase);
            needsMigration = true;
          } catch {
            return { error: 'WRONG_PASSPHRASE' };
          }
        }
      }

      if (!mnemonic) {
        // wallet-core EncryptedKeystore format (libsodium — dynamic import)
        try {
          const { decryptPayload } = await import('@saiko-wallet/wallet-core');
          const keystore = JSON.parse(keystoreJson);
          const plaintextBytes = await decryptPayload(keystore, passphrase);
          mnemonic = new TextDecoder().decode(plaintextBytes);
          needsMigration = true; // Re-encrypt to our format
        } catch {
          return { error: 'WRONG_PASSPHRASE' };
        }
      }

      // Migrate to 600k iterations if needed
      if (needsMigration && mnemonic) {
        try {
          const newBlob = await encryptData(mnemonic, passphrase);
          await chrome.storage.local.set({ [KEYS.KEYSTORE]: JSON.stringify(newBlob) });
        } catch { /* non-critical — will migrate on next unlock */ }
      }

      await chrome.storage.session.set({ mnemonic, sessionPassphrase: passphrase });

      // Read address from persisted state (set during wallet:setup — no ethers needed in SW)
      const stateResult = await chrome.storage.local.get(KEYS.STATE);
      const stateObj = (stateResult[KEYS.STATE] as Record<string, unknown>) ?? {};
      const address = (stateObj.address as string) ?? '';
      await chrome.storage.local.set({ [KEYS.STATE]: { ...stateObj, locked: false } });

      // Reset auto-lock timer on successful unlock
      void resetAutoLockAlarm();

      // Broadcast accountsChanged to connected sites
      if (address) {
        void broadcastToAllContentScripts({ type: 'saiko-sw-event', event: 'accountsChanged', data: [address] });
      }

      return { ok: true, mnemonic, address };
    }

    case 'wallet:lock': {
      await chrome.storage.session.remove(['mnemonic', 'sessionPassphrase']);
      await chrome.alarms.clear(AUTO_LOCK_ALARM);
      // Broadcast accountsChanged [] on lock
      void broadcastToAllContentScripts({ type: 'saiko-sw-event', event: 'accountsChanged', data: [] });
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
      return handleProviderRequest(method, providerParams, sender);
    }

    case 'darkpool:getNotes': {
      const { address } = msg as { address: string; action: string };
      const key = `${address.toLowerCase()}:saiko-darkpool-notes-v2`;
      const result = await chrome.storage.local.get(key);
      const encrypted = result[key] as string | undefined;
      if (!encrypted) {
        // Try reading legacy unencrypted notes and migrate
        const legacyKey = `${address.toLowerCase()}:saiko-darkpool-notes-v1`;
        const legacyResult = await chrome.storage.local.get(legacyKey);
        const legacyNotes = legacyResult[legacyKey] as unknown[] | undefined;
        if (legacyNotes?.length) {
          // Migrate: encrypt and save under v2 key, remove legacy
          const enc = await encryptWithSessionKey(JSON.stringify(legacyNotes));
          if (enc) {
            await chrome.storage.local.set({ [key]: enc });
            await chrome.storage.local.remove(legacyKey);
          }
          return { notes: legacyNotes };
        }
        return { notes: [] };
      }
      const decrypted = await decryptWithSessionKey(encrypted);
      if (!decrypted) return { notes: [], error: 'LOCKED' };
      try {
        return { notes: JSON.parse(decrypted) };
      } catch {
        return { notes: [] };
      }
    }

    case 'darkpool:saveNote': {
      const { address, note } = msg as { address: string; note: unknown; action: string };
      const key = `${address.toLowerCase()}:saiko-darkpool-notes-v2`;
      // Decrypt existing notes
      const result = await chrome.storage.local.get(key);
      let notes: unknown[] = [];
      const encrypted = result[key] as string | undefined;
      if (encrypted) {
        const decrypted = await decryptWithSessionKey(encrypted);
        if (decrypted) {
          try { notes = JSON.parse(decrypted) as unknown[]; } catch { /* fresh array */ }
        }
      }
      // Dedup by commitment — update existing note if present, otherwise append
      const noteObj = note as Record<string, unknown>;
      const commitment = noteObj['commitment'] as string | undefined;
      if (commitment) {
        const idx = (notes as Array<Record<string, unknown>>).findIndex(
          n => (n['commitment'] as string)?.toLowerCase() === commitment.toLowerCase()
        );
        if (idx >= 0) {
          notes[idx] = note;
        } else {
          notes.push(note);
        }
      } else {
        notes.push(note);
      }
      const enc = await encryptWithSessionKey(JSON.stringify(notes));
      if (!enc) throw new Error('Wallet is locked — cannot encrypt notes');
      await chrome.storage.local.set({ [key]: enc });
      return { ok: true };
    }

    case 'wallet:setAutoLock': {
      const { minutes } = msg as { minutes: number; action: string };
      await chrome.storage.local.set({ 'saiko:autoLockMinutes': minutes });
      void resetAutoLockAlarm();
      return { ok: true };
    }

    case 'wallet:getAutoLock': {
      const alResult = await chrome.storage.local.get('saiko:autoLockMinutes');
      return { minutes: (alResult['saiko:autoLockMinutes'] as number) ?? DEFAULT_AUTO_LOCK_MINUTES };
    }

    case 'darkpool:markNoteSpent': {
      const { address: markAddr, commitment } = msg as { address: string; commitment: string; action: string };
      const key = `${markAddr.toLowerCase()}:saiko-darkpool-notes-v2`;
      const markResult = await chrome.storage.local.get(key);
      const markEncrypted = markResult[key] as string | undefined;
      if (!markEncrypted) return { ok: true };
      const markDecrypted = await decryptWithSessionKey(markEncrypted);
      if (!markDecrypted) return { ok: true, error: 'LOCKED' };
      let markNotes: Array<Record<string, unknown>>;
      try { markNotes = JSON.parse(markDecrypted) as Array<Record<string, unknown>>; } catch { return { ok: true }; }
      const updatedNotes = markNotes.map(n =>
        (n['commitment'] as string)?.toLowerCase() === commitment.toLowerCase()
          ? { ...n, isSpent: true }
          : n
      );
      const markEnc = await encryptWithSessionKey(JSON.stringify(updatedNotes));
      if (!markEnc) return { ok: true, error: 'LOCKED' };
      await chrome.storage.local.set({ [key]: markEnc });
      return { ok: true };
    }

    case 'darkpool:generateProof': {
      const { input } = msg as { input: Record<string, unknown>; action: string };
      const result = await generateZKProof(input);
      return result;
    }

    case 'wallet:changePassphrase': {
      const { currentPassphrase, newPassphrase } = msg as {
        currentPassphrase: string; newPassphrase: string; action: string;
      };
      // Verify current passphrase by decrypting keystore
      const ksResult = await chrome.storage.local.get(KEYS.KEYSTORE);
      const ksJson = ksResult[KEYS.KEYSTORE] as string | undefined;
      if (!ksJson) throw new Error('No wallet found');
      let ksBlob: EncryptedBlob;
      try { ksBlob = JSON.parse(ksJson) as EncryptedBlob; } catch { throw new Error('Corrupted keystore'); }
      let mnemonic: string;
      try { mnemonic = await decryptData(ksBlob, currentPassphrase); } catch {
        try { mnemonic = await decryptDataLegacy(ksBlob, currentPassphrase); } catch {
          throw new Error('WRONG_PASSPHRASE');
        }
      }
      // Re-encrypt with new passphrase
      const newBlob = await encryptData(mnemonic, newPassphrase);
      await chrome.storage.local.set({ [KEYS.KEYSTORE]: JSON.stringify(newBlob) });
      await chrome.storage.session.set({ sessionPassphrase: newPassphrase });
      return { ok: true };
    }

    case 'wallet:approveRequest': {
      const { requestId, result } = msg as { requestId: string; result: unknown; action: string };
      const pending = pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(requestId);
        pending.resolve(result);
      }
      return { ok: true };
    }

    case 'wallet:rejectRequest': {
      const { requestId } = msg as { requestId: string; action: string };
      const pending = pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(requestId);
        pending.reject({ code: 4001, message: 'User rejected the request.' });
      }
      return { ok: true };
    }

    case 'wallet:getConnectedSites': {
      return { sites: await getConnectedSites() };
    }

    case 'wallet:disconnectSite': {
      const { origin } = msg as { origin: string; action: string };
      await removeConnectedSite(origin);
      // Emit accountsChanged [] to that origin's tabs
      void broadcastToOrigin(origin, { type: 'saiko-sw-event', event: 'accountsChanged', data: [] });
      return { ok: true };
    }

    case 'wallet:setNetwork': {
      const { networkId } = msg as { networkId: string; action: string };
      const stateR = await chrome.storage.local.get(KEYS.STATE);
      const stateObj = (stateR[KEYS.STATE] as Record<string, unknown>) ?? {};
      await chrome.storage.local.set({ [KEYS.STATE]: { ...stateObj, networkId } });
      const chainId = networkId === 'sepolia' ? '0xaa36a7' : '0x1';
      void broadcastToAllContentScripts({ type: 'saiko-sw-event', event: 'chainChanged', data: chainId });
      return { ok: true };
    }

    default:
      throw new Error(`Unknown action: ${msg.action}`);
  }
}

// ─── EIP-1193 Provider Request Handler ───────────────────────────────────────

async function handleProviderRequest(
  method: string,
  params: unknown[] | undefined,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (method) {
    case 'eth_accounts': {
      // Only return address if this origin has an active connection AND wallet is unlocked
      const session = await chrome.storage.session.get('mnemonic');
      if (!session.mnemonic) return { result: [] };
      const origin = getOrigin(sender);
      const connected = await isOriginConnected(origin);
      if (!connected) return { result: [] };
      const state = await chrome.storage.local.get(KEYS.STATE);
      const s = state[KEYS.STATE] as Record<string, unknown> | undefined;
      const address = s?.address as string | undefined;
      return { result: address ? [address] : [] };
    }

    case 'eth_requestAccounts': {
      const session = await chrome.storage.session.get('mnemonic');
      if (!session.mnemonic) return { result: [], error: { code: 4100, message: 'Wallet is locked' } };
      const origin = getOrigin(sender);
      // Already connected?
      if (await isOriginConnected(origin)) {
        const state = await chrome.storage.local.get(KEYS.STATE);
        const s = state[KEYS.STATE] as Record<string, unknown> | undefined;
        const address = s?.address as string | undefined;
        return { result: address ? [address] : [] };
      }
      // Request approval
      const requestId = generateRequestId();
      try {
        await createApprovalWindow(requestId, 'connect', origin, null);
        // Save connection
        const state = await chrome.storage.local.get(KEYS.STATE);
        const s = state[KEYS.STATE] as Record<string, unknown> | undefined;
        const address = s?.address as string | undefined;
        await addConnectedSite(origin, address ?? '');
        return { result: address ? [address] : [] };
      } catch (err) {
        const e = err as Record<string, unknown>;
        return { error: { code: e?.code ?? 4001, message: (err instanceof Error ? err.message : null) ?? 'User rejected' } };
      }
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
      const chainParams = params?.[0] as { chainId: string } | undefined;
      const requestedChain = chainParams?.chainId;
      if (requestedChain === '0x1' || requestedChain === '0xaa36a7') {
        const networkId = requestedChain === '0xaa36a7' ? 'sepolia' : 'mainnet';
        const stateR = await chrome.storage.local.get(KEYS.STATE);
        const stateObj = (stateR[KEYS.STATE] as Record<string, unknown>) ?? {};
        await chrome.storage.local.set({ [KEYS.STATE]: { ...stateObj, networkId } });
        void broadcastToAllContentScripts({ type: 'saiko-sw-event', event: 'chainChanged', data: requestedChain });
        return { result: null };
      }
      return { error: { code: 4902, message: 'Chain not supported' } };
    }

    case 'eth_sign': {
      return { error: { code: 4200, message: 'eth_sign is not supported. Use personal_sign.' } };
    }

    case 'personal_sign':
    case 'eth_signTypedData_v4': {
      const session = await chrome.storage.session.get('mnemonic');
      if (!session.mnemonic) return { error: { code: 4100, message: 'Wallet is locked' } };
      const origin = getOrigin(sender);
      const requestId = generateRequestId();
      try {
        const result = await createApprovalWindow(requestId, 'sign', origin, {
          method,
          params,
          displayMessage: method === 'personal_sign' && params?.[0]
            ? tryHexDecode(params[0] as string)
            : '(structured data)',
        });
        return { result };
      } catch (err) {
        const e = err as Record<string, unknown>;
        return { error: { code: e?.code ?? 4001, message: (err instanceof Error ? err.message : null) ?? 'User rejected' } };
      }
    }

    case 'eth_sendTransaction': {
      const session = await chrome.storage.session.get('mnemonic');
      if (!session.mnemonic) return { error: { code: 4100, message: 'Wallet is locked' } };
      const origin = getOrigin(sender);
      const txParams = params?.[0] as Record<string, unknown> | undefined;
      const requestId = generateRequestId();
      try {
        const txHash = await createApprovalWindow(requestId, 'sendTx', origin, txParams);
        return { result: txHash };
      } catch (err) {
        const e = err as Record<string, unknown>;
        return { error: { code: e?.code ?? 4001, message: (err instanceof Error ? err.message : null) ?? 'User rejected' } };
      }
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
