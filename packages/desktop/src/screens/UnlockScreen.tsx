/**
 * Unlock Screen — passphrase entry.
 *
 * SECURITY:
 * - Failed attempts are rate-limited (lockout after N failures)
 * - Shows attempts remaining in the UI
 * - In production: passphrase is fed to Argon2id to derive decryption key
 * - Biometric placeholder shown (disabled on desktop)
 * - Forgot passphrase entry point for seed phrase recovery
 */
import React, { useCallback, useContext, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimation } from 'framer-motion';
import {
  IconLock,
  IconFingerprint,
  IconEye,
  IconEyeOff,
  IconAlertTriangle,
  IconKey,
} from '../icons.js';
import {
  Button,
  Input,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import { AppCtx } from '../context.js';
import {
  decryptPayload,
  encryptPayload,
  wipeBytes,
} from '@saiko-wallet/wallet-core';
import type { EncryptedKeystore } from '@saiko-wallet/wallet-core';
import { Mnemonic } from 'ethers';
import { safeDecrypt } from '../utils/electron-bridge.js';

/** Maximum failed attempts before temporary lockout */
const MAX_ATTEMPTS = 5;
/** Lockout duration in seconds */
const LOCKOUT_SECONDS = 30;

const SCREEN_STYLE: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.background,
  padding: SPACING[6],
};

