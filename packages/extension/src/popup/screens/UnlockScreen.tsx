/**
 * Unlock Screen — Passphrase entry for extension popup.
 */
import React, { useCallback, useContext, useState, useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimation } from 'framer-motion';
import { IconLock, IconEye, IconEyeOff, IconAlertTriangle, IconKey } from '../icons';
import {
  Button, Input, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import { AppCtx } from '../context';
// Unlock goes through service worker to avoid libsodium WASM in popup context

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

const SCREEN: CSSProperties = {
  minHeight: '600px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.background,
  padding: SPACING[4],
};

export function UnlockScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { setLocked, setSessionMnemonic, setWalletAddress, addToast } = useContext(AppCtx);

  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);

  const shakeControls = useAnimation();
  const isLockedOut = lockedUntil !== null && Date.now() < lockedUntil;

  useEffect(() => {
    if (!isLockedOut || lockedUntil === null) { setLockoutCountdown(0); return; }
    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) { setLockedUntil(null); setLockoutCountdown(0); }
      else setLockoutCountdown(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isLockedOut, lockedUntil]);

  const handleUnlock = useCallback(async (): Promise<void> => {
    if (isLockedOut || passphrase.length === 0) return;
    setIsLoading(true);
    try {
      // Decrypt via service worker — avoids libsodium WASM in popup context
      const resp = await chrome.runtime.sendMessage({
        action: 'wallet:unlock',
        passphrase,
      }) as { ok?: boolean; mnemonic?: string; address?: string; error?: string };

      if (!resp?.ok || !resp.mnemonic) {
        throw new Error(resp?.error ?? 'Incorrect passphrase');
      }

      setSessionMnemonic(resp.mnemonic);
      if (resp.address) setWalletAddress(resp.address);
      setLocked(false);
      void navigate('/dashboard');
    } catch {
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      void shakeControls.start({
        x: [0, -10, 10, -8, 8, -5, 5, 0],
        transition: { duration: 0.4, ease: 'easeInOut' },
      });
      if (attempts >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setFailedAttempts(0);
        addToast({ type: 'error', message: `Locked for ${LOCKOUT_SECONDS}s` });
      } else {
        addToast({ type: 'error', message: `Wrong passphrase. ${MAX_ATTEMPTS - attempts} left.` });
      }
      setPassphrase('');
    } finally {
      setIsLoading(false);
    }
  }, [isLockedOut, passphrase, failedAttempts, setLocked, setSessionMnemonic, navigate, addToast, shakeControls]);

  return (
    <div style={SCREEN}>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING[6] }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            backgroundColor: `${COLORS.primary}1A`, display: 'flex',
            alignItems: 'center', justifyContent: 'center', margin: '0 auto',
            marginBottom: SPACING[3],
          }}>
            <IconLock size={28} color={COLORS.primary} />
          </div>
          <h1 style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary, textTransform: 'uppercase',
          }}>
            UNLOCK WALLET
          </h1>
          <p style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted,
            marginTop: SPACING[1],
          }}>
            Enter your passphrase to continue
          </p>
        </div>

        {failedAttempts > 0 && !isLockedOut && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: SPACING[2],
            backgroundColor: 'rgba(251,140,0,0.08)', border: '1px solid rgba(251,140,0,0.25)',
            borderRadius: RADIUS.md, padding: `${SPACING[2]} ${SPACING[3]}`,
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.warning,
            width: '100%', justifyContent: 'center',
          }}>
            <IconAlertTriangle size={14} />
            {MAX_ATTEMPTS - failedAttempts} attempt{MAX_ATTEMPTS - failedAttempts !== 1 ? 's' : ''} remaining
          </div>
        )}

        {isLockedOut && (
          <div style={{
            backgroundColor: 'rgba(227,27,35,0.08)', border: `1px solid ${COLORS.error}40`,
            borderRadius: RADIUS.md, padding: SPACING[3], textAlign: 'center',
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.error,
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING[2],
          }}>
            <IconLock size={14} />
            Try again in {lockoutCountdown}s
          </div>
        )}

        <motion.div animate={shakeControls} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: SPACING[3] }}>
          <div style={{ position: 'relative' }}>
            <Input
              label="Passphrase" value={passphrase} onChange={setPassphrase}
              type={showPassphrase ? 'text' : 'password'}
              placeholder="Enter your passphrase" disabled={isLockedOut} autoFocus
            />
            <button
              type="button" onClick={() => setShowPassphrase(v => !v)}
              style={{
                position: 'absolute', right: SPACING[3], top: '36px',
                background: 'none', border: 'none', color: COLORS.textMuted,
                cursor: 'pointer', padding: SPACING[1], display: 'flex', alignItems: 'center',
              }}
            >
              {showPassphrase ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </button>
          </div>
          <Button
            variant="primary" fullWidth size="lg" isLoading={isLoading}
            disabled={passphrase.length === 0 || isLockedOut}
            onClick={() => void handleUnlock()}
          >
            Unlock
          </Button>
        </motion.div>

        <button
          onClick={() => void navigate('/import')}
          style={{
            background: 'none', border: 'none', color: COLORS.textMuted,
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: SPACING[2],
          }}
        >
          <IconKey size={14} />
          Forgot passphrase? Recover with seed phrase
        </button>
      </div>
    </div>
  );
}
