/**
 * Onboarding Screen — Create new wallet flow (extension popup).
 * Steps: welcome -> show-seed -> verify-seed -> set-passphrase -> success
 */
import React, { useContext, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconShield, IconImport, IconAlertTriangle, IconEye,
  IconCheckCircle2, IconArrowLeft, IconChevronRight,
} from '../icons';
import {
  Button, Card, Input, SeedPhraseGrid, COLORS,
  FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import { generateMnemonic, deriveAccount } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context';

type OnboardingStep = 'welcome' | 'show-seed' | 'verify-seed' | 'set-passphrase' | 'success' | 'import-seed';

const SCREEN: CSSProperties = {
  minHeight: '600px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.background,
  padding: SPACING[4],
};

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

function WelcomeStep({ onCreateNew, onImport }: { onCreateNew: () => void; onImport: () => void }): React.ReactElement {
  return (
    <div style={{ ...SCREEN, gap: SPACING[6] }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE['2xl'],
          fontWeight: FONT_WEIGHT.extrabold, color: COLORS.textPrimary,
          letterSpacing: '-0.02em',
        }}>
          SAIKO WALLET
        </h1>
        <p style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
          color: COLORS.textSecondary, marginTop: SPACING[1],
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          YOUR KEYS. YOUR TERRITORY.
        </p>
      </div>
      <Card style={{ width: '100%' }} bordered padding="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3] }}>
          <Button variant="primary" fullWidth size="lg" onClick={onCreateNew}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <IconShield size={18} /> FORGE NEW WALLET
            </span>
          </Button>
          <Button variant="secondary" fullWidth size="lg" onClick={onImport}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <IconImport size={18} /> IMPORT EXISTING WALLET
            </span>
          </Button>
        </div>
        <p style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
          color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING[4],
        }}>
          No accounts. No servers. Total sovereignty.
        </p>
      </Card>
    </div>
  );
}

function ShowSeedStep({ mnemonic, onNext }: { mnemonic: readonly string[]; onNext: () => void }): React.ReactElement {
  const [confirmed, setConfirmed] = useState(false);
  const [blurred, setBlurred] = useState(true);

  return (
    <div style={{ ...SCREEN, gap: SPACING[4], justifyContent: 'flex-start', paddingTop: SPACING[4] }}>
      <h2 style={{
        fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
        color: COLORS.textPrimary, textTransform: 'uppercase', textAlign: 'center',
      }}>
        SECRET RECOVERY PHRASE
      </h2>
      <p style={{
        fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary,
        textAlign: 'center', lineHeight: '1.4',
      }}>
        Write these words down. Anyone with this phrase controls your wallet.
      </p>
      <div style={{
        backgroundColor: `${COLORS.error}10`, border: `1px solid ${COLORS.error}4D`,
        borderRadius: RADIUS.md, padding: SPACING[3],
        fontFamily: FONT_FAMILY.sans, fontSize: '12px', color: COLORS.warning,
        display: 'flex', alignItems: 'center', gap: SPACING[2], width: '100%',
      }}>
        <IconAlertTriangle size={14} style={{ flexShrink: 0 }} />
        <span>Make sure no one is watching your screen.</span>
      </div>
      <div style={{ position: 'relative', width: '100%' }}>
        <SeedPhraseGrid words={mnemonic} mode="display" blurred={blurred} />
        {blurred && (
          <div onClick={() => setBlurred(false)} style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(10,10,10,0.6)', borderRadius: RADIUS.md, cursor: 'pointer',
          }}>
            <span style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
              color: COLORS.textPrimary, fontWeight: FONT_WEIGHT.semibold,
              display: 'flex', alignItems: 'center', gap: SPACING[2],
            }}>
              <IconEye size={18} /> Click to reveal
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACING[2], width: '100%' }}>
        <input type="checkbox" id="confirm-backup" checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)}
          style={{ marginTop: '3px', accentColor: COLORS.primary, flexShrink: 0 }} />
        <label htmlFor="confirm-backup" style={{
          fontFamily: FONT_FAMILY.sans, fontSize: '12px', color: COLORS.textSecondary,
          cursor: 'pointer', lineHeight: '1.4',
        }}>
          I have written down my seed phrase and stored it safely offline.
        </label>
      </div>
      <Button variant="primary" fullWidth disabled={!confirmed || blurred} onClick={onNext}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
          Continue <IconChevronRight size={16} />
        </span>
      </Button>
    </div>
  );
}

