/**
 * Saiko Wallet — Content Script.
 *
 * Injected into web pages at document_start. Responsibilities:
 * 1. Inject the inpage provider script (window.ethereum)
 * 2. Bridge messages between the page and the background service worker
 */
export {};

// Inject the inpage provider script into the page context
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inpage.js');
script.type = 'module';
(document.head || document.documentElement).appendChild(script);
script.addEventListener('load', () => script.remove());

// ─── Message Bridge: Page ↔ Background ─────────────────────────────────────

const INPAGE_PREFIX = 'saiko-inpage';
const CONTENT_PREFIX = 'saiko-content';

// SEC-3: Only forward whitelisted methods to prevent probing with debug_*/admin_* etc.
const ALLOWED_METHODS = new Set([
  'eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'net_version',
  'eth_getBalance', 'eth_getTransactionCount', 'eth_sendRawTransaction', 'eth_call',
  'eth_estimateGas', 'eth_getBlockByNumber', 'eth_getTransactionReceipt',
  'eth_blockNumber', 'eth_gasPrice', 'eth_feeHistory', 'eth_getCode',
  'eth_getLogs', 'eth_getBlockByHash', 'eth_getTransactionByHash',
  'wallet_switchEthereumChain', 'wallet_addEthereumChain',
  'personal_sign', 'eth_signTypedData_v4', 'eth_sendTransaction',
]);

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as { type?: string; id?: string; method?: string; params?: unknown[] } | undefined;
  if (!data || data.type !== INPAGE_PREFIX) return;

  // Reject methods not in whitelist
  if (!data.method || !ALLOWED_METHODS.has(data.method)) {
    window.postMessage({
      type: CONTENT_PREFIX,
      id: data.id,
      error: { code: 4200, message: 'Method not supported' },
    }, '*');
    return;
  }

  // Forward to background
  const disconnectedError = {
    type: CONTENT_PREFIX,
    id: data.id,
    error: { code: 4900, message: 'Wallet extension disconnected — please refresh the page.' },
  };
  try {
    chrome.runtime.sendMessage(
      { action: 'provider:request', method: data.method, params: data.params },
      (response: unknown) => {
        if (chrome.runtime.lastError) {
          window.postMessage(disconnectedError, '*');
          return;
        }
        window.postMessage({
          type: CONTENT_PREFIX,
          id: data.id,
          ...(response as Record<string, unknown>),
        }, '*');
      },
    );
  } catch {
    window.postMessage(disconnectedError, '*');
  }
});

// Listen for events from background (e.g., chainChanged, accountsChanged)
chrome.runtime.onMessage.addListener((message: { type?: string; event?: string; data?: unknown }) => {
  if (message.type === 'saiko-sw-event') {
    window.postMessage({
      type: CONTENT_PREFIX,
      event: message.event,
      data: message.data,
    }, window.location.origin);
  }
});
