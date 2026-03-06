/**
 * Auto-lock manager — purge decrypted key material after inactivity.
 *
 * WHY auto-lock: If a user leaves their phone unlocked on a table, anyone
 * who picks it up can access the wallet. Auto-lock ensures the wallet re-locks
 * after a configurable idle period, requiring re-authentication.
 *
 * Design: Purely functional — no timers, no side effects, no DOM access.
 * State is a plain object. The UI layer polls `isLocked()` or schedules its
 * own timer based on `nextLockAt`. wallet-core is deliberately platform-agnostic.
 *
 * WHY pure functions not a class with timers: Timers are side effects that
 * complicate testing and don't belong in the business logic layer. The UI
 * can schedule a setInterval that calls isLocked() every second — that's
 * a UI concern, not a wallet-core concern.
 */

import { WalletLockedError } from '../errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoLockState {
  /** Last user activity timestamp (Unix ms). */
  readonly lastActivityAt: number;
  /** Inactivity timeout in milliseconds. */
  readonly timeoutMs: number;
  /** Whether the wallet has been explicitly locked (overrides timer). */
  readonly isManuallyLocked: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum auto-lock timeout (30 seconds). Shorter is security theatre. */
const MIN_LOCK_TIMEOUT_MS = 30_000;

/** Maximum auto-lock timeout (4 hours). Longer creates unreasonable exposure. */
const MAX_LOCK_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** Default lock timeout: 5 minutes. Balances security and convenience. */
export const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new auto-lock state with the given timeout.
 * Treats creation as user activity (wallet just unlocked — reset the timer).
 *
 * @param timeoutMs - Inactivity period before wallet locks (ms)
 */
export function createAutoLockManager(timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS): AutoLockState {
  validateTimeout(timeoutMs);

  return {
    lastActivityAt: Date.now(),
    timeoutMs,
    isManuallyLocked: false,
  };
}

/**
 * Record user activity and reset the inactivity timer.
 * Call this on any meaningful user interaction (button press, screen tap, etc.).
 *
 * WHY pure function returning new state: The UI holds the state object.
 * Mutating it in place would be an implicit side effect. Returning a new
 * object makes state transitions explicit and traceable.
 *
 * @param manager - Current auto-lock state
 * @param now     - Current time in Unix ms (injectable for testing)
 */
export function recordActivity(
  manager: AutoLockState,
  now: number = Date.now(),
): AutoLockState {
  if (manager.isManuallyLocked) {
    // Activity doesn't unlock a manually locked wallet — authentication is required
    return manager;
  }

  return {
    ...manager,
    lastActivityAt: now,
  };
}

/**
 * Check if the wallet should currently be locked.
 * Returns true if either:
 *   - The wallet was manually locked, or
 *   - The inactivity timeout has elapsed since last activity
 *
 * @param manager - Current auto-lock state
 * @param now     - Current time in Unix ms (injectable for testing)
 */
export function isLocked(manager: AutoLockState, now: number = Date.now()): boolean {
  if (manager.isManuallyLocked) return true;

  const idleMs = now - manager.lastActivityAt;
  return idleMs >= manager.timeoutMs;
}

/**
 * Calculate when the wallet will next auto-lock (Unix ms timestamp).
 * Useful for the UI to schedule a lock-check timer.
 *
 * WHY provide this: Rather than the UI polling every second, it can set
 * a single timer for the exact moment the lock triggers, reducing battery usage.
 */
export function getNextLockAt(manager: AutoLockState): number {
  if (manager.isManuallyLocked) return 0; // Already locked
  return manager.lastActivityAt + manager.timeoutMs;
}

/**
 * Update the inactivity timeout.
 *
 * WHY we validate range: A timeout of 0ms would permanently lock the wallet.
 * A timeout of 1 week would negate the security benefit entirely.
 */
export function setLockTimeout(manager: AutoLockState, newTimeoutMs: number): AutoLockState {
  validateTimeout(newTimeoutMs);
  return {
    ...manager,
    timeoutMs: newTimeoutMs,
  };
}

/**
 * Immediately lock the wallet, regardless of activity timer.
 * Call this when the user taps "Lock wallet" or the app goes to background.
 */
export function lockNow(manager: AutoLockState): AutoLockState {
  return {
    ...manager,
    isManuallyLocked: true,
  };
}

/**
 * Unlock the wallet (after successful authentication).
 * Resets the activity timer to prevent immediate re-lock.
 *
 * WHY this is separate from recordActivity: Unlocking is an authentication
 * event. Activity recording is a usage event. They have different semantics.
 *
 * @param manager - Currently locked state
 * @param now     - Current time in Unix ms (injectable for testing)
 */
export function unlockWallet(manager: AutoLockState, now: number = Date.now()): AutoLockState {
  return {
    ...manager,
    isManuallyLocked: false,
    lastActivityAt: now,
  };
}

/**
 * Assert the wallet is unlocked. Throws WalletLockedError if locked.
 * Use at the start of any function that requires an unlocked wallet.
 *
 * WHY a guard function: Centralizes the lock check so individual operations
 * don't need to duplicate the isLocked() call.
 */
export function assertUnlocked(manager: AutoLockState, now: number = Date.now()): void {
  if (isLocked(manager, now)) {
    throw new WalletLockedError();
  }
}

// ─── Internal Validators ──────────────────────────────────────────────────────

function validateTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs)) {
    throw new Error(`Lock timeout must be a finite integer, got ${timeoutMs}`);
  }
  if (timeoutMs < MIN_LOCK_TIMEOUT_MS) {
    throw new Error(
      `Lock timeout must be at least ${MIN_LOCK_TIMEOUT_MS}ms (${MIN_LOCK_TIMEOUT_MS / 1000}s), got ${timeoutMs}ms`,
    );
  }
  if (timeoutMs > MAX_LOCK_TIMEOUT_MS) {
    throw new Error(
      `Lock timeout must not exceed ${MAX_LOCK_TIMEOUT_MS}ms (${MAX_LOCK_TIMEOUT_MS / 3600000}h), got ${timeoutMs}ms`,
    );
  }
}
