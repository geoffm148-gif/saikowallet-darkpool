/**
 * Swap history — persisted to localStorage per wallet address.
 * Survives app restarts; captures every swap made through this app.
 */

export interface SwapHistoryItem {
  id: string;            // tx hash
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  timestamp: number;     // Unix ms
  status: 'confirmed' | 'pending' | 'failed';
}

function storageKey(address: string): string {
  return `saiko:swapHistory:${address.toLowerCase()}`;
}

export function loadSwapHistory(address: string): SwapHistoryItem[] {
  if (!address) return [];
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SwapHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSwapHistory(address: string, items: SwapHistoryItem[]): void {
  if (!address) return;
  try {
    // Cap at 500 entries to avoid unbounded growth
    const capped = items.slice(0, 500);
    localStorage.setItem(storageKey(address), JSON.stringify(capped));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function prependSwap(address: string, item: SwapHistoryItem): SwapHistoryItem[] {
  const existing = loadSwapHistory(address);
  // Deduplicate by id (tx hash)
  const deduped = existing.filter((e) => e.id !== item.id);
  const updated = [item, ...deduped];
  saveSwapHistory(address, updated);
  return updated;
}

/** Human-readable relative time label */
export function formatSwapDate(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(timestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
