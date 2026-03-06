/**
 * Auth module tests — auto-lock, PIN manager, session management.
 *
 * WHY we inject `now` into time-dependent functions: Using Date.now() directly
 * makes tests that depend on timing flaky. By injecting the current timestamp
 * as a parameter, we can simulate past/future times deterministically.
 */

import { describe, it, expect } from 'vitest';
import {
  createAutoLockManager,
  recordActivity,
  isLocked,
  setLockTimeout,
  lockNow,
  unlockWallet,
  getNextLockAt,
  assertUnlocked,
  DEFAULT_LOCK_TIMEOUT_MS,
} from '../src/auth/auto-lock.js';
import {
  hashPin,
  hashPinWithSalt,
  verifyPin,
  validatePinStrength,
  createDuressPin,
  PIN_ARGON2_TEST_PARAMS,
} from '../src/auth/pin-manager.js';
import {
  createSession,
  isSessionValid,
  refreshSession,
  requireReauth,
  elevateSession,
  assertSessionAllows,
  describeOperation,
} from '../src/auth/session-manager.js';
import { wipeBytes } from '../src/crypto/memory-wipe.js';
import {
  PinError,
  SessionError,
  ReauthRequiredError,
  WalletLockedError,
} from '../src/errors.js';

// ─── Auto-Lock Manager ────────────────────────────────────────────────────────

describe('createAutoLockManager', () => {
  it('creates manager with default timeout', () => {
    const manager = createAutoLockManager();
    expect(manager.timeoutMs).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    expect(manager.isManuallyLocked).toBe(false);
  });

  it('creates manager with custom timeout', () => {
    const timeout = 60_000; // 1 minute
    const manager = createAutoLockManager(timeout);
    expect(manager.timeoutMs).toBe(timeout);
  });

  it('throws for timeout below minimum (30s)', () => {
    expect(() => createAutoLockManager(10_000)).toThrow(/at least/);
  });

  it('throws for timeout above maximum (4h)', () => {
    expect(() => createAutoLockManager(5 * 60 * 60 * 1000)).toThrow(/must not exceed/);
  });

  it('throws for non-integer timeout', () => {
    expect(() => createAutoLockManager(60_000.5)).toThrow();
  });

  it('wallet is not locked immediately after creation', () => {
    const manager = createAutoLockManager(DEFAULT_LOCK_TIMEOUT_MS);
    expect(isLocked(manager)).toBe(false);
  });
});

describe('isLocked', () => {
  it('returns false when timeout has not elapsed', () => {
    const now = Date.now();
    const manager = createAutoLockManager(60_000);
    // Check 1 second later — well within 1 minute timeout
    expect(isLocked(manager, now + 1_000)).toBe(false);
  });

  it('returns true when timeout has elapsed', () => {
    const now = Date.now();
    const manager = createAutoLockManager(60_000);
    // Check 2 minutes later — past the 1 minute timeout
    expect(isLocked(manager, now + 120_000)).toBe(true);
  });

  it('returns true when manually locked regardless of timer', () => {
    const now = Date.now();
    const manager = lockNow(createAutoLockManager(60_000));
    // Even 1ms after creation, manually locked should be locked
    expect(isLocked(manager, now + 1)).toBe(true);
  });

  it('returns true exactly at timeout boundary', () => {
    const now = Date.now();
    const manager = createAutoLockManager(60_000);
    expect(isLocked(manager, now + 60_000)).toBe(true);
  });
});

describe('recordActivity', () => {
  it('resets the inactivity timer', () => {
    const t0 = 1_000_000;
    const manager = createAutoLockManager(60_000);

    // Simulate time passing — nearly at timeout
    const nearLocked = { ...manager, lastActivityAt: t0 };
    expect(isLocked(nearLocked, t0 + 59_000)).toBe(false);

    // Record activity at t0 + 59s — extends by another 60s
    const active = recordActivity(nearLocked, t0 + 59_000);
    expect(isLocked(active, t0 + 59_000 + 59_000)).toBe(false);
  });

  it('does not unlock a manually locked wallet', () => {
    const manager = lockNow(createAutoLockManager(60_000));
    const afterActivity = recordActivity(manager);
    expect(isLocked(afterActivity)).toBe(true);
    expect(afterActivity.isManuallyLocked).toBe(true);
  });

  it('returns a new state object (immutable)', () => {
    const manager = createAutoLockManager(60_000);
    const updated = recordActivity(manager, Date.now() + 1000);
    expect(updated).not.toBe(manager);
  });
});

