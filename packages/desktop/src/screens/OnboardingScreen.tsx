/**
 * Onboarding Screen — Create new wallet flow.
 *
 * Steps:
 *   welcome → show-seed → verify-seed → set-passphrase → success
 *
 * SECURITY: Seed is generated using wallet-core (ethers.js + CSPRNG).
 * The seed is displayed once, then must be verified before proceeding.
 * The seed is never stored in component state longer than necessary.
 */
import React, { useContext, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconShield,
  IconImport,
  IconAlertTriangle,
  IconEye,
  IconCheckCircle2,
  IconArrowLeft,
  IconChevronRight,
} from '../icons.js';
import {
  Button,
  Card,
  Input,
  SeedPhraseGrid,
  SecurityBadge,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import { generateMnemonic, deriveAccount, encryptPayload } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context.js';
import { safeEncrypt } from '../utils/electron-bridge.js';

type OnboardingStep = 'welcome' | 'show-seed' | 'verify-seed' | 'set-passphrase' | 'success' | 'verify-recovery';

const SCREEN_STYLE: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.background,
  padding: SPACING[6],
};

const CARD_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: '560px',
};

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

const stepTransition = { duration: 0.2, ease: 'easeOut' as const };

// ── Step: Welcome ─────────────────────────────────────────────────────────────

function WelcomeStep({ onCreateNew, onImport }: { onCreateNew: () => void; onImport: () => void }): React.ReactElement {
  return (
    <div style={{ ...SCREEN_STYLE, gap: SPACING[8] }}>
      {/* Hero Wolf */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING[4] }}>
        <motion.img
          src="/assets/saiko-fullbody.png"
          alt="Saiko Inu"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' as const }}
          style={{
            width: '200px',
            height: '200px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 24px rgba(227, 27, 35, 0.3))',
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE['4xl'],
            fontWeight: FONT_WEIGHT.extrabold,
            color: COLORS.textPrimary,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}>
            SAIKO WALLET
          </h1>
          <p style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.base,
            color: COLORS.textSecondary,
            marginTop: SPACING[2],
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}>
            YOUR KEYS. YOUR TERRITORY.
          </p>
        </div>
      </div>

      <Card style={CARD_STYLE} bordered padding="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4] }}>
          <motion.div data-testid="create-wallet-btn" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
            <Button variant="primary" fullWidth size="lg" onClick={onCreateNew}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <IconShield size={20} />
                FORGE NEW WALLET
              </span>
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
            <Button variant="secondary" fullWidth size="lg" onClick={onImport}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <IconImport size={20} />
                IMPORT EXISTING WALLET
              </span>
            </Button>
          </motion.div>
        </div>
        <p style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.sm,
          color: COLORS.textMuted,
          textAlign: 'center',
          marginTop: SPACING[6],
          lineHeight: '1.5',
        }}>
          No accounts. No servers. No tracking. Total sovereignty.
        </p>
      </Card>
    </div>
  );
}

// ── Step: Show Seed ───────────────────────────────────────────────────────────

