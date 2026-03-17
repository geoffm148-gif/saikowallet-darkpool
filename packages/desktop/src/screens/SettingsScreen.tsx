/**
 * Settings Screen — security, network, backup, about.
 *
 * SECURITY: Backup seed phrase option requires re-authentication warning.
 * In a real implementation, viewing seed requires passphrase re-entry.
 */
import React, { useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  IconArrowLeft,
  IconShield,
  IconGlobe,
  IconKey,
  IconLock,
  IconInfo,
  IconAlertTriangle,
  IconExternalLink,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconRefreshCw,
} from '../icons.js';
import {
  Card,
  Button,
  Input,
  Badge,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  SAIKO_CONTRACT_ADDRESS,
  SAIKO_ETHERSCAN_URL,
  SAIKO_COMMUNITY,
  createEncryptedBackup,
  serializeBackup,
  encryptPayload,
  decryptPayload,
  wipeBytes,
} from '@saiko-wallet/wallet-core';
import type { EncryptedKeystore } from '@saiko-wallet/wallet-core';
import { CURRENCIES } from '../constants/currencies.js';
import { applyTorProxy, isElectron, safeDecrypt, safeEncrypt } from '../utils/electron-bridge.js';
import { AppCtx } from '../context.js';
import { NETWORKS, getActiveNetwork } from '../utils/network.js';

const APP_VERSION = '0.1.0-alpha';

// ── localStorage keys ────────────────────────────────────────────────────────

const LS_AUTO_LOCK = 'saiko_auto_lock_minutes';
const LS_AUTO_REFRESH = 'saiko_auto_refresh_seconds';
const LS_NETWORK = 'saiko_network';
const LS_CUSTOM_RPC = 'saiko_custom_rpc';
const LS_CURRENCY = 'saiko_currency';
const LS_NOTIFICATIONS = 'saiko_notif_enabled';
const LS_TOR_ENABLED = 'saiko_tor_enabled';

function readLs(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeLs(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ── Layout ───────────────────────────────────────────────────────────────────

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: SPACING[6],
  overflowY: 'auto',
};

const CONTENT_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: '640px',
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING[6],
};

// ── Shared sub-components ────────────────────────────────────────────────────

interface SettingRowProps {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  action: React.ReactNode;
}