describe('lockNow', () => {
  it('sets isManuallyLocked to true', () => {
    const manager = createAutoLockManager(60_000);
    expect(manager.isManuallyLocked).toBe(false);
    const locked = lockNow(manager);
    expect(locked.isManuallyLocked).toBe(true);
  });

  it('does not modify the original state', () => {
    const manager = createAutoLockManager(60_000);
    lockNow(manager);
    expect(manager.isManuallyLocked).toBe(false); // Original unchanged
  });
});

describe('unlockWallet', () => {
  it('clears isManuallyLocked', () => {
    const locked = lockNow(createAutoLockManager(60_000));
    const unlocked = unlockWallet(locked);
    expect(unlocked.isManuallyLocked).toBe(false);
    expect(isLocked(unlocked)).toBe(false);
  });

  it('resets lastActivityAt to now', () => {
    const t = Date.now();
    const locked = lockNow(createAutoLockManager(60_000));
    const unlocked = unlockWallet(locked, t);
    expect(unlocked.lastActivityAt).toBe(t);
  });
});

describe('setLockTimeout', () => {
  it('updates the timeout', () => {
    const manager = createAutoLockManager(60_000);
    const updated = setLockTimeout(manager, 120_000);
    expect(updated.timeoutMs).toBe(120_000);
  });

  it('throws for invalid timeout', () => {
    const manager = createAutoLockManager(60_000);
    expect(() => setLockTimeout(manager, 1_000)).toThrow();
  });
});

describe('getNextLockAt', () => {
  it('returns 0 for a manually locked wallet', () => {
    const locked = lockNow(createAutoLockManager(60_000));
    expect(getNextLockAt(locked)).toBe(0);
  });

  it('returns lastActivityAt + timeoutMs for active wallet', () => {
    const t = 1_000_000;
    const manager = { ...createAutoLockManager(60_000), lastActivityAt: t };
    expect(getNextLockAt(manager)).toBe(t + 60_000);
  });
});

describe('assertUnlocked', () => {
  it('does not throw when wallet is unlocked', () => {
    const manager = createAutoLockManager(60_000);
    expect(() => assertUnlocked(manager)).not.toThrow();
  });

  it('throws WalletLockedError when locked', () => {
    const locked = lockNow(createAutoLockManager(60_000));
    expect(() => assertUnlocked(locked)).toThrow(WalletLockedError);
  });
});

// ─── PIN Manager ──────────────────────────────────────────────────────────────

describe('hashPin / verifyPin', () => {
  const GOOD_PIN = '847391';

  it('hashes a PIN and verifies it correctly', async () => {
    const { hash, salt } = await hashPin(GOOD_PIN, PIN_ARGON2_TEST_PARAMS);
    const isValid = await verifyPin(GOOD_PIN, salt, hash, PIN_ARGON2_TEST_PARAMS);
    expect(isValid).toBe(true);
    wipeBytes(hash);
  });

  it('returns false for wrong PIN', async () => {
    const { hash, salt } = await hashPin(GOOD_PIN, PIN_ARGON2_TEST_PARAMS);
    const isValid = await verifyPin('999999', salt, hash, PIN_ARGON2_TEST_PARAMS);
    expect(isValid).toBe(false);
    wipeBytes(hash);
  });

  it('produces different hash each time (different salts)', async () => {
    const r1 = await hashPin(GOOD_PIN, PIN_ARGON2_TEST_PARAMS);
    const r2 = await hashPin(GOOD_PIN, PIN_ARGON2_TEST_PARAMS);
    expect(Buffer.from(r1.hash).toString('hex')).not.toBe(
      Buffer.from(r2.hash).toString('hex'),
    );
    expect(Buffer.from(r1.salt).toString('hex')).not.toBe(
      Buffer.from(r2.salt).toString('hex'),
    );
    wipeBytes(r1.hash);
    wipeBytes(r2.hash);
  });

  it('throws PinError for empty PIN', async () => {
    await expect(hashPin('', PIN_ARGON2_TEST_PARAMS)).rejects.toThrow(PinError);
  });

  it('returns false for empty PIN in verifyPin', async () => {
    const { hash, salt } = await hashPin(GOOD_PIN, PIN_ARGON2_TEST_PARAMS);
    const isValid = await verifyPin('', salt, hash, PIN_ARGON2_TEST_PARAMS);
    expect(isValid).toBe(false);
    wipeBytes(hash);
  });

  it('is deterministic with known salt (hashPinWithSalt)', async () => {
    const { hash, salt } = await hashPin(GOOD_PIN, PIN_ARGON2_TEST_PARAMS);
    const hash2 = await hashPinWithSalt(GOOD_PIN, salt, PIN_ARGON2_TEST_PARAMS);
    expect(Buffer.from(hash).toString('hex')).toBe(Buffer.from(hash2).toString('hex'));
    wipeBytes(hash);
    wipeBytes(hash2);
  });
});