function ShowSeedStep({
  mnemonic,
  onNext,
}: {
  mnemonic: readonly string[];
  onNext: () => void;
}): React.ReactElement {
  const [confirmed, setConfirmed] = useState(false);
  const [blurred, setBlurred] = useState(true);

  return (
    <div style={{ ...SCREEN_STYLE, gap: SPACING[6] }}>
      <div style={CARD_STYLE}>
        <h2 style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE['2xl'],
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary,
          marginBottom: SPACING[2],
          textTransform: 'uppercase',
        }}>
          YOUR SECRET RECOVERY PHRASE
        </h2>
        <p style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.base,
          color: COLORS.textSecondary,
          marginBottom: SPACING[6],
          lineHeight: '1.5',
        }}>
          Write these 24 words down in order. Anyone with this phrase controls your wallet.
          <strong style={{ color: COLORS.error }}> Never share it.</strong>
        </p>

        <div
          style={{
            backgroundColor: `${COLORS.error}10`,
            border: `1px solid ${COLORS.error}4D`,
            borderRadius: RADIUS.md,
            padding: SPACING[4],
            marginBottom: SPACING[4],
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.warning,
            display: 'flex',
            alignItems: 'flex-start',
            gap: SPACING[2],
          }}
        >
          <IconAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>Make sure no one is watching your screen. Disable screen recording.</span>
        </div>

        <div style={{ position: 'relative', marginBottom: SPACING[4] }}>
          <SeedPhraseGrid words={mnemonic} mode="display" blurred={blurred} />
          {blurred && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(10,10,10,0.6)',
                borderRadius: RADIUS.md,
                cursor: 'pointer',
              }}
              onClick={() => setBlurred(false)}
            >
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.base,
                color: COLORS.textPrimary,
                fontWeight: FONT_WEIGHT.semibold,
                display: 'flex',
                alignItems: 'center',
                gap: SPACING[2],
              }}>
                <IconEye size={20} />
                Click to reveal
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACING[3], marginBottom: SPACING[6] }}>
          <input
            type="checkbox"
            id="confirm-backup"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: '3px', accentColor: COLORS.primary, flexShrink: 0 }}
          />
          <label
            htmlFor="confirm-backup"
            style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textSecondary,
              cursor: 'pointer',
              lineHeight: '1.5',
            }}
          >
            I have written down my seed phrase and stored it safely offline. I understand losing it means permanent loss of access.
          </label>
        </div>

        <Button
          variant="primary"
          fullWidth
          size="lg"
          disabled={!confirmed || blurred}
          onClick={onNext}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            Continue to Verification
            <IconChevronRight size={18} />
          </span>
        </Button>
      </div>
    </div>
  );
}

// ── Step: Verify Seed ─────────────────────────────────────────────────────────

/**
 * Picks N random word positions the user must re-enter.
 * WHY: Partial verification catches most "I didn't write it down" cases
 * without requiring the user to re-enter all 12 words.
 */
function pickVerifyPositions(count: number, total: number): number[] {
  const positions = Array.from({ length: total }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  return positions.slice(0, count).sort((a, b) => a - b);
}

function VerifySeedStep({
  mnemonic,
  onNext,
  onBack,
}: {
  mnemonic: readonly string[];
  onNext: () => void;
  onBack: () => void;
}): React.ReactElement {
  const [verifyPositions] = useState(() => pickVerifyPositions(4, mnemonic.length));
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [hasError, setHasError] = useState(false);

  const handleInputChange = useCallback((pos: number, val: string): void => {
    setAnswers((prev) => ({ ...prev, [pos]: val.toLowerCase().trim() }));
    setHasError(false);
  }, []);

  const handleVerify = useCallback((): void => {
    const allCorrect = verifyPositions.every(
      (pos) => answers[pos] === mnemonic[pos]
    );
    if (allCorrect) {
      onNext();
    } else {
      setHasError(true);
    }
  }, [verifyPositions, answers, mnemonic, onNext]);

  const allFilled = verifyPositions.every((pos) => (answers[pos] ?? '').length > 0);

  return (
    <div style={{ ...SCREEN_STYLE, gap: SPACING[6] }}>
      <div style={CARD_STYLE}>
        <h2 style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE['2xl'],
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary,
          marginBottom: SPACING[2],
          textTransform: 'uppercase',
        }}>
          VERIFY YOUR PHRASE
        </h2>
        <p style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.base,
          color: COLORS.textSecondary,
          marginBottom: SPACING[6],
        }}>
          Enter the words at the positions shown to confirm your backup.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4], marginBottom: SPACING[6] }}>
          {verifyPositions.map((pos) => (
            <Input
              key={pos}
              label={`Word #${pos + 1}`}
              value={answers[pos] ?? ''}
              onChange={(val) => handleInputChange(pos, val)}
              monospace
              placeholder={`Enter word ${pos + 1}`}
              autoComplete="off"
              error={hasError && (answers[pos] ?? '') !== mnemonic[pos]
                ? 'Incorrect word — check your backup'
                : undefined}
            />
          ))}
        </div>

        {hasError && (
          <div style={{
            backgroundColor: `${COLORS.error}14`,
            border: `1px solid ${COLORS.error}50`,
            borderRadius: RADIUS.md,
            padding: SPACING[4],
            marginBottom: SPACING[4],
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.error,
            display: 'flex',
            alignItems: 'center',
            gap: SPACING[2],
          }}>
            <IconAlertTriangle size={16} style={{ flexShrink: 0 }} />
            Some words are incorrect. Check your backup and try again.
          </div>
        )}

        <div style={{ display: 'flex', gap: SPACING[3] }}>
          <Button variant="ghost" onClick={onBack}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconArrowLeft size={16} /> Back
            </span>
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={!allFilled}
            onClick={handleVerify}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              Verify
              <IconChevronRight size={18} />
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Step: Set Passphrase ──────────────────────────────────────────────────────

