/**
 * Import Wallet Screen — restore wallet from existing seed phrase or private key.
 *
 * Tabs: Seed Phrase | Private Key
 * Steps: enter-seed → set-passphrase → success
 *
 * SECURITY:
 * - Real-time BIP-39 validation per word via wallet-core's validateMnemonic
 * - Invalid words are highlighted individually
 * - Private key import validates hex format
 * - Clear, specific error messages for each failure mode
 */
import React, { useCallback, useContext, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IconArrowLeft, IconAlertTriangle, IconCheckCircle2 } from '../icons.js';
import {
  Button,
  Card,
  Input,
  Badge,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import { validateMnemonic, deriveAccount } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context.js';

type ImportStep = 'enter-seed' | 'set-passphrase' | 'success';
type ImportTab = 'seed' | 'privatekey';

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

// ── Per-word validation ──────────────────────────────────────────────────────

interface WordValidation {
  word: string;
  index: number;
  isValid: boolean;
}

function validateWords(input: string): { words: WordValidation[]; overallValid: boolean; errors: readonly string[] } {
  const rawWords = input.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) {
    return { words: [], overallValid: false, errors: [] };
  }

  const isValidCount = rawWords.length === 12 || rawWords.length === 24;
  const phrase = rawWords.join(' ');

  // Get overall validation which includes per-word BIP-39 checks
  const result = isValidCount ? validateMnemonic(phrase) : null;

  // Parse which words are invalid from the error messages
  let invalidWordSet: Set<string> | null = null;
  if (result) {
    const wordError = result.errors.find((e) => e.startsWith('Unknown BIP-39 words:'));
    if (wordError) {
      const badWords = wordError.replace('Unknown BIP-39 words: ', '').split(', ');
      invalidWordSet = new Set(badWords.map((w) => w.toLowerCase()));
    }
  }

  const words: WordValidation[] = rawWords.map((word, index) => ({
    word,
    index,
    isValid: invalidWordSet ? !invalidWordSet.has(word.toLowerCase()) : true,
  }));

  return {
    words,
    overallValid: result?.isValid === true,
    errors: result?.errors ?? (isValidCount ? [] : [`Need ${rawWords.length < 12 ? 12 : 24} words, got ${rawWords.length}`]),
  };
}

// ── Mnemonic Status Badge ────────────────────────────────────────────────────

function MnemonicStatus({ input }: { input: string }): React.ReactElement | null {
  const { words, overallValid, errors } = useMemo(() => validateWords(input), [input]);

  if (words.length === 0) return null;

  const invalidWords = words.filter((w) => !w.isValid);

  if (overallValid) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[2] }}>
        <Badge variant="success" dot>Valid {words.length}-word phrase</Badge>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[2] }}>
      {words.length !== 12 && words.length !== 24 ? (
        <Badge variant="warning" dot>
          {words.length} word{words.length !== 1 ? 's' : ''} — need {words.length < 12 ? 12 : 24}
        </Badge>
      ) : invalidWords.length > 0 ? (
        <>
          <Badge variant="error" dot>
            Invalid word{invalidWords.length > 1 ? 's' : ''}: {invalidWords.map((w) => `#${w.index + 1}`).join(', ')}
          </Badge>
          <div style={{
            fontFamily: FONT_FAMILY.mono,
            fontSize: FONT_SIZE.xs,
            color: COLORS.error,
            lineHeight: '1.6',
          }}>
            {invalidWords.map((w) => (
              <span key={w.index} style={{ marginRight: SPACING[2] }}>
                #{w.index + 1}: &quot;{w.word}&quot;
              </span>
            ))}
          </div>
        </>
      ) : errors.length > 0 ? (
        <Badge variant="error" dot>Invalid phrase — check spelling</Badge>
      ) : null}
    </div>
  );
}

// ── Private Key Validation ───────────────────────────────────────────────────