describe('validatePinStrength', () => {
  it('accepts a valid 6-digit PIN', () => {
    const result = validatePinStrength('847391');
    expect(result.isValid).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('accepts an 8-digit PIN', () => {
    const result = validatePinStrength('84739156');
    expect(result.isValid).toBe(true);
  });

  it('rejects PIN shorter than 6 digits', () => {
    const result = validatePinStrength('1234');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/at least 6/i);
  });

  it('rejects PIN longer than 12 digits', () => {
    const result = validatePinStrength('1234567890123');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/must not exceed/i);
  });

  it('rejects non-numeric PIN', () => {
    const result = validatePinStrength('abcdef');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/digits/i);
  });

  it('rejects all-same-digit PIN (000000)', () => {
    const result = validatePinStrength('000000');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/too simple/i);
  });

  it('rejects all-same-digit PIN (111111)', () => {
    const result = validatePinStrength('111111');
    expect(result.isValid).toBe(false);
  });

  it('rejects sequential ascending PIN (123456)', () => {
    const result = validatePinStrength('123456');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/sequential/i);
  });

  it('rejects sequential descending PIN (987654)', () => {
    const result = validatePinStrength('987654');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/sequential/i);
  });

  it('rejects 654321 as sequential descending', () => {
    const result = validatePinStrength('654321');
    expect(result.isValid).toBe(false);
  });
});

describe('createDuressPin', () => {
  it('returns a PIN that differs by exactly one digit', () => {
    const realPin = '847391';
    // Run multiple times since position is random
    for (let i = 0; i < 20; i++) {
      const duress = createDuressPin(realPin);
      expect(duress.length).toBe(realPin.length);
      let differences = 0;
      for (let j = 0; j < realPin.length; j++) {
        if (duress[j] !== realPin[j]) differences++;
      }
      expect(differences).toBe(1);
    }
  });

  it('returns a PIN of the same length as the real PIN', () => {
    const realPin = '84739156';
    const duress = createDuressPin(realPin);
    expect(duress.length).toBe(realPin.length);
  });

  it('returns a different PIN each call (random position/digit)', () => {
    const realPin = '847391';
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(createDuressPin(realPin));
    }
    // With 6 positions * 9 alternatives = 54 possible duress PINs
    // After 50 calls, we should have at least 3 different ones
    expect(results.size).toBeGreaterThan(2);
  });

  it('throws PinError for invalid real PIN', () => {
    expect(() => createDuressPin('123456')).toThrow(PinError);
    expect(() => createDuressPin('000000')).toThrow(PinError);
    expect(() => createDuressPin('123')).toThrow(PinError);
  });

  it('duress PIN contains only digits', () => {
    const duress = createDuressPin('847391');
    expect(/^\d+$/.test(duress)).toBe(true);
  });
});

// ─── Session Manager ──────────────────────────────────────────────────────────

describe('createSession', () => {
  it('creates a valid session', () => {
    const now = Date.now();
    const session = createSession('pin', 30 * 60 * 1000, now);
    expect(session.authMethod).toBe('pin');
    expect(session.createdAt).toBe(now);
    expect(session.lastActivityAt).toBe(now);
    expect(session.id).toBeTruthy();
    expect(session.id.length).toBe(32); // 16 bytes = 32 hex chars
  });

  it('generates unique session IDs', () => {
    const s1 = createSession('pin');
    const s2 = createSession('pin');
    expect(s1.id).not.toBe(s2.id);
  });

  it('throws for non-positive session duration', () => {
    expect(() => createSession('pin', 0)).toThrow(SessionError);
    expect(() => createSession('pin', -1)).toThrow(SessionError);
  });
});

describe('isSessionValid', () => {
  it('returns true for a fresh session', () => {
    const session = createSession('pin');
    expect(isSessionValid(session)).toBe(true);
  });

  it('returns true for session within duration', () => {
    const now = Date.now();
    const session = createSession('pin', 30 * 60 * 1000, now);
    expect(isSessionValid(session, now + 29 * 60 * 1000)).toBe(true);
  });

  it('returns false for expired session', () => {
    const now = Date.now();
    const session = createSession('pin', 30 * 60 * 1000, now);
    expect(isSessionValid(session, now + 31 * 60 * 1000)).toBe(false);
  });
});

