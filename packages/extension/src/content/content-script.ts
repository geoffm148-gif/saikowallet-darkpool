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

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as { type?: string; id?: string; method?: string; params?: unknown[] } | undefined;
  if (!data || data.type !== INPAGE_PREFIX) return;

  // Forward to background
  chrome.runtime.sendMessage(
    { action: 'provider:request', method: data.method, params: data.params },
    (response: unknown) => {
      // Send response back to page
      window.postMessage({
        type: CONTENT_PREFIX,
        id: data.id,
        ...(response as Record<string, unknown>),
      }, '*');
    },
  );
});

// Listen for events from background (e.g., chainChanged, accountsChanged)
chrome.runtime.onMessage.addListener((message: { type?: string; event?: string; data?: unknown }) => {
  if (message.type === 'saiko-event') {
    window.postMessage({
      type: CONTENT_PREFIX,
      event: message.event,
      data: message.data,
    }, '*');
  }
});