function pickVerifyPositions(count: number, total: number): number[] {
  const positions = Array.from({ length: total }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  return positions.slice(0, count).sort((a, b) => a - b);
}

function VerifySeedStep({
  mnemonic, onNext, onBack,
}: {
  mnemonic: readonly string[]; onNext: () => void; onBack: () => void;
}): React.ReactElement {
  const [verifyPositions] = useState(() => pickVerifyPositions(3, mnemonic.length));
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [hasError, setHasError] = useState(false);

  const handleVerify = useCallback((): void => {
    const ok = verifyPositions.every(pos => answers[pos] === mnemonic[pos]);
    if (ok) onNext(); else setHasError(true);
  }, [verifyPositions, answers, mnemonic, onNext]);

  const allFilled = verifyPositions.every(pos => (answers[pos] ?? '').length > 0);

  return (
    <div style={{ ...SCREEN, gap: SPACING[4], justifyContent: 'flex-start', paddingTop: SPACING[6] }}>
      <h2 style={{
        fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
        color: COLORS.textPrimary, textTransform: 'uppercase',
      }}>
        VERIFY YOUR PHRASE
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], width: '100%' }}>
        {verifyPositions.map(pos => (
          <Input key={pos} label={`Word #${pos + 1}`} value={answers[pos] ?? ''}
            onChange={val => { setAnswers(prev => ({ ...prev, [pos]: val.toLowerCase().trim() })); setHasError(false); }}
            monospace placeholder={`Enter word ${pos + 1}`} autoComplete="off"
            {...(hasError && (answers[pos] ?? '') !== mnemonic[pos] ? { error: 'Incorrect word' } : {})} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: SPACING[3], width: '100%' }}>
        <Button variant="ghost" onClick={onBack}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <IconArrowLeft size={14} /> Back
          </span>
        </Button>
        <Button variant="primary" fullWidth disabled={!allFilled} onClick={handleVerify}>
          Verify
        </Button>
      </div>
    </div>
  );
}

function SetPassphraseStep({
  onNext, onBack, isEncrypting,
}: {
  onNext: (passphrase: string) => void; onBack: () => void; isEncrypting?: boolean;
}): React.ReactElement {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ passphrase?: string; confirm?: string }>({});

  const handleSubmit = useCallback((): void => {
    const errs: typeof errors = {};
    if (passphrase.length < 8) errs.passphrase = 'Minimum 8 characters';
    if (passphrase !== confirm) errs.confirm = 'Passphrases do not match';
    setErrors(errs);
    if (Object.keys(errs).length === 0) onNext(passphrase);
  }, [passphrase, confirm, onNext]);

  return (
    <div style={{ ...SCREEN, gap: SPACING[4], justifyContent: 'flex-start', paddingTop: SPACING[6] }}>
      <h2 style={{
        fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
        color: COLORS.textPrimary, textTransform: 'uppercase',
      }}>
        SET YOUR PASSPHRASE
      </h2>
      <p style={{
        fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary,
        textAlign: 'center', lineHeight: '1.4',
      }}>
        Encrypts your wallet on this device. You need it every time you unlock.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], width: '100%' }}>
        <Input label="Passphrase" value={passphrase} onChange={setPassphrase}
          type="password" placeholder="Enter a strong passphrase" {...(errors.passphrase ? { error: errors.passphrase } : {})} />
        <Input label="Confirm" value={confirm} onChange={setConfirm}
          type="password" placeholder="Re-enter your passphrase" {...(errors.confirm ? { error: errors.confirm } : {})} />
      </div>
      <div style={{ display: 'flex', gap: SPACING[3], width: '100%' }}>
        <Button variant="ghost" onClick={onBack}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <IconArrowLeft size={14} /> Back
          </span>
        </Button>
        <Button variant="primary" fullWidth disabled={passphrase.length === 0 || !!isEncrypting}
          {...(isEncrypting ? { isLoading: true } : {})} onClick={handleSubmit}>
          {isEncrypting ? 'Securing...' : 'Create Wallet'}
        </Button>
      </div>
    </div>
  );
}

function SuccessStep({ address, onDone }: { address: string; onDone: () => void }): React.ReactElement {
  return (
    <div style={{ ...SCREEN, gap: SPACING[4] }}>
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        <IconCheckCircle2 size={56} color={COLORS.success} strokeWidth={1.5} />
      </motion.div>
      <h2 style={{
        fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
        color: COLORS.textPrimary, textTransform: 'uppercase',
      }}>
        WALLET CREATED
      </h2>
      <div style={{
        fontFamily: FONT_FAMILY.mono, fontSize: '11px', color: COLORS.textMuted,
        backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.md, padding: SPACING[3], wordBreak: 'break-all',
        width: '100%', textAlign: 'center',
      }}>
        {address}
      </div>
      <Button variant="primary" fullWidth size="lg" onClick={onDone}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
          Go to Dashboard <IconChevronRight size={16} />
        </span>
      </Button>
    </div>
  );
}