describe('refreshSession', () => {
  it('updates lastActivityAt', () => {
    const now = Date.now();
    const session = createSession('pin', 30 * 60 * 1000, now);
    const refreshed = refreshSession(session, now + 10 * 60 * 1000);
    expect(refreshed.lastActivityAt).toBe(now + 10 * 60 * 1000);
  });

  it('throws SessionError when refreshing expired session', () => {
    const now = Date.now();
    const session = createSession('pin', 30 * 60 * 1000, now);
    expect(() => refreshSession(session, now + 60 * 60 * 1000)).toThrow(SessionError);
  });

  it('returns a new session object (immutable)', () => {
    const session = createSession('pin');
    const refreshed = refreshSession(session);
    expect(refreshed).not.toBe(session);
  });
});

describe('requireReauth', () => {
  it('does not require reauth for PIN session + PIN-level operation', () => {
    const session = createSession('pin');
    const result = requireReauth(session, 'large-send');
    expect(result.required).toBe(false);
  });

  it('requires passphrase reauth for seed export from PIN session', () => {
    const session = createSession('pin');
    const result = requireReauth(session, 'export-seed');
    expect(result.required).toBe(true);
    expect(result.minimumAuthMethod).toBe('passphrase');
  });

  it('requires passphrase reauth for private key export', () => {
    const session = createSession('biometric');
    const result = requireReauth(session, 'export-private-key');
    expect(result.required).toBe(true);
    expect(result.minimumAuthMethod).toBe('passphrase');
  });

  it('does not require reauth for passphrase session on any operation', () => {
    const session = createSession('passphrase');
    const ops = ['export-seed', 'export-private-key', 'change-passphrase', 'large-send'] as const;
    for (const op of ops) {
      expect(requireReauth(session, op).required).toBe(false);
    }
  });

  it('requires reauth for expired session', () => {
    const now = Date.now();
    const session = createSession('passphrase', 30 * 60 * 1000, now);
    const result = requireReauth(session, 'large-send', now + 60 * 60 * 1000);
    expect(result.required).toBe(true);
    expect(result.reason).toMatch(/expired/i);
  });

  it('does not require reauth for elevated operations', () => {
    const session = createSession('pin');
    // Elevate for seed export
    const elevated = elevateSession(session, 'export-seed');
    // Artificially set to passphrase for the check:
    // Actually with a PIN session, export-seed normally requires passphrase reauth.
    // After elevation, it should not be required.
    const result = requireReauth(elevated, 'export-seed');
    // Wait - with PIN session and elevation for export-seed, it still might require passphrase.
    // Let me check the logic: the elevation check happens BEFORE the method strength check.
    // So if already elevated, should skip reauth.
    // But our implementation checks elevatedOps first.
    expect(result.required).toBe(false);
  });

  it('requires reauth for biometric session on PIN-level ops (biometric is weaker than PIN)', () => {
    const session = createSession('biometric');
    const result = requireReauth(session, 'change-pin');
    expect(result.required).toBe(true);
    expect(result.minimumAuthMethod).toBe('pin');
  });
});

describe('elevateSession', () => {
  it('marks an operation as elevated', () => {
    const session = createSession('pin');
    expect(session.elevatedOps.has('export-seed')).toBe(false);

    const elevated = elevateSession(session, 'export-seed');
    expect(elevated.elevatedOps.has('export-seed')).toBe(true);
  });

  it('does not mutate the original session', () => {
    const session = createSession('pin');
    elevateSession(session, 'export-seed');
    expect(session.elevatedOps.has('export-seed')).toBe(false);
  });

  it('can elevate multiple operations', () => {
    const session = createSession('passphrase');
    const e1 = elevateSession(session, 'export-seed');
    const e2 = elevateSession(e1, 'export-private-key');
    expect(e2.elevatedOps.has('export-seed')).toBe(true);
    expect(e2.elevatedOps.has('export-private-key')).toBe(true);
  });
});

describe('assertSessionAllows', () => {
  it('does not throw for allowed operations', () => {
    const session = createSession('passphrase');
    expect(() => assertSessionAllows(session, 'large-send')).not.toThrow();
  });

  it('throws ReauthRequiredError for disallowed operations', () => {
    const session = createSession('pin');
    expect(() => assertSessionAllows(session, 'export-seed')).toThrow(ReauthRequiredError);
  });

  it('throws ReauthRequiredError for expired session', () => {
    const now = Date.now();
    const session = createSession('passphrase', 60_000, now);
    expect(() =>
      assertSessionAllows(session, 'large-send', now + 120_000),
    ).toThrow(ReauthRequiredError);
  });
});

describe('describeOperation', () => {
  it('returns human-readable descriptions for all operations', () => {
    const ops = [
      'export-seed',
      'export-private-key',
      'change-passphrase',
      'change-pin',
      'disable-biometric',
      'change-security-settings',
      'large-send',
      'unlimited-approval',
      'add-custom-rpc',
    ] as const;

    for (const op of ops) {
      const desc = describeOperation(op);
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});
