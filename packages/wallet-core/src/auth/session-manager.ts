/**
 * Session manager — track authentication state and enforce re-auth for sensitive ops.
 *
 * WHY session management: After the user unlocks the wallet, they have an
 * authenticated session. Most operations use this session. But high-value
 * operations (large sends, seed export, security settings changes) should
 * require re-authentication to prevent unauthorized use of an unattended
 * unlocked device.
 *
 * Design: Purely functional — sessions are immutable value objects.
 * The auth method records HOW the user authenticated (passphrase/PIN/biometric).
 * Higher-value operations require stronger auth methods.
 *
 * WHY separate from auto-lock: Auto-lock is about inactivity timeout.
 * Session re-auth is about requiring fresh credentials for specific actions,
 * regardless of how recently the wallet was last used. A user who unlocked
 * via PIN 30 seconds ago may still need to re-enter their passphrase to
 * export their seed phrase.
 */

import { SessionError, ReauthRequiredError } from '../errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** How the user authenticated for this session. */
export type AuthMethod = 'passphrase' | 'pin' | 'biometric';

/**
 * High-value operations that may require re-authentication.
 * WHY an enum not free-form strings: Typos in operation names are caught
 * at compile time, not silently bypassed at runtime.
 */
export type HighValueOperation =
  | 'export-seed'
  | 'export-private-key'
  | 'change-passphrase'
  | 'change-pin'
  | 'disable-biometric'
  | 'change-security-settings'
  | 'large-send' // Amount exceeds HIGH_VALUE_SEND_THRESHOLD_ETH
  | 'unlimited-approval'
  | 'add-custom-rpc';

export interface Session {
  /** Unique session identifier (random, not tied to keys). */
  readonly id: string;
  /** How the user authenticated. */
  readonly authMethod: AuthMethod;
  /** Unix ms timestamp when the session was created. */
  readonly createdAt: number;
  /** Unix ms timestamp of last activity (updated via refreshSession). */
  readonly lastActivityAt: number;
  /** Session duration — sessions expire after this period. */
  readonly sessionDurationMs: number;
  /**
   * High-value operations completed this session that don't need re-auth.
   * WHY: Once the user re-auths for "export-seed" during a session, we don't
   * require them to re-auth again 5 seconds later for the same op.
   */
  readonly elevatedOps: ReadonlySet<HighValueOperation>;
}

