/**
 * Electron bridge utilities.
 * All functions degrade gracefully in browser mode (window.electronAPI is undefined).
 */

export function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}

/**
 * Wrap a keystore JSON string with OS keyring encryption (safeStorage) in Electron.
 * Falls back to the original string in browser mode — Argon2id layer still protects it.
 *
 * WHY two layers: safeStorage binds the blob to the current OS user account, so even
 * if someone copies the localStorage data to another machine, they cannot decrypt it
 * without OS credentials. The Argon2id layer protects against OS account compromise.
 */
export async function safeEncrypt(plaintext: string): Promise<string> {
  if (isElectron() && window.electronAPI) {
    try {
      const available = await window.electronAPI.safeStorage.isAvailable();
      if (available) {
        return await window.electronAPI.safeStorage.encrypt(plaintext);
      }
    } catch {
      // safeStorage unavailable — degrade gracefully
    }
  }
  return plaintext;
}

/**
 * Unwrap a safeStorage-encrypted blob. Detects format:
 * - Starts with '{' → plain JSON keystore (browser mode or legacy migration)
 * - Otherwise → base64 safeStorage blob, decrypt via IPC
 *
 * Throws 'SAFESTORAGE_UNAVAILABLE' if the blob is encrypted but can't be
 * decrypted (e.g. wrong OS user, different machine, Electron upgrade).
 * Callers should distinguish this from a wrong-passphrase error.
 */
export async function safeDecrypt(stored: string): Promise<string> {
  // Plain JSON — no safeStorage wrapper (browser mode or pre-safeStorage version)
  if (stored.startsWith('{')) return stored;

  if (isElectron() && window.electronAPI) {
    try {
      const available = await window.electronAPI.safeStorage.isAvailable();
      if (available) {
        return await window.electronAPI.safeStorage.decrypt(stored);
      }
    } catch {
      // safeStorage decrypt threw — encrypted with different user/machine context
    }
  }

  // Could not decrypt safeStorage blob — signal to caller
  throw new Error('SAFESTORAGE_UNAVAILABLE');
}

/**
 * Apply or remove the SOCKS5 Tor proxy via Electron's session proxy API.
 * Real routing — all renderer network requests go through Tor when enabled.
 * No-op in browser mode (Tor toggle still persists the setting for later).
 */
export async function applyTorProxy(enable: boolean): Promise<void> {
  if (!isElectron() || !window.electronAPI) return;
  try {
    if (enable) {
      await window.electronAPI.tor.enable();
    } else {
      await window.electronAPI.tor.disable();
    }
  } catch {
    // Tor daemon not running — proxy call fails silently
  }
}

export async function getElectronVersion(): Promise<string | null> {
  if (!isElectron() || !window.electronAPI) return null;
  try {
    return await window.electronAPI.app.getVersion();
  } catch {
    return null;
  }
}
