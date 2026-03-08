/**
 * Saiko Wallet — EIP-1193 Provider (injected into page context as window.ethereum).
 */
export {};

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

const INPAGE_PREFIX = 'saiko-inpage';
const CONTENT_PREFIX = 'saiko-content';

type Listener = (...args: unknown[]) => void;

let requestId = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

// Listen for responses from content script
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as { type?: string; id?: string; event?: string; result?: unknown; error?: { code?: number; message: string }; data?: unknown } | undefined;
  if (!data || data.type !== CONTENT_PREFIX) return;

  // Event broadcast (chainChanged, accountsChanged, etc.)
  if (data.event) {
    const listeners = eventListeners.get(data.event);
    if (listeners) listeners.forEach(fn => fn(data.data));
    return;
  }

  // RPC response
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id)!;
    pending.delete(data.id);
    if (data.error) {
      const err = new Error(data.error.message);
      (err as unknown as Record<string, unknown>).code = data.error.code;
      reject(err);
    } else {
      resolve(data.result);
    }
  }
});

const eventListeners = new Map<string, Set<Listener>>();

class SaikoProvider {
  readonly isMetaMask = true;
  readonly isSaiko = true;

  async request({ method, params }: { method: string; params?: unknown[] | undefined }): Promise<unknown> {
    const id = `saiko-${++requestId}`;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.postMessage({ type: INPAGE_PREFIX, id, method, params: params ?? [] }, '*');
      // Timeout after 60s
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('Request timed out'));
        }
      }, 60_000);
    });
  }

  on(event: string, listener: Listener): this {
    if (!eventListeners.has(event)) eventListeners.set(event, new Set());
    eventListeners.get(event)!.add(listener);
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    eventListeners.get(event)?.delete(listener);
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) eventListeners.delete(event);
    else eventListeners.clear();
    return this;
  }

  // Legacy
  enable(): Promise<unknown> {
    return this.request({ method: 'eth_requestAccounts' });
  }

  // Legacy
  send(method: string, params?: unknown[]): Promise<unknown> {
    return this.request({ method, params });
  }

  // Legacy
  sendAsync(
    payload: { method: string; params?: unknown[] },
    callback: (err: Error | null, result?: unknown) => void,
  ): void {
    this.request(payload)
      .then(result => callback(null, { jsonrpc: '2.0', id: 1, result }))
      .catch(err => callback(err as Error));
  }
}

// Install as window.ethereum
const provider = new SaikoProvider();

if (typeof window.ethereum === 'undefined') {
  Object.defineProperty(window, 'ethereum', {
    value: provider,
    writable: false,
    configurable: false,
  });
} else {
  // If another wallet already set window.ethereum, announce via EIP-6963
  try {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: { info: { uuid: 'saiko-wallet', name: 'Saiko Wallet', icon: '' }, provider },
    }));
  } catch {
    // Best effort
  }
}

// EIP-6963: respond to discovery requests
window.addEventListener('eip6963:requestProvider', () => {
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: { info: { uuid: 'saiko-wallet', name: 'Saiko Wallet', icon: '' }, provider },
  }));
});