export interface ReauthRequirement {
  readonly required: boolean;
  readonly reason: string | null;
  readonly minimumAuthMethod: AuthMethod | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default session duration: 30 minutes. */
const DEFAULT_SESSION_DURATION_MS = 30 * 60 * 1000;

/** Auth method strength order (higher = stronger). */
const AUTH_METHOD_STRENGTH: Record<AuthMethod, number> = {
  biometric: 1,
  pin: 2,
  passphrase: 3,
} as const;

/**
 * Which operations require which minimum auth method for re-auth.
 * WHY: Biometric is convenient but can be fooled by face spoofing or
 * coerced via physical force. Seed export always requires passphrase.
 * Large sends accept PIN or passphrase (biometric is insufficient).
 */
const OPERATION_AUTH_REQUIREMENTS: Record<HighValueOperation, AuthMethod> = {
  'export-seed': 'passphrase',
  'export-private-key': 'passphrase',
  'change-passphrase': 'passphrase',
  'change-pin': 'pin',
  'disable-biometric': 'pin',
  'change-security-settings': 'pin',
  'large-send': 'pin',
  'unlimited-approval': 'pin',
  'add-custom-rpc': 'pin',
} as const;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new authenticated session.
 *
 * @param authMethod         - How the user authenticated
 * @param sessionDurationMs  - How long the session is valid (default 30 min)
 * @param now                - Current time in Unix ms (injectable for testing)
 */
export function createSession(
  authMethod: AuthMethod,
  sessionDurationMs: number = DEFAULT_SESSION_DURATION_MS,
  now: number = Date.now(),
): Session {
  if (sessionDurationMs <= 0) {
    throw new SessionError('Session duration must be positive');
  }

  return {
    id: generateSessionId(),
    authMethod,
    createdAt: now,
    lastActivityAt: now,
    sessionDurationMs,
    elevatedOps: new Set(),
  };
}

/**
 * Check if a session is still valid (not expired).
 *
 * A session expires when: now - lastActivityAt > sessionDurationMs.
 * WHY lastActivityAt not createdAt: We use a sliding window — activity
 * extends the session. A user who actively uses the wallet shouldn't
 * need to re-authenticate every 30 minutes.
 *
 * @param session - The session to check
 * @param now     - Current time in Unix ms (injectable for testing)
 */
export function isSessionValid(session: Session, now: number = Date.now()): boolean {
  const idleMs = now - session.lastActivityAt;
  return idleMs < session.sessionDurationMs;
}

/**
 * Record activity on a session, extending its validity window.
 * Returns a new session with updated lastActivityAt.
 */
export function refreshSession(session: Session, now: number = Date.now()): Session {
  if (!isSessionValid(session, now)) {
    throw new SessionError(
      'Cannot refresh an expired session. Please re-authenticate.',
    );
  }

  return {
    ...session,
    lastActivityAt: now,
  };
}

/**
 * Determine whether re-authentication is required for a given operation.
 *
 * Logic:
 *   1. Session must be valid (not expired)
 *   2. Operation must meet the required auth method strength
 *   3. If the operation was already elevated this session, allow it
 *
 * @param session   - Current session
 * @param operation - The high-value operation being attempted
 * @param now       - Current time in Unix ms (injectable for testing)
 */
export function requireReauth(
  session: Session,
  operation: HighValueOperation,
  now: number = Date.now(),
): ReauthRequirement {
  // Session validity check
  if (!isSessionValid(session, now)) {
    return {
      required: true,
      reason: 'Session expired. Please authenticate again.',
      minimumAuthMethod: OPERATION_AUTH_REQUIREMENTS[operation],
    };
  }

  // If already elevated for this operation this session, skip re-auth
  if (session.elevatedOps.has(operation)) {
    return { required: false, reason: null, minimumAuthMethod: null };
  }

  const requiredMethod = OPERATION_AUTH_REQUIREMENTS[operation];
  const currentStrength = AUTH_METHOD_STRENGTH[session.authMethod];
  const requiredStrength = AUTH_METHOD_STRENGTH[requiredMethod];

  if (currentStrength < requiredStrength) {
    return {
      required: true,
      reason: `This operation requires ${requiredMethod} authentication, ` +
        `but you authenticated via ${session.authMethod}.`,
      minimumAuthMethod: requiredMethod,
    };
  }

  return { required: false, reason: null, minimumAuthMethod: null };
}

/**
 * Mark an operation as completed with elevated authentication.
 * After this, requireReauth() will not require re-auth for this op
 * during the current session.
 *
 * WHY: The UI calls this after the user successfully re-auths for a
 * high-value operation. Prevents asking for re-auth multiple times
 * in a row for the same thing (e.g., user exports seed twice in 10 seconds).
 */
export function elevateSession(
  session: Session,
  operation: HighValueOperation,
): Session {
  const newElevatedOps = new Set(session.elevatedOps);
  newElevatedOps.add(operation);

  return {
    ...session,
    elevatedOps: newElevatedOps,
  };
}

/**
 * Assert that a session is valid and the operation doesn't require re-auth.
 * Throws ReauthRequiredError if re-auth is needed.
 *
 * WHY a throwing guard: Allows operations to be gated with a one-liner:
 *   assertSessionAllows(session, 'export-seed');
 * rather than duplicating the check-and-throw pattern everywhere.
 */
export function assertSessionAllows(
  session: Session,
  operation: HighValueOperation,
  now: number = Date.now(),
): void {
  const reauth = requireReauth(session, operation, now);
  if (reauth.required) {
    throw new ReauthRequiredError(operation);
  }
}

/**
 * Get a human-readable description of an operation for UI display.
 */
export function describeOperation(operation: HighValueOperation): string {
  const descriptions: Record<HighValueOperation, string> = {
    'export-seed': 'Export seed phrase',
    'export-private-key': 'Export private key',
    'change-passphrase': 'Change wallet passphrase',
    'change-pin': 'Change PIN',
    'disable-biometric': 'Disable biometric authentication',
    'change-security-settings': 'Change security settings',
    'large-send': 'Send large amount',
    'unlimited-approval': 'Approve unlimited token spending',
    'add-custom-rpc': 'Add custom RPC endpoint',
  };
  return descriptions[operation];
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Generate a random session ID.
 * WHY random: The ID is used in logs and for debugging, not for security.
 * Random IDs prevent accidental reuse and make sessions distinguishable.
 */
function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  // Use Web Crypto API — available in Node.js (via webcrypto) and browsers
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    const { webcrypto } = require('crypto') as typeof import('crypto');
    webcrypto.getRandomValues(bytes);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