function SetPassphraseStep({
  onNext,
  onBack,
  isEncrypting,
}: {
  onNext: (passphrase: string) => void;
  onBack: () => void;
  isEncrypting?: boolean;
}): React.ReactElement {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ passphrase?: string; confirm?: string }>({});

  const validate = useCallback((): boolean => {
    const errs: typeof errors = {};
    if (passphrase.length < 8) {
      errs.passphrase = 'Passphrase must be at least 8 characters';
    }
    if (passphrase !== confirm) {
      errs.confirm = 'Passphrases do not match';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [passphrase, confirm]);

  const handleSubmit = useCallback((): void => {
    if (validate()) onNext(passphrase);
  }, [validate, passphrase, onNext]);

  return (
    <div style={{ ...SCREEN_STYLE, gap: SPACING[6] }}>
      <div style={CARD_STYLE}>
        <h2 style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE['2xl'],
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary,
          marginBottom: SPACING[2],
          textTransform: 'uppercase',
        }}>
          SET YOUR PASSPHRASE
        </h2>
        <p style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.base,
          color: COLORS.textSecondary,
          marginBottom: SPACING[6],
          lineHeight: '1.5',
        }}>
          Your passphrase encrypts your wallet on this device. You need it every time you unlock.
          <strong style={{ color: COLORS.error }}> Forget it, and only your seed phrase saves you.</strong>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4], marginBottom: SPACING[6] }}>
          <Input
            label="Passphrase"
            value={passphrase}
            onChange={setPassphrase}
            type="password"
            placeholder="Enter a strong passphrase"
            error={errors.passphrase}
            hint="Minimum 8 characters. Use a mix of words, numbers, and symbols."
          />
          <Input
            label="Confirm Passphrase"
            value={confirm}
            onChange={setConfirm}
            type="password"
            placeholder="Re-enter your passphrase"
            error={errors.confirm}
          />
        </div>

        <div style={{ display: 'flex', gap: SPACING[3] }}>
          <Button variant="ghost" onClick={onBack}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconArrowLeft size={16} /> Back
            </span>
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={passphrase.length === 0 || isEncrypting}
            isLoading={isEncrypting}
            onClick={handleSubmit}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              {isEncrypting ? 'Securing your wallet...' : 'Create Wallet'}
              {!isEncrypting && <IconChevronRight size={18} />}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Step: Success ─────────────────────────────────────────────────────────────

function SuccessStep({ address, onDone }: { address: string; onDone: () => void; }): React.ReactElement {
  return (
    <div style={{ ...SCREEN_STYLE, gap: SPACING[6] }}>
      <div style={{ ...CARD_STYLE, textAlign: 'center' }}>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          style={{ marginBottom: SPACING[4] }}
        >
          <IconCheckCircle2
            size={72}
            color={COLORS.success}
            strokeWidth={1.5}
          />
        </motion.div>
        <h2 style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE['2xl'],
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary,
          marginBottom: SPACING[2],
          textTransform: 'uppercase',
        }}>
          WALLET CREATED
        </h2>
        <p style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.base,
          color: COLORS.textSecondary,
          marginBottom: SPACING[4],
        }}>
          Your Saiko Wallet is ready. You own it. No one else does.
        </p>
        <div style={{
          fontFamily: FONT_FAMILY.mono,
          fontSize: FONT_SIZE.sm,
          color: COLORS.textMuted,
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          padding: SPACING[4],
          marginBottom: SPACING[6],
          wordBreak: 'break-all',
        }}>
          {address}
        </div>
        <SecurityBadge status="backup-complete" showDetail style={{ marginBottom: SPACING[6] }} />
        <Button variant="primary" fullWidth size="lg" onClick={onDone}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            Go to Dashboard
            <IconChevronRight size={18} />
          </span>
        </Button>
      </div>
    </div>
  );
}