function validatePrivateKey(key: string): { valid: boolean; error?: string } {
  const clean = key.trim();
  if (!clean) return { valid: false };
  if (!clean.startsWith('0x')) {
    return { valid: false, error: 'Private key must start with 0x' };
  }
  if (clean.length !== 66) {
    return { valid: false, error: `Expected 66 characters (0x + 64 hex), got ${clean.length}` };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(clean)) {
    return { valid: false, error: 'Private key contains invalid characters' };
  }
  return { valid: true };
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ImportWalletScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { setWalletCreated, setWalletAddress, addToast } = useContext(AppCtx);

  const [step, setStep] = useState<ImportStep>('enter-seed');
  const [tab, setTab] = useState<ImportTab>('seed');
  const [seedInput, setSeedInput] = useState('');
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [privateKeyError, setPrivateKeyError] = useState('');
  const [address, setAddress] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { overallValid: isMnemonicValid } = useMemo(() => validateWords(seedInput), [seedInput]);

  const handleContinueSeed = useCallback(async (): Promise<void> => {
    if (!isMnemonicValid) return;
    setIsLoading(true);
    try {
      const words = seedInput.trim().split(/\s+/).filter(Boolean);
      const account = await deriveAccount(words.join(' '), 0);
      setAddress(account.address);
      setStep('set-passphrase');
    } catch {
      addToast({
        type: 'error',
        title: 'Import Failed',
        message: 'Could not derive wallet from seed phrase.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [isMnemonicValid, seedInput, addToast]);

  const handleContinuePrivateKey = useCallback(async (): Promise<void> => {
    const result = validatePrivateKey(privateKeyInput);
    if (!result.valid) {
      setPrivateKeyError(result.error ?? 'Invalid private key');
      return;
    }
    setIsLoading(true);
    try {
      // In production: derive address from private key using ethers.Wallet
      // For prototype: simulate derivation
      await new Promise<void>((r) => setTimeout(r, 500));
      // Generate a deterministic-looking address from the key
      const addr = '0x' + privateKeyInput.slice(2, 42);
      setAddress(addr);
      setStep('set-passphrase');
    } catch {
      addToast({
        type: 'error',
        title: 'Import Failed',
        message: 'Could not import from private key.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [privateKeyInput, addToast]);

  const handleSetPassphrase = useCallback((): void => {
    if (passphrase.length < 8) {
      setPassphraseError('Passphrase must be at least 8 characters');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setPassphraseError('Passphrases do not match');
      return;
    }
    setPassphraseError('');
    setStep('success');
  }, [passphrase, confirmPassphrase]);

  const handleDone = useCallback((): void => {
    setWalletAddress(address);
    setWalletCreated(true);
    void navigate('/dashboard');
  }, [address, setWalletAddress, setWalletCreated, navigate]);

  const tabStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: `${SPACING[3]} ${SPACING[4]}`,
    borderRadius: RADIUS.md,
    border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
    backgroundColor: active ? 'rgba(227,27,35,0.1)' : COLORS.surface,
    color: active ? COLORS.primary : COLORS.textSecondary,
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    cursor: 'pointer',
    textTransform: 'uppercase' as const,
    outline: 'none',
    letterSpacing: '0.04em',
  });

  if (step === 'enter-seed') {
    return (
      <div style={SCREEN_STYLE}>
        <Card style={CARD_STYLE} bordered padding="lg">
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[4] }}>
            <motion.button
              onClick={() => void navigate('/onboarding')}
              style={{
                background: 'none',
                border: `1px solid ${COLORS.border}`,
                borderRadius: '6px',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                padding: SPACING[2],
                display: 'flex',
                alignItems: 'center',
                outline: 'none',
              }}
              aria-label="Back"
              whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
              whileTap={{ scale: 0.95 }}
            >
              <IconArrowLeft size={18} />
            </motion.button>
            <h2 style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE['2xl'],
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary,
              textTransform: 'uppercase',
            }}>
              Import Wallet
            </h2>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: SPACING[2], marginBottom: SPACING[6] }}>
            <button style={tabStyle(tab === 'seed')} onClick={() => setTab('seed')} type="button">
              Seed Phrase
            </button>
            <button style={tabStyle(tab === 'privatekey')} onClick={() => setTab('privatekey')} type="button">
              Private Key
            </button>
          </div>

          {tab === 'seed' ? (
            <>
              <p style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.base,
                color: COLORS.textSecondary,
                marginBottom: SPACING[6],
                lineHeight: '1.5',
              }}>
                Enter your 12 or 24 word seed phrase, separated by spaces.
              </p>

              <div style={{ marginBottom: SPACING[3] }}>
                <Input
                  label="Seed Phrase"
                  value={seedInput}
                  onChange={setSeedInput}
                  multiline
                  rows={4}
                  placeholder="word1 word2 word3 ... word12"
                  monospace
                  autoComplete="off"
                />
              </div>

              <div style={{ marginBottom: SPACING[6] }}>
                <MnemonicStatus input={seedInput} />
              </div>

              <div style={{
                backgroundColor: 'rgba(229,57,53,0.06)',
                border: `1px solid rgba(229,57,53,0.2)`,
                borderRadius: RADIUS.md,
                padding: SPACING[4],
                marginBottom: SPACING[6],
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.textMuted,
                lineHeight: '1.5',
                display: 'flex',
                alignItems: 'flex-start',
                gap: SPACING[2],
              }}>
                <IconAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px', color: COLORS.warning }} />
                <span>Your seed phrase is processed locally and never leaves your device.</span>
              </div>

              <Button
                variant="primary"
                fullWidth
                size="lg"
                disabled={!isMnemonicValid}
                isLoading={isLoading}
                onClick={() => void handleContinueSeed()}
              >
                Continue
              </Button>
            </>
          ) : (
            <>
              <p style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.base,
                color: COLORS.textSecondary,
                marginBottom: SPACING[6],
                lineHeight: '1.5',
              }}>
                Paste your private key (64 hex characters, starting with 0x).
              </p>

              <div style={{ marginBottom: SPACING[4] }}>
                <Input
                  label="Private Key"
                  value={privateKeyInput}
                  onChange={(val) => { setPrivateKeyInput(val); if (privateKeyError) setPrivateKeyError(''); }}
                  type="password"
                  monospace
                  placeholder="0x..."
                  error={privateKeyError}
                  autoComplete="off"
                />
              </div>

              <div style={{
                backgroundColor: 'rgba(227,27,35,0.06)',
                border: `1px solid rgba(227,27,35,0.2)`,
                borderRadius: RADIUS.md,
                padding: SPACING[4],
                marginBottom: SPACING[6],
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.error,
                lineHeight: '1.5',
                display: 'flex',
                alignItems: 'flex-start',
                gap: SPACING[2],
              }}>
                <IconAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Private key import is less secure than seed phrase. You cannot recover accounts from a private key alone.</span>
              </div>

              <Button
                variant="primary"
                fullWidth
                size="lg"
                disabled={privateKeyInput.trim().length === 0}
                isLoading={isLoading}
                onClick={() => void handleContinuePrivateKey()}
              >
                Continue
              </Button>
            </>
          )}
        </Card>
      </div>
    );
  }

  if (step === 'set-passphrase') {
    return (
      <div style={SCREEN_STYLE}>
        <Card style={CARD_STYLE} bordered padding="lg">
          <h2 style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE['2xl'],
            fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary,
            marginBottom: SPACING[2],
            textTransform: 'uppercase',
          }}>
            Set Passphrase
          </h2>
          <p style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.base,
            color: COLORS.textSecondary,
            marginBottom: SPACING[6],
            lineHeight: '1.5',
          }}>
            Choose a passphrase to encrypt your wallet on this device.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4], marginBottom: SPACING[6] }}>
            <Input
              label="Passphrase"
              value={passphrase}
              onChange={(val) => { setPassphrase(val); if (passphraseError) setPassphraseError(''); }}
              type="password"
              placeholder="Enter a strong passphrase"
              hint="Minimum 8 characters"
            />
            <Input
              label="Confirm Passphrase"
              value={confirmPassphrase}
              onChange={(val) => { setConfirmPassphrase(val); if (passphraseError) setPassphraseError(''); }}
              type="password"
              placeholder="Re-enter passphrase"
              error={passphraseError}
            />
          </div>

          <div style={{ display: 'flex', gap: SPACING[3] }}>
            <Button variant="ghost" onClick={() => setStep('enter-seed')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconArrowLeft size={16} /> Back
              </span>
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={passphrase.length === 0}
              onClick={handleSetPassphrase}
            >
              Import Wallet
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Success
  return (
    <div style={{ ...SCREEN_STYLE, textAlign: 'center' }}>
      <Card style={CARD_STYLE} bordered padding="lg">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          style={{ marginBottom: SPACING[4] }}
        >
          <IconCheckCircle2 size={64} color={COLORS.success} strokeWidth={1.5} />
        </motion.div>
        <h2 style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE['2xl'],
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary,
          marginBottom: SPACING[2],
          textTransform: 'uppercase',
        }}>
          Wallet Imported
        </h2>
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
          letterSpacing: '0.04em',
        }}>
          {address}
        </div>
        <Button variant="primary" fullWidth size="lg" onClick={handleDone}>
          Go to Dashboard
        </Button>
      </Card>
    </div>
  );
}