function SettingRow({ icon, label, description, action }: SettingRowProps): React.ReactElement {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING[4],
      padding: `${SPACING[4]} 0`,
      borderBottom: `1px solid ${COLORS.divider}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACING[3] }}>
        {icon && (
          <div style={{ color: COLORS.textMuted, marginTop: '2px', flexShrink: 0 }}>
            {icon}
          </div>
        )}
        <div>
          <div style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.base,
            fontWeight: FONT_WEIGHT.medium,
            color: COLORS.textPrimary,
          }}>
            {label}
          </div>
          {description !== undefined && (
            <div style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textMuted,
              marginTop: '2px',
              lineHeight: '1.4',
            }}>
              {description}
            </div>
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        {action}
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  const trackStyle: CSSProperties = {
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    backgroundColor: value ? COLORS.primary : COLORS.border,
    position: 'relative',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    border: 'none',
    outline: 'none',
  };
  const thumbStyle: CSSProperties = {
    position: 'absolute',
    top: '2px',
    left: value ? '22px' : '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    transition: 'left 0.2s ease',
  };
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={trackStyle}
    >
      <div style={thumbStyle} />
    </button>
  );
}

// ── RPC URL validation ───────────────────────────────────────────────────────

function isValidRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SettingsScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { setLocked, addToast, activeNetworkId, setActiveNetworkId } = useContext(AppCtx);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => readLs(LS_NOTIFICATIONS, 'false') === 'true');

  // Persisted settings
  const [autoLockMinutes, setAutoLockMinutes] = useState(() => readLs(LS_AUTO_LOCK, '5'));
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState(() => readLs(LS_AUTO_REFRESH, '0'));
  const [selectedNetwork, setSelectedNetwork] = useState(() => readLs(LS_NETWORK, 'mainnet'));
  const [customRpc, setCustomRpc] = useState(() => readLs(LS_CUSTOM_RPC, ''));
  const [customRpcError, setCustomRpcError] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState(() => readLs(LS_CURRENCY, 'USD'));
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);

  // UI state
  const [showSeedWarning, setShowSeedWarning] = useState(false);
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [seedCountdown, setSeedCountdown] = useState(60);
  const seedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [torEnabled, setTorEnabled] = useState(() => readLs(LS_TOR_ENABLED, 'false') === 'true');

  // Seed passphrase re-auth
  const [showSeedPassphrasePrompt, setShowSeedPassphrasePrompt] = useState(false);
  const [seedPassphraseAttempt, setSeedPassphraseAttempt] = useState('');
  const [isDecryptingSeed, setIsDecryptingSeed] = useState(false);

  // Change passphrase
  const [showChangePassphrase, setShowChangePassphrase] = useState(false);
  const [cpCurrentPass, setCpCurrentPass] = useState('');
  const [cpNewPass, setCpNewPass] = useState('');
  const [cpConfirmPass, setCpConfirmPass] = useState('');
  const [cpError, setCpError] = useState('');
  const [cpLoading, setCpLoading] = useState(false);

  // Backup export — H-6: separate backup passphrase (not wallet passphrase)
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [backupWalletPassphrase, setBackupWalletPassphrase] = useState('');
  const [backupNewPassphrase, setBackupNewPassphrase] = useState('');
  const [backupNewPassphraseConfirm, setBackupNewPassphraseConfirm] = useState('');
  const [backupError, setBackupError] = useState('');
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  // Persist auto-lock on change
  useEffect(() => {
    writeLs(LS_AUTO_LOCK, autoLockMinutes);
  }, [autoLockMinutes]);

  // Persist auto-refresh on change
  useEffect(() => {
    writeLs(LS_AUTO_REFRESH, autoRefreshSeconds);
  }, [autoRefreshSeconds]);

  // Persist network on change
  useEffect(() => {
    writeLs(LS_NETWORK, selectedNetwork);
  }, [selectedNetwork]);

  useEffect(() => {
    writeLs(LS_CURRENCY, selectedCurrency);
  }, [selectedCurrency]);

  // Persist Tor preference
  useEffect(() => {
    writeLs(LS_TOR_ENABLED, String(torEnabled));
  }, [torEnabled]);

  // Apply saved Tor proxy setting on startup
  useEffect(() => { void applyTorProxy(torEnabled) }, []);

  const handleLockNow = useCallback((): void => {
    setLocked(true);
    void navigate('/unlock');
  }, [setLocked, navigate]);

  const handleShowSeed = useCallback((): void => {
    setShowSeedWarning(true);
  }, []);

  const handleRequestShowSeed = useCallback((): void => {
    setShowSeedPassphrasePrompt(true);
    setSeedPassphraseAttempt('');
  }, []);

  const handleConfirmShowSeed = useCallback(async (passphraseAttempt: string): Promise<void> => {
    setIsDecryptingSeed(true);
    try {
      const keystoreRaw = localStorage.getItem('saiko_keystore');
      let mnemonic: string;
      if (keystoreRaw) {
        const keystoreJson = await safeDecrypt(keystoreRaw);
        const keystore = JSON.parse(keystoreJson) as EncryptedKeystore;
        const plaintextBytes = await decryptPayload(keystore, passphraseAttempt);
        mnemonic = new TextDecoder().decode(plaintextBytes);
        wipeBytes(plaintextBytes);
      } else {
        // Legacy fallback
        mnemonic = localStorage.getItem('saiko_mnemonic') ?? '';
        if (!mnemonic) throw new Error('No wallet found');
      }
      const words = mnemonic.trim().split(/\s+/);
      setSeedWords(words);
      setShowSeedPhrase(true);
      setShowSeedWarning(false);
      setShowSeedPassphrasePrompt(false);
      setSeedPassphraseAttempt('');
      setSeedCountdown(60);
      if (seedTimerRef.current) clearInterval(seedTimerRef.current);
      seedTimerRef.current = setInterval(() => {
        setSeedCountdown((prev) => {
          if (prev <= 1) {
            setShowSeedPhrase(false);
            setSeedWords([]);
            if (seedTimerRef.current) clearInterval(seedTimerRef.current);
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      addToast({ type: 'error', message: 'Incorrect passphrase.' });
    } finally {
      setIsDecryptingSeed(false);
    }
  }, [addToast]);

  const handleHideSeed = useCallback((): void => {
    setShowSeedPhrase(false);
    setSeedWords([]);
    if (seedTimerRef.current) clearInterval(seedTimerRef.current);
  }, []);

  const handleChangePassphrase = useCallback(async (): Promise<void> => {
    setCpError('');
    if (cpNewPass.length < 8) {
      setCpError('New passphrase must be at least 8 characters.');
      return;
    }
    if (cpNewPass !== cpConfirmPass) {
      setCpError('New passphrases do not match.');
      return;
    }
    setCpLoading(true);
    try {
      const keystoreRaw = localStorage.getItem('saiko_keystore');
      if (!keystoreRaw) throw new Error('No keystore found');
      let keystoreJson: string;
      try {
        keystoreJson = await safeDecrypt(keystoreRaw);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'SAFESTORAGE_UNAVAILABLE') {
          setCpError('OS-level wallet encryption is unavailable. Please recover your wallet using your seed phrase.');
          return;
        }
        throw e;
      }
      const keystore = JSON.parse(keystoreJson) as EncryptedKeystore;
      const plaintextBytes = await decryptPayload(keystore, cpCurrentPass);
      const mnemonic = new TextDecoder().decode(plaintextBytes);
      const newKeystore = await encryptPayload(new TextEncoder().encode(mnemonic), cpNewPass);
      const encrypted = await safeEncrypt(JSON.stringify(newKeystore));
      localStorage.setItem('saiko_keystore', encrypted);
      wipeBytes(plaintextBytes);
      setShowChangePassphrase(false);
      setCpCurrentPass('');
      setCpNewPass('');
      setCpConfirmPass('');
      setCpError('');
      addToast({ type: 'success', message: 'Passphrase updated successfully.' });
    } catch {
      setCpError('Incorrect current passphrase.');
    } finally {
      setCpLoading(false);
    }
  }, [cpCurrentPass, cpNewPass, cpConfirmPass, addToast]);

  const handleSaveRpc = useCallback((): void => {
    const url = customRpc.trim();
    if (url === '') {
      writeLs(LS_CUSTOM_RPC, '');
      setCustomRpcError('');
      addToast({ type: 'success', message: 'Custom RPC cleared. Using default providers.' });
      return;
    }
    if (!isValidRpcUrl(url)) {
      setCustomRpcError('Enter a valid URL starting with https:// or http://');
      return;
    }
    writeLs(LS_CUSTOM_RPC, url);
    setCustomRpcError('');
    addToast({ type: 'success', message: 'Custom RPC endpoint saved.' });
  }, [customRpc, addToast]);

  const handleShowBackupPrompt = useCallback((): void => {
    setShowBackupPrompt(true);
    setBackupWalletPassphrase('');
    setBackupNewPassphrase('');
    setBackupNewPassphraseConfirm('');
    setBackupError('');
  }, []);

  const handleExportBackup = useCallback(async (walletPass: string, backupPass: string): Promise<void> => {
    setIsCreatingBackup(true);
    try {
      // Decrypt keystore to get mnemonic (using wallet passphrase)
      const keystoreRaw = localStorage.getItem('saiko_keystore');
      let mnemonic: string;
      if (keystoreRaw) {
        const keystoreJson = await safeDecrypt(keystoreRaw);
        const keystore = JSON.parse(keystoreJson) as EncryptedKeystore;
        const plaintextBytes = await decryptPayload(keystore, walletPass);
        mnemonic = new TextDecoder().decode(plaintextBytes);
        wipeBytes(plaintextBytes);
      } else {
        mnemonic = localStorage.getItem('saiko_mnemonic') ?? '';
        if (!mnemonic) throw new Error('No wallet found');
      }

      // H-6: Create encrypted backup with the separate backup passphrase
      const seedBytes = new TextEncoder().encode(mnemonic);
      const backup = await createEncryptedBackup(seedBytes, backupPass);
      // H-6: Wipe seedBytes after backup creation
      wipeBytes(seedBytes);
      const serialized = serializeBackup(backup);

      // Trigger download
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `saiko-backup-${timestamp}.json`;
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowBackupPrompt(false);
      setBackupWalletPassphrase('');
      setBackupNewPassphrase('');
      setBackupNewPassphraseConfirm('');
      setBackupError('');
      addToast({ type: 'success', title: 'Backup Exported', message: `Saved as ${filename}` });
    } catch {
      addToast({ type: 'error', message: 'Incorrect wallet passphrase or backup failed.' });
    } finally {
      setIsCreatingBackup(false);
    }
  }, [addToast]);

  const AUTO_LOCK_OPTIONS = [
    { value: '1', label: '1 minute' },
    { value: '5', label: '5 minutes' },
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '0', label: 'Never (not recommended)' },
  ];

  const AUTO_REFRESH_OPTIONS = [
    { value: '0', label: 'Off (manual only)' },
    { value: '15', label: 'Every 15 seconds' },
    { value: '30', label: 'Every 30 seconds' },
    { value: '60', label: 'Every minute' },
    { value: '300', label: 'Every 5 minutes' },
  ];

  const NETWORK_OPTIONS = NETWORKS.map((n) => ({
    value: n.id,
    label: n.name,
    isTestnet: n.isTestnet,
  }));

  const selectStyle: CSSProperties = {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.md,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    padding: `${SPACING[2]} ${SPACING[3]}`,
    cursor: 'pointer',
    outline: 'none',
    minWidth: '140px',
  };

  return (
    <div style={PAGE_STYLE}>
      <div style={CONTENT_STYLE}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[4] }}>
          <motion.button
            onClick={() => void navigate('/dashboard')}
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
            <IconArrowLeft size={20} />
          </motion.button>
          <h1 style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE['2xl'],
            fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary,
            margin: 0,
            textTransform: 'uppercase',
          }}>
            SETTINGS
          </h1>
        </div>

        {/* General */}
        <Card title="General">
          <SettingRow
            icon={<IconKey size={16} />}
            label="Address Book"
            description="Manage saved contacts for quick sending"
            action={
              <Button variant="secondary" size="sm" onClick={() => void navigate('/contacts')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Open <IconChevronRight size={14} />
                </span>
              </Button>
            }
          />
          <SettingRow
            icon={<IconInfo size={16} />}
            label="Notifications"
            description={notificationsEnabled ? 'Browser notifications enabled' : 'Browser notifications disabled'}
            action={
              <Toggle
                value={notificationsEnabled}
                onChange={(v) => {
                  if (v && 'Notification' in window && Notification.permission !== 'granted') {
                    void Notification.requestPermission().then((perm) => {
                      if (perm === 'granted') {
                        setNotificationsEnabled(true);
                        writeLs(LS_NOTIFICATIONS, 'true');
                        addToast({ type: 'success', message: 'Notifications enabled.' });
                      } else {
                        addToast({ type: 'warning', message: 'Notification permission denied by browser.' });
                      }
                    });
                  } else {
                    setNotificationsEnabled(v);
                    writeLs(LS_NOTIFICATIONS, String(v));
                    addToast({ type: 'info', message: v ? 'Notifications enabled.' : 'Notifications disabled.' });
                  }
                }}
              />
            }
          />
        </Card>

        {/* Security */}
        <Card title="Security">
          <SettingRow
            icon={<IconLock size={16} />}
            label="Lock Wallet"
            description="Lock immediately and require passphrase to re-open"
            action={
              <Button variant="danger" size="sm" onClick={handleLockNow}>
                Lock Now
              </Button>
            }
          />
          <SettingRow
            icon={<IconLock size={16} />}
            label="Auto-Lock Timer"
            description="Automatically lock wallet after inactivity"
            action={
              <select
                value={autoLockMinutes}
                onChange={(e) => setAutoLockMinutes(e.target.value)}
                style={selectStyle}
                aria-label="Auto-lock timer"
              >
                {AUTO_LOCK_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            }
          />
          <SettingRow
            icon={<IconRefreshCw size={16} />}
            label="Balance Auto-Refresh"
            description="Automatically refresh balances on the dashboard"
            action={
              <select
                value={autoRefreshSeconds}
                onChange={(e) => setAutoRefreshSeconds(e.target.value)}
                style={selectStyle}
                aria-label="Balance auto-refresh interval"
              >
                {AUTO_REFRESH_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            }
          />
          <SettingRow
            icon={<IconShield size={16} />}
            label="Change Passphrase"
            description="Update your wallet passphrase"
            action={
              <Button variant="secondary" size="sm" onClick={() => {
                setShowChangePassphrase(true);
                setCpCurrentPass('');
                setCpNewPass('');
                setCpConfirmPass('');
                setCpError('');
              }}>
                Change
              </Button>
            }
          />
          {showChangePassphrase && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                padding: SPACING[4],
                marginTop: SPACING[4],
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3] }}>
                <Input
                  label="Current Passphrase"
                  value={cpCurrentPass}
                  onChange={setCpCurrentPass}
                  type="password"
                  placeholder="Enter current passphrase"
                  disabled={cpLoading}
                  autoFocus
                />
                <Input
                  label="New Passphrase"
                  value={cpNewPass}
                  onChange={setCpNewPass}
                  type="password"
                  placeholder="Min 8 characters"
                  disabled={cpLoading}
                />
                <Input
                  label="Confirm New Passphrase"
                  value={cpConfirmPass}
                  onChange={setCpConfirmPass}
                  type="password"
                  placeholder="Re-enter new passphrase"
                  disabled={cpLoading}
                />
                {cpError && (
                  <div style={{
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.sm,
                    color: COLORS.error,
                  }}>
                    {cpError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: SPACING[3] }}>
                  <Button variant="ghost" size="sm" onClick={() => {
                    setShowChangePassphrase(false);
                    setCpCurrentPass('');
                    setCpNewPass('');
                    setCpConfirmPass('');
                    setCpError('');
                  }}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={cpLoading}
                    disabled={cpCurrentPass.length === 0 || cpNewPass.length === 0 || cpConfirmPass.length === 0 || cpLoading}
                    onClick={() => void handleChangePassphrase()}
                  >
                    {cpLoading ? 'Updating...' : 'Update Passphrase'}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
          <SettingRow
            icon={<IconGlobe size={16} />}
            label="Tor Privacy Routing"
            description={torEnabled
              ? 'Enabled — requires Tor daemon running at localhost:9050'
              : 'Route all RPC calls through Tor (requires Tor daemon)'}
            action={<Toggle value={torEnabled} onChange={(v) => {
              setTorEnabled(v);
              writeLs(LS_TOR_ENABLED, String(v));
              void applyTorProxy(v);
              addToast({ type: 'info', message: v ? 'Tor routing enabled. Ensure Tor daemon is running at localhost:9050.' : 'Tor routing disabled.' });
            }} />}
          />
          {torEnabled && (
            <div style={{
              padding: `${SPACING[2]} 0 ${SPACING[2]} ${SPACING[8]}`,
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.xs,
              color: COLORS.textMuted,
              lineHeight: '1.5',
            }}>
              {isElectron() ? 'Tor daemon required at localhost:9050. All traffic routed via SOCKS5.' : 'Full SOCKS5 routing available in the desktop app.'}
            </div>
          )}
        </Card>

        {/* Backup */}
        <Card title="Backup & Recovery">
          <SettingRow
            icon={<IconKey size={16} />}
            label="View Seed Phrase"
            description="Requires passphrase re-entry. Keep this offline and secret."
            action={
              <Button variant="danger" size="sm" onClick={handleShowSeed}>
                View Seed
              </Button>
            }
          />
          {showSeedWarning && !showSeedPhrase && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                backgroundColor: `${COLORS.error}14`,
                border: `1px solid ${COLORS.error}66`,
                borderRadius: RADIUS.md,
                padding: SPACING[4],
                marginTop: SPACING[4],
                overflow: 'hidden',
              }}
            >
              <p style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.error,
                marginBottom: SPACING[4],
                lineHeight: '1.5',
                display: 'flex',
                alignItems: 'flex-start',
                gap: SPACING[2],
              }}>
                <IconAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Never screenshot your seed phrase. Never share it with anyone — including the Saiko team. Anyone with your seed phrase can steal all your funds.</span>
              </p>
              {!showSeedPassphrasePrompt ? (
                <div style={{ display: 'flex', gap: SPACING[3] }}>
                  <Button variant="ghost" size="sm" onClick={() => setShowSeedWarning(false)}>Cancel</Button>
                  <Button variant="danger" size="sm" onClick={handleRequestShowSeed}>I Understand — Show Seed</Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], marginTop: SPACING[2] }}>
                  <p style={{
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.sm,
                    color: COLORS.textSecondary,
                  }}>
                    Enter your passphrase to reveal your seed phrase
                  </p>
                  <Input
                    label="Passphrase"
                    value={seedPassphraseAttempt}
                    onChange={setSeedPassphraseAttempt}
                    type="password"
                    placeholder="Enter your passphrase"
                    disabled={isDecryptingSeed}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: SPACING[3] }}>
                    <Button variant="ghost" size="sm" onClick={() => { setShowSeedWarning(false); setShowSeedPassphrasePrompt(false); setSeedPassphraseAttempt(''); }}>Cancel</Button>
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={isDecryptingSeed}
                      disabled={seedPassphraseAttempt.length === 0 || isDecryptingSeed}
                      onClick={() => void handleConfirmShowSeed(seedPassphraseAttempt)}
                    >
                      {isDecryptingSeed ? 'Verifying...' : 'Reveal Seed'}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
          {/* Seed phrase shown in full-screen modal below */}
          <SettingRow
            icon={<IconKey size={16} />}
            label="Export Encrypted Backup"
            description="Save encrypted backup file (requires passphrase to restore)"
            action={
              <Button variant="secondary" size="sm" onClick={handleShowBackupPrompt}>
                Export
              </Button>
            }
          />
          {showBackupPrompt && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                padding: SPACING[4],
                marginTop: SPACING[4],
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3] }}>
                <p style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.textSecondary,
                }}>
                  Enter your wallet passphrase to unlock, then set a new passphrase for the backup file.
                </p>
                <Input
                  label="Wallet Passphrase"
                  value={backupWalletPassphrase}
                  onChange={setBackupWalletPassphrase}
                  type="password"
                  placeholder="Enter your wallet passphrase"
                  disabled={isCreatingBackup}
                  autoFocus
                />
                <Input
                  label="Backup Passphrase"
                  value={backupNewPassphrase}
                  onChange={(v) => { setBackupNewPassphrase(v); setBackupError(''); }}
                  type="password"
                  placeholder="New passphrase for this backup"
                  disabled={isCreatingBackup}
                />
                <Input
                  label="Confirm Backup Passphrase"
                  value={backupNewPassphraseConfirm}
                  onChange={(v) => { setBackupNewPassphraseConfirm(v); setBackupError(''); }}
                  type="password"
                  placeholder="Re-enter backup passphrase"
                  disabled={isCreatingBackup}
                  error={backupError || undefined}
                />
              </div>
              <div style={{ display: 'flex', gap: SPACING[3], marginTop: SPACING[3] }}>
                <Button variant="ghost" size="sm" onClick={() => { setShowBackupPrompt(false); setBackupWalletPassphrase(''); setBackupNewPassphrase(''); setBackupNewPassphraseConfirm(''); setBackupError(''); }}>Cancel</Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isCreatingBackup}
                  disabled={backupWalletPassphrase.length === 0 || backupNewPassphrase.length < 8 || isCreatingBackup}
                  onClick={() => {
                    if (backupNewPassphrase !== backupNewPassphraseConfirm) {
                      setBackupError('Backup passphrases do not match.');
                      return;
                    }
                    void handleExportBackup(backupWalletPassphrase, backupNewPassphrase);
                  }}
                >
                  {isCreatingBackup ? 'Creating backup...' : 'Export Backup'}
                </Button>
              </div>
            </motion.div>
          )}
        </Card>

        {/* Network */}
        <Card title="Network">
          <SettingRow
            icon={<IconGlobe size={16} />}
            label="Currency"
            description="Local currency for fiat values"
            action={
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                  style={{
                    ...selectStyle,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: SPACING[2],
                    cursor: 'pointer',
                  }}
                >
                  {CURRENCIES.find((c) => c.code === selectedCurrency)?.symbol ?? '$'} {selectedCurrency}
                  <IconChevronDown size={14} />
                </button>
                {showCurrencyDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    backgroundColor: '#1E1E1E',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.md,
                    padding: SPACING[1],
                    zIndex: 50,
                    minWidth: '200px',
                    maxHeight: '280px',
                    overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    {CURRENCIES.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => { setSelectedCurrency(c.code); setShowCurrencyDropdown(false); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: `${SPACING[2]} ${SPACING[3]}`,
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: RADIUS.sm,
                          color: selectedCurrency === c.code ? COLORS.textPrimary : COLORS.textSecondary,
                          fontFamily: FONT_FAMILY.sans,
                          fontSize: FONT_SIZE.sm,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = COLORS.surface; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                      >
                        <span>{c.symbol} {c.name}</span>
                        {selectedCurrency === c.code && <IconCheck size={14} style={{ color: COLORS.primary }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            }
          />
          <SettingRow
            icon={<IconGlobe size={16} />}
            label="Network"
            description="Select which Ethereum network to connect to"
            action={
              <select
                value={activeNetworkId}
                onChange={(e) => {
                  setActiveNetworkId(e.target.value);
                  setSelectedNetwork(e.target.value);
                  addToast({ type: 'info', message: `Switched to ${NETWORKS.find(n => n.id === e.target.value)?.name ?? e.target.value}. Refresh balances to see updated data.` });
                }}
                style={selectStyle}
                aria-label="Network selector"
              >
                {NETWORK_OPTIONS.map(({ value, label, isTestnet }) => (
                  <option key={value} value={value}>{label}{isTestnet ? ' (Testnet)' : ''}</option>
                ))}
              </select>
            }
          />
          {getActiveNetwork().isTestnet && (
            <div style={{ padding: `${SPACING[2]} 0` }}>
              <Badge variant="testnet" dot>Testnet mode active — not real funds</Badge>
            </div>
          )}
          <div style={{ padding: `${SPACING[4]} 0 0` }}>
            <Input
              label="Custom RPC Endpoint"
              value={customRpc}
              onChange={(val) => { setCustomRpc(val); if (customRpcError) setCustomRpcError(''); }}
              placeholder="https://your-node.example.com"
              hint="Leave blank to use default providers"
              error={customRpcError}
              monospace
            />
            <div style={{ marginTop: SPACING[3] }}>
              <Button variant="secondary" size="sm" onClick={handleSaveRpc}>
                Save RPC
              </Button>
            </div>
          </div>
        </Card>

        {/* Security extras */}
        <Card title="Advanced Security">
          <SettingRow
            icon={<IconShield size={16} />}
            label="Token Approvals"
            description="Review and revoke ERC-20 token approvals"
            action={
              <Button variant="secondary" size="sm" onClick={() => void navigate('/approvals')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Open <IconChevronRight size={14} />
                </span>
              </Button>
            }
          />
        </Card>

        {/* About */}
        <Card title="About">
          <SettingRow
            icon={<IconInfo size={16} />}
            label="Version"
            action={<Badge variant="default">{APP_VERSION}</Badge>}
          />
          <SettingRow
            icon={<IconRefreshCw size={16} />}
            label="Software Updates"
            description="Check for the latest version"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const api = (window as unknown as { electronAPI?: { updater?: { check: () => Promise<void> } } }).electronAPI?.updater;
                  if (api) void api.check();
                  else addToast({ type: 'info', message: 'Updates only available in the installed app.' });
                }}
              >
                Check Now
              </Button>
            }
          />
          <SettingRow
            icon={<IconInfo size={16} />}
            label="Privacy Policy"
            action={
              <Button variant="ghost" size="sm" onClick={() => void navigate('/legal/privacy')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  View <IconChevronRight size={14} />
                </span>
              </Button>
            }
          />
          <SettingRow
            icon={<IconInfo size={16} />}
            label="Terms of Service"
            action={
              <Button variant="ghost" size="sm" onClick={() => void navigate('/legal/terms')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  View <IconChevronRight size={14} />
                </span>
              </Button>
            }
          />
          <SettingRow
            icon={<IconInfo size={16} />}
            label="Contract Address"
            description="SAIKO ERC-20 on Ethereum Mainnet"
            action={
              <a
                href={SAIKO_ETHERSCAN_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: FONT_FAMILY.mono,
                  fontSize: FONT_SIZE.xs,
                  color: COLORS.textMuted,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {SAIKO_CONTRACT_ADDRESS.slice(0, 6)}...{SAIKO_CONTRACT_ADDRESS.slice(-3)}
                <IconExternalLink size={10} />
              </a>
            }
          />
          <SettingRow
            icon={<IconExternalLink size={16} />}
            label="Website"
            action={
              <a
                href={SAIKO_COMMUNITY.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.primary,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                saikoinu.com <IconExternalLink size={12} />
              </a>
            }
          />
          <SettingRow
            icon={<IconExternalLink size={16} />}
            label="Telegram"
            action={
              <a
                href={SAIKO_COMMUNITY.telegram}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.primary,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                @SaikoInu <IconExternalLink size={12} />
              </a>
            }
          />
        </Card>

        {/* ── Seed Phrase Modal (full-screen overlay, outside all Cards) ─ */}
        {showSeedPhrase && seedWords.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.85)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: SPACING[4],
            }}
          >
            <div style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.error}66`,
              borderRadius: RADIUS.lg,
              padding: SPACING[6],
              boxShadow: `0 0 40px ${COLORS.error}33`,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.base,
                fontWeight: FONT_WEIGHT.bold,
                color: COLORS.textPrimary,
                marginBottom: SPACING[4],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>Your Seed Phrase</span>
                <span style={{
                  fontFamily: FONT_FAMILY.mono,
                  fontSize: FONT_SIZE.xs,
                  color: COLORS.textMuted,
                  fontWeight: FONT_WEIGHT.regular,
                }}>
                  Auto-hides in {seedCountdown}s
                </span>
              </div>

              {/* Word grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: SPACING[2],
                marginBottom: SPACING[5],
              }}>
                {seedWords.map((word, i) => (
                  <div key={i} style={{
                    backgroundColor: COLORS.background,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.sm,
                    padding: `${SPACING[2]} ${SPACING[3]}`,
                    fontFamily: FONT_FAMILY.mono,
                    fontSize: FONT_SIZE.sm,
                    color: COLORS.textPrimary,
                    minWidth: 0,
                  }}>
                    <span style={{ color: COLORS.textMuted, marginRight: '6px', fontSize: FONT_SIZE.xs }}>{i + 1}.</span>
                    {word}
                  </div>
                ))}
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: SPACING[2],
                marginBottom: SPACING[4],
              }}>
                <p style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.xs,
                  color: COLORS.error,
                  lineHeight: '1.5',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: SPACING[2],
                  margin: 0,
                }}>
                  <IconAlertTriangle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>Never share your seed phrase. Anyone with it can steal your funds.</span>
                </p>
                <p style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.xs,
                  color: COLORS.warning,
                  lineHeight: '1.5',
                  margin: 0,
                }}>
                  Write these words down by hand. Never copy digitally.
                </p>
              </div>

              <Button variant="ghost" size="sm" onClick={handleHideSeed}>Done</Button>
            </div>
          </motion.div>
        )}

        {/* ── Easter egg ───────────────────────────────────────────────── */}
        <Card style={{ padding: `${SPACING[2]} ${SPACING[4]}`, marginTop: SPACING[1] }}>
          <button
            onClick={() => void navigate('/starship')}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${SPACING[1]} 0`,
              color: COLORS.textMuted,
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE.xs,
              opacity: 0.35,
            }}
          >
            <span>🚀 Starship Saiko</span>
            <span style={{ fontSize: '10px' }}>▶</span>
          </button>
        </Card>
        {/* ─────────────────────────────────────────────────────────────── */}
      </div>
    </div>
  );
}