function ImportSeedStep({ onNext, onBack }: { onNext: (phrase: string) => void; onBack: () => void }): React.ReactElement {
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState('');

  const handleNext = useCallback(() => {
    const words = phrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError('Please enter a valid 12 or 24-word seed phrase.');
      return;
    }
    setError('');
    onNext(phrase.trim());
  }, [phrase, onNext]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: SPACING[4], gap: SPACING[4] }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: SPACING[1], fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, alignSelf: 'flex-start' }}>
        <IconArrowLeft size={16} /> Back
      </button>
      <div>
        <h2 style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary }}>
          Import Wallet
        </h2>
        <p style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginTop: SPACING[1] }}>
          Enter your 12 or 24-word seed phrase
        </p>
      </div>
      <textarea
        value={phrase}
        onChange={e => { setPhrase(e.target.value); setError(''); }}
        placeholder="Enter seed phrase words separated by spaces..."
        rows={5}
        style={{
          width: '100%', padding: SPACING[3], borderRadius: RADIUS.md,
          backgroundColor: '#1A1A1A', border: `1px solid ${error ? COLORS.error : '#2A2A2A'}`,
          color: COLORS.textPrimary, fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
          resize: 'none', outline: 'none', boxSizing: 'border-box',
        }}
      />
      {error && (
        <p style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.error }}>{error}</p>
      )}
      <Button variant="primary" fullWidth size="lg" onClick={handleNext} disabled={phrase.trim().length === 0}>
        Continue
      </Button>
    </div>
  );
}

export function OnboardingScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { setWalletCreated, setWalletAddress, setSessionMnemonic, addToast } = useContext(AppCtx);

  const isImportRoute = location.pathname === '/import';
  const [step, setStep] = useState<OnboardingStep>(isImportRoute ? 'import-seed' : 'welcome');
  const [mnemonic, setMnemonic] = useState<readonly string[]>([]);
  const [address, setAddress] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);

  const handleCreateNew = useCallback(async (): Promise<void> => {
    try {
      const result = generateMnemonic(24);
      const account = deriveAccount(result.mnemonic, 0);
      setMnemonic(result.mnemonic.split(' '));
      setAddress(account.address);
      setStep('show-seed');
    } catch {
      addToast({ type: 'error', message: 'Could not generate wallet. Please try again.' });
    }
  }, [addToast]);

  const handleSetPassphrase = useCallback(async (passphraseValue: string): Promise<void> => {
    setIsEncrypting(true);
    try {
      const mnemonicStr = mnemonic.join(' ');
      // Derive address in popup (ethers lives in popup bundle, not service worker)
      let derivedAddress = address;
      if (!derivedAddress) {
        const account = deriveAccount(mnemonicStr, 0);
        derivedAddress = account.address;
        setAddress(derivedAddress);
      }
      // Encrypt in service worker (Web Crypto AES-GCM — no WASM, no ethers in SW)
      const resp = await chrome.runtime.sendMessage({
        action: 'wallet:setup',
        mnemonic: mnemonicStr,
        passphrase: passphraseValue,
        address: derivedAddress,
      }) as { ok?: boolean; address?: string; error?: string };
      if (!resp?.ok) throw new Error(resp?.error ?? 'Encryption failed');
      setSessionMnemonic(mnemonicStr);
      setStep('success');
    } catch (err) {
      addToast({ type: 'error', message: `Failed to secure wallet: ${err instanceof Error ? err.message : 'unknown error'}` });
    } finally {
      setIsEncrypting(false);
    }
  }, [mnemonic, address, addToast, setSessionMnemonic]);

  const handleImportSeed = useCallback((phrase: string): void => {
    const words = phrase.split(/\s+/);
    setMnemonic(words);
    setStep('set-passphrase');
  }, []);

  const handleDone = useCallback((): void => {
    setWalletAddress(address);
    setWalletCreated(true);
    void navigate('/dashboard');
  }, [address, setWalletAddress, setWalletCreated, navigate]);

  const renderStep = (): React.ReactElement => {
    switch (step) {
      case 'import-seed':
        return <ImportSeedStep onNext={handleImportSeed} onBack={() => navigate(isImportRoute ? '/onboarding' : '/')} />;
      case 'welcome':
        return <WelcomeStep onCreateNew={() => void handleCreateNew()} onImport={() => setStep('import-seed')} />;
      case 'show-seed':
        return <ShowSeedStep mnemonic={mnemonic} onNext={() => setStep('verify-seed')} />;
      case 'verify-seed':
        return <VerifySeedStep mnemonic={mnemonic} onNext={() => setStep('set-passphrase')} onBack={() => setStep('show-seed')} />;
      case 'set-passphrase':
        return <SetPassphraseStep onNext={p => void handleSetPassphrase(p)} onBack={() => setStep('verify-seed')} isEncrypting={isEncrypting} />;
      case 'success':
        return <SuccessStep address={address} onDone={handleDone} />;
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div key={step} variants={stepVariants}
        initial="initial" animate="animate" exit="exit"
        transition={{ duration: 0.2, ease: 'easeOut' }} style={{ flex: 1 }}>
        {renderStep()}
      </motion.div>
    </AnimatePresence>
  );
}
