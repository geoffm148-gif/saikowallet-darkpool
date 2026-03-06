/**
 * Clipboard integrity guard.
 *
 * WHY: Clipboard hijacking malware watches for Ethereum addresses copied
 * to the clipboard and silently replaces them with attacker-controlled
 * addresses. A user copies their friend's address, thinks they're pasting
 * it, but the malware has already swapped it.
 *
 * Mitigation: Before the user clicks "Send", we compare what the app
 * originally copied (or what the user pasted) against what's currently
 * in the clipboard. If they differ, we warn the user immediately.
 *
 * Limitation: wallet-core is platform-agnostic — it cannot read the
 * clipboard directly. The platform layer (React Native / Tauri) reads
 * the clipboard and passes both values here for comparison.
 */

import { getAddress, isAddress } from 'ethers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClipboardCheckResult {
  readonly isIntact: boolean;
  readonly originalAddress: string;
  readonly currentAddress: string;
  readonly warning: string | null;
  /** True when both strings are valid Ethereum addresses (even if different) */
  readonly bothAreAddresses: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compare the address that was originally copied to what is currently in
 * the clipboard.
 *
 * @param original - The address the app copied (or what was in the input field)
 * @param current  - What is currently in the clipboard (read by platform layer)
 *
 * WHY we normalize before comparing: Clipboard managers may add/remove
 * whitespace or change capitalisation. We normalise to EIP-55 checksum
 * form where possible to detect actual content changes vs. formatting.
 */
export function verifyClipboardIntegrity(
  original: string,
  current: string,
): ClipboardCheckResult {
  const normOriginal = normalizeAddress(original);
  const normCurrent = normalizeAddress(current);

  const bothAreAddresses = isAddress(original) && isAddress(current);

  const isIntact = normOriginal === normCurrent;

  if (isIntact) {
    return {
      isIntact: true,
      originalAddress: normOriginal,
      currentAddress: normCurrent,
      warning: null,
      bothAreAddresses,
    };
  }

  // Strings differ — determine the severity of the warning
  const warning = buildWarning(original, current, normOriginal, normCurrent, bothAreAddresses);

  return {
    isIntact: false,
    originalAddress: normOriginal,
    currentAddress: normCurrent,
    warning,
    bothAreAddresses,
  };
}

/**
 * Quick check — returns true only if the clipboard still contains exactly
 * what was copied (case-insensitive address comparison).
 *
 * WHY a separate boolean helper: Many call sites only need the boolean
 * and don't need the full structured result.
 */
export function isClipboardIntact(original: string, current: string): boolean {
  return normalizeAddress(original) === normalizeAddress(current);
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Normalize a string for comparison.
 * - If it's a valid Ethereum address, convert to EIP-55 checksum form.
 * - Otherwise, trim whitespace and lowercase.
 *
 * WHY EIP-55 normalization: The user may copy "0xABC..." (uppercase),
 * paste it, and the clipboard manager might lowercase it. We don't want
 * to raise a false alarm for cosmetic changes.
 */
function normalizeAddress(value: string): string {
  const trimmed = value.trim();
  if (isAddress(trimmed)) {
    return getAddress(trimmed); // EIP-55 checksum — canonical form
  }
  return (trimmed as string).toLowerCase();
}

function buildWarning(
  original: string,
  current: string,
  normOriginal: string,
  normCurrent: string,
  bothAreAddresses: boolean,
): string {
  if (bothAreAddresses) {
    // Both are valid addresses but they're different — high-confidence attack signal
    return (
      '⚠️ CLIPBOARD HIJACKING DETECTED: The address in your clipboard has been changed. ' +
      `You copied: ${normOriginal}. ` +
      `Clipboard now contains: ${normCurrent}. ` +
      'Do NOT proceed. Clear the clipboard, retype the address manually, and verify character by character.'
    );
  }

  if (isAddress(current) && !isAddress(original)) {
    // Original wasn't an address but now clipboard contains one — suspicious
    return (
      '⚠️ Clipboard content changed to an Ethereum address. ' +
      'If you did not copy this address, your clipboard may have been compromised. ' +
      `Clipboard contains: ${normCurrent}. Verify before sending.`
    );
  }

  // Generic content change warning
  return (
    'Clipboard content has changed since you last copied. ' +
    `Expected: "${normOriginal.slice(0, 20)}${normOriginal.length > 20 ? '...' : ''}". ` +
    `Current: "${normCurrent.slice(0, 20)}${normCurrent.length > 20 ? '...' : ''}". ` +
    'Re-copy the address and try again.'
  );
}