export function UnlockScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { setLocked, setSessionMnemonic, addToast } = useContext(AppCtx);

  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);
  const [storageError, setStorageError] = useState<string | null>(null);

  const shakeControls = useAnimation();

  const isLockedOut = lockedUntil !== null && Date.now() < lockedUntil;

  // Countdown timer for lockout
  useEffect(() => {
    if (!isLockedOut || lockedUntil === null) {
      setLockoutCountdown(0);
      return;
    }
    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setLockoutCountdown(0);
      } else {
        setLockoutCountdown(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isLockedOut, lockedUntil]);

  const attemptsRemaining = MAX_ATTEMPTS - failedAttempts;

  const triggerShake = async (): Promise<void> => {
    await shakeControls.start({
      x: [0, -10, 10, -8, 8, -5, 5, 0],
      transition: { duration: 0.4, ease: 'easeInOut' },
    });
  };

  const handleUnlock = useCallback(async (attempt: string): Promise<void> => {
    if (isLockedOut || attempt.length === 0) return;
    setIsLoading(true);
    setStorageError(null);
    try {
      let decryptedMnemonic: string;

      const raw = localStorage.getItem('saiko_keystore');
      if (raw) {
        // Unwrap OS keyring layer (safeStorage), then Argon2id + XSalsa20-Poly1305
        // safeDecrypt throws 'SAFESTORAGE_UNAVAILABLE' if the blob can't be read
        let keystoreJson: string;
        try {
          keystoreJson = await safeDecrypt(raw);
        } catch (e) {
          const msg = e instanceof Error ? e.message : '';
          if (msg === 'SAFESTORAGE_UNAVAILABLE') {
            // Storage layer failed — this is NOT a wrong passphrase
            setStorageError(
              'Your wallet data is encrypted with OS-level security that is currently unavailable. ' +
              'This can happen after a reinstall or OS change. ' +
              'Use your seed phrase to recover your wallet.'
            );
            return;
          }
          throw e;
        }

        let keystore: EncryptedKeystore;
        try {
          keystore = JSON.parse(keystoreJson) as EncryptedKeystore;
        } catch {
          // JSON parse failed — stored data is corrupt
          setStorageError(
            'Wallet data appears corrupted and cannot be read. ' +
            'Use your seed phrase to recover your wallet.'
          );
          return;
        }

        const plaintextBytes = await decryptPayload(keystore, attempt);
        decryptedMnemonic = new TextDecoder().decode(plaintextBytes);
        wipeBytes(plaintextBytes);
      } else {
        // Legacy plaintext fallback — auto-migrate to encrypted storage
        const plaintext = localStorage.getItem('saiko_mnemonic');
        if (!plaintext) throw new Error('No wallet found');
        Mnemonic.fromPhrase(plaintext); // Validate format
        decryptedMnemonic = plaintext;
        // Encrypt and migrate
        const keystore = await encryptPayload(plaintext, attempt);
        localStorage.setItem('saiko_keystore', JSON.stringify(keystore));
        localStorage.removeItem('saiko_mnemonic');
      }

      setSessionMnemonic(decryptedMnemonic);
      setLocked(false);
      void navigate('/dashboard');
    } catch {
      // Only count wrong-passphrase attempts against the lockout
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      void triggerShake();
      if (attempts >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setFailedAttempts(0);
        addToast({
          type: 'error',
          title: 'Too Many Attempts',
          message: `Wallet locked for ${LOCKOUT_SECONDS} seconds.`,
        });
      } else {
        addToast({
          type: 'error',
          message: `Incorrect passphrase. ${MAX_ATTEMPTS - attempts} attempts remaining.`,
        });
      }
      setPassphrase('');
    } finally {
      setIsLoading(false);
    }
  }, [isLockedOut, failedAttempts, setLocked, setSessionMnemonic, navigate, addToast, shakeControls]);

  const handleForgotPassphrase = useCallback((): void => {
    addToast({
      type: 'info',
      title: 'Recover Wallet',
      message: 'Use your seed phrase to restore your wallet.',
    });
    void navigate('/import');
  }, [addToast, navigate]);

  const cardStyle: CSSProperties = {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: SPACING[8],
  };

  return (
    <div style={SCREEN_STYLE}>
      <div style={cardStyle}>
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <motion.div
            animate={{
              boxShadow: [
                `0 0 16px ${COLORS.primary}40`,
                `0 0 32px ${COLORS.primary}60`,
                `0 0 16px ${COLORS.primary}40`,
              ],
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              display: 'inline-block',
              borderRadius: '50%',
              marginBottom: SPACING[4],
            }}
          >
            <img
              src="/assets/saiko-face-transparent.png"
              alt="SAIKO WALLET"
              style={{
                width: '88px',
                height: '88px',
                objectFit: 'contain',
                display: 'block',
                filter: `drop-shadow(0 0 8px ${COLORS.primary}60)`,
              }}
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = 'none';
              }}
            />
          </motion.div>
          <h1 style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE['2xl'],
            fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary,
            marginBottom: SPACING[1],
            textTransform: 'uppercase',
          }}>
            UNLOCK WALLET
          </h1>
          <p style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textMuted,
          }}>
            Enter your passphrase to continue
          </p>
        </div>

        {/* Storage error — shown when OS keyring / data corruption blocks unlock */}
        {storageError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              backgroundColor: 'rgba(227,27,35,0.08)',
              border: `1px solid ${COLORS.error}60`,
              borderRadius: RADIUS.md,
              padding: SPACING[4],
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: SPACING[3],
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: SPACING[2],
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.error,
              lineHeight: '1.5',
            }}>
              <IconAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{storageError}</span>
            </div>
            <Button
              variant="primary"
              fullWidth
              size="md"
              onClick={handleForgotPassphrase}
            >
              Recover with Seed Phrase →
            </Button>
          </motion.div>
        )}

        {/* Attempts remaining indicator */}
        {failedAttempts > 0 && !isLockedOut && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACING[2],
            backgroundColor: 'rgba(251,140,0,0.08)',
            border: `1px solid rgba(251,140,0,0.25)`,
            borderRadius: RADIUS.md,
            padding: `${SPACING[2]} ${SPACING[4]}`,
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.warning,
            width: '100%',
            justifyContent: 'center',
          }}>
            <IconAlertTriangle size={14} />
            {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
          </div>
        )}

        {/* Lockout message */}
        {isLockedOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              backgroundColor: 'rgba(227,27,35,0.08)',
              border: `1px solid ${COLORS.error}40`,
              borderRadius: RADIUS.md,
              padding: SPACING[4],
              textAlign: 'center',
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.error,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: SPACING[2],
            }}
          >
            <IconLock size={16} />
            Too many failed attempts. Try again in {lockoutCountdown}s
          </motion.div>
        )}

        {/* Passphrase Input */}
        <motion.div
          animate={shakeControls}
          style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: SPACING[4] }}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && passphrase.length > 0 && !isLockedOut && !isLoading) {
              void handleUnlock(passphrase);
            }
          }}
        >
          <div style={{ position: 'relative' }} data-testid="passphrase-input">
            <Input
              label="Passphrase"
              value={passphrase}
              onChange={setPassphrase}
              type={showPassphrase ? 'text' : 'password'}
              placeholder="Enter your passphrase"
              disabled={isLockedOut}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassphrase((v) => !v)}
              style={{
                position: 'absolute',
                right: SPACING[3],
                top: '36px',
                background: 'none',
                border: 'none',
                color: COLORS.textMuted,
                cursor: 'pointer',
                padding: SPACING[1],
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
            >
              {showPassphrase ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </button>
          </div>
          {/* Biometric placeholder */}
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: SPACING[2],
              background: 'none',
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
              padding: SPACING[3],
              color: COLORS.textMuted,
              cursor: 'not-allowed',
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              opacity: 0.5,
            }}
            disabled
            title="Biometric auth not available on desktop"
          >
            <IconFingerprint size={18} />
            Use Biometric Auth (not available on desktop)
          </button>
          <Button
            variant="primary"
            fullWidth
            size="lg"
            isLoading={isLoading}
            disabled={passphrase.length === 0 || isLockedOut}
            onClick={() => void handleUnlock(passphrase)}
          >
            Unlock
          </Button>
        </motion.div>

        {/* Forgot passphrase */}
        <button
          onClick={handleForgotPassphrase}
          style={{
            background: 'none',
            border: 'none',
            color: COLORS.textMuted,
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: SPACING[2],
            padding: SPACING[2],
          }}
        >
          <IconKey size={14} />
          Forgot passphrase? Recover with seed phrase
        </button>
      </div>
    </div>
  );
}