// ── Step: Verify Recovery ──────────────────────────────────────────────────────

function VerifyRecoveryStep({
  mnemonic,
  onDone,
}: {
  mnemonic: readonly string[];
  onDone: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [wrongPositions, setWrongPositions] = useState<number[]>([]);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const handleVerify = useCallback((): void => {
    const words = input.trim().split(/\s+/).map((w) => w.toLowerCase().trim());
    const wrong: number[] = [];
    for (let i = 0; i < mnemonic.length; i++) {
      if (words[i] !== mnemonic[i]) wrong.push(i);
    }
    if (words.length !== mnemonic.length) {
      for (let i = words.length; i < mnemonic.length; i++) wrong.push(i);
    }
    if (wrong.length === 0) {
      localStorage.setItem('saiko_recovery_verified', 'true');
      onDone();
    } else {
      setWrongPositions(wrong);
    }
  }, [input, mnemonic, onDone]);

  const handleSkip = useCallback((): void => {
    localStorage.setItem('saiko_recovery_verified', 'skipped_with_warning');
    onDone();
  }, [onDone]);

  return (
    <div style={{ ...SCREEN_STYLE, gap: SPACING[6] }}>
      <div style={CARD_STYLE}>
        <h2 style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE['2xl'],
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary,
          marginBottom: SPACING[2],
          textTransform: 'uppercase',
        }}>
          VERIFY YOUR BACKUP
        </h2>
        <p style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.base,
          color: COLORS.textSecondary,
          marginBottom: SPACING[6],
          lineHeight: '1.5',
        }}>
          Type your complete 24-word seed phrase to confirm you have it saved.
        </p>

        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setWrongPositions([]); }}
          placeholder="Enter all 24 words separated by spaces"
          rows={4}
          style={{
            width: '100%',
            fontFamily: FONT_FAMILY.mono,
            fontSize: FONT_SIZE.base,
            color: COLORS.textPrimary,
            backgroundColor: COLORS.surface,
            border: `1px solid ${wrongPositions.length > 0 ? COLORS.error : COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: SPACING[4],
            resize: 'none',
            outline: 'none',
            marginBottom: SPACING[4],
            boxSizing: 'border-box',
          }}
        />

        {wrongPositions.length > 0 && (
          <div style={{
            backgroundColor: `${COLORS.error}14`,
            border: `1px solid ${COLORS.error}50`,
            borderRadius: RADIUS.md,
            padding: SPACING[4],
            marginBottom: SPACING[4],
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.error,
            display: 'flex',
            alignItems: 'flex-start',
            gap: SPACING[2],
          }}>
            <IconAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              Wrong or missing words at position{wrongPositions.length > 1 ? 's' : ''}: {wrongPositions.map((p) => `#${p + 1}`).join(', ')}. Check your backup and try again.
            </span>
          </div>
        )}

        <Button variant="primary" fullWidth size="lg" onClick={handleVerify}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            Verify
            <IconChevronRight size={18} />
          </span>
        </Button>

        <div style={{ textAlign: 'center', marginTop: SPACING[4] }}>
          {!showSkipConfirm ? (
            <button
              onClick={() => setShowSkipConfirm(true)}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.textMuted,
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Skip for now
            </button>
          ) : (
            <div style={{
              backgroundColor: 'rgba(251,140,0,0.08)',
              border: '1px solid rgba(251,140,0,0.3)',
              borderRadius: RADIUS.md,
              padding: SPACING[4],
              marginTop: SPACING[2],
            }}>
              <p style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                fontWeight: FONT_WEIGHT.bold,
                color: COLORS.error,
                marginBottom: SPACING[2],
              }}>
                WARNING: You are about to skip seed phrase verification.
              </p>
              <p style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.warning,
                marginBottom: SPACING[3],
                lineHeight: '1.5',
              }}>
                If you lose this device without a verified backup, your funds are gone forever. There is no recovery mechanism. By clicking &quot;I understand the risk — Skip&quot; you explicitly confirm you accept this risk.
              </p>
              <div style={{ display: 'flex', gap: SPACING[3], justifyContent: 'center' }}>
                <Button variant="ghost" size="sm" onClick={() => setShowSkipConfirm(false)}>
                  Go Back &amp; Verify
                </Button>
                <Button variant="danger" size="sm" onClick={handleSkip}>
                  I understand the risk — Skip
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function OnboardingScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { setWalletCreated, setWalletAddress, setSessionMnemonic, addToast } = useContext(AppCtx);

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [mnemonic, setMnemonic] = useState<readonly string[]>([]);
  const [address, setAddress] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);

  const handleCreateNew = useCallback(async (): Promise<void> => {
    setIsGenerating(true);
    try {
      const result = generateMnemonic(24); // 24-word mnemonic (H-3)
      const account = deriveAccount(result.mnemonic, 0);
      setMnemonic(result.mnemonic.split(' '));
      setAddress(account.address);
      setStep('show-seed');
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Generation Failed',
        message: 'Could not generate wallet. Please try again.',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [addToast]);

  const handleSetPassphrase = useCallback(async (passphraseValue: string): Promise<void> => {
    setIsEncrypting(true);
    try {
      const mnemonicStr = mnemonic.join(' ');
      const keystore = await encryptPayload(mnemonicStr, passphraseValue);
      const keystoreJson = JSON.stringify(keystore);
      const stored = await safeEncrypt(keystoreJson);
      localStorage.setItem('saiko_keystore', stored);
      // Store mnemonic in session memory for immediate use after onboarding
      setSessionMnemonic(mnemonicStr);
      setStep('success');
    } catch {
      addToast({
        type: 'error',
        title: 'Encryption Failed',
        message: 'Failed to secure wallet. Please try again.',
      });
    } finally {
      setIsEncrypting(false);
    }
  }, [mnemonic, addToast, setSessionMnemonic]);

  const handleDone = useCallback((): void => {
    setWalletAddress(address);
    setWalletCreated(true);
    void navigate('/dashboard');
  }, [address, setWalletAddress, setWalletCreated, navigate]);

  const renderStep = (): React.ReactElement => {
    if (step === 'welcome') {
      return (
        <WelcomeStep
          onCreateNew={() => void handleCreateNew()}
          onImport={() => void navigate('/import')}
        />
      );
    }

    if (step === 'show-seed') {
      return (
        <ShowSeedStep
          mnemonic={mnemonic}
          onNext={() => setStep('verify-seed')}
        />
      );
    }

    if (step === 'verify-seed') {
      return (
        <VerifySeedStep
          mnemonic={mnemonic}
          onNext={() => setStep('set-passphrase')}
          onBack={() => setStep('show-seed')}
        />
      );
    }

    if (step === 'set-passphrase') {
      return (
        <SetPassphraseStep
          onNext={(p) => void handleSetPassphrase(p)}
          onBack={() => setStep('verify-seed')}
          isEncrypting={isEncrypting}
        />
      );
    }

    if (step === 'success') {
      return <SuccessStep address={address} onDone={() => setStep('verify-recovery')} />;
    }

    return (
      <VerifyRecoveryStep
        mnemonic={mnemonic}
        onDone={handleDone}
      />
    );
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        variants={stepVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={stepTransition}
        style={{ flex: 1 }}
      >
        {renderStep()}
      </motion.div>
    </AnimatePresence>
  );
}

