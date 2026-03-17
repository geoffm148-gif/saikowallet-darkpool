/**
 * Settings Screen — Network, auto-lock, change passphrase, view seed, reset (extension popup).
 */
import React, { useContext, useState, useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconChevronRight, IconGlobe, IconLock, IconAlertTriangle, IconKey, IconEye, IconEyeOff, IconLink } from '../icons';
import {
  Button, Card, Input, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import { AppCtx } from '../context';
import { NETWORKS, getNetworkById } from '../utils/network';
import { setNetwork as bgSetNetwork } from '../storage';

const SCREEN: CSSProperties = {
  minHeight: '600px',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: COLORS.background,
  padding: SPACING[4],
  overflowY: 'auto',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${SPACING[3]} 0`,
  borderBottom: `1px solid ${COLORS.border}`,
  cursor: 'pointer',
};

const AUTO_LOCK_OPTIONS = [
  { label: '1 minute', value: 1 },
  { label: '5 minutes', value: 5 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: 'Disabled', value: 0 },
];

export function SettingsScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { activeNetworkId, setActiveNetworkId, setWalletCreated, setLocked, addToast, sessionMnemonic } = useContext(AppCtx);
  const [showNetworkPicker, setShowNetworkPicker] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAutoLock, setShowAutoLock] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);

  // Change passphrase state
  const [showChangePassphrase, setShowChangePassphrase] = useState(false);
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [isChangingPassphrase, setIsChangingPassphrase] = useState(false);

  // Connected sites state
  const [connectedSites, setConnectedSites] = useState<Record<string, { origin: string; connectedAt: number }>>({});
  const [showConnectedSites, setShowConnectedSites] = useState(false);

  // View seed phrase state
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [seedPassphrase, setSeedPassphrase] = useState('');
  const [seedRevealed, setSeedRevealed] = useState(false);
  const [revealedMnemonic, setRevealedMnemonic] = useState<string>('');

  const currentNetwork = getNetworkById(activeNetworkId);

  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'wallet:getAutoLock' }, (resp: any) => {
      if (resp?.minutes !== undefined) setAutoLockMinutes(resp.minutes);
    });
    chrome.runtime.sendMessage({ action: 'wallet:getConnectedSites' }, (resp: any) => {
      if (resp?.sites) setConnectedSites(resp.sites);
    });
  }, []);

  const handleNetworkChange = async (id: string) => {
    setActiveNetworkId(id);
    await bgSetNetwork(id);
    setShowNetworkPicker(false);
    addToast({ type: 'success', message: `Switched to ${getNetworkById(id).name}` });
  };

  const handleAutoLockChange = async (minutes: number) => {
    setAutoLockMinutes(minutes);
    setShowAutoLock(false);
    chrome.runtime.sendMessage({ action: 'wallet:setAutoLock', minutes });
    addToast({ type: 'success', message: minutes > 0 ? `Auto-lock: ${minutes} min` : 'Auto-lock disabled' });
  };

  const handleChangePassphrase = async () => {
    if (newPassphrase.length < 8) {
      addToast({ type: 'error', message: 'Passphrase must be at least 8 characters' });
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      addToast({ type: 'error', message: 'Passphrases do not match' });
      return;
    }
    setIsChangingPassphrase(true);
    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'wallet:changePassphrase',
        currentPassphrase,
        newPassphrase,
      }) as { ok?: boolean; error?: string };
      if (resp?.error === 'WRONG_PASSPHRASE') {
        addToast({ type: 'error', message: 'Current passphrase is incorrect' });
      } else if (resp?.ok) {
        addToast({ type: 'success', message: 'Passphrase changed successfully' });
        setShowChangePassphrase(false);
        setCurrentPassphrase('');
        setNewPassphrase('');
        setConfirmPassphrase('');
      } else {
        addToast({ type: 'error', message: resp?.error ?? 'Failed to change passphrase' });
      }
    } catch {
      addToast({ type: 'error', message: 'Failed to change passphrase' });
    }
    setIsChangingPassphrase(false);
  };

  const handleDisconnect = async (siteOrigin: string) => {
    await chrome.runtime.sendMessage({ action: 'wallet:disconnectSite', origin: siteOrigin });
    setConnectedSites(prev => {
      const next = { ...prev };
      delete next[siteOrigin];
      return next;
    });
    addToast({ type: 'success', message: `Disconnected from ${siteOrigin}` });
  };

  const handleRevealSeed = async () => {
    // Re-auth: try unlocking with the entered passphrase
    const resp = await chrome.runtime.sendMessage({
      action: 'wallet:unlock',
      passphrase: seedPassphrase,
    }) as { ok?: boolean; mnemonic?: string; error?: string };
    if (resp?.ok && resp.mnemonic) {
      setRevealedMnemonic(resp.mnemonic);
      setSeedRevealed(true);
    } else {
      addToast({ type: 'error', message: 'Incorrect passphrase' });
    }
  };

  const handleReset = () => {
    chrome.storage.local.clear(() => {
      setWalletCreated(false);
      setLocked(true);
      void navigate('/onboarding');
      addToast({ type: 'info', message: 'Wallet reset. All data cleared.' });
    });
  };

  const autoLockLabel = AUTO_LOCK_OPTIONS.find(o => o.value === autoLockMinutes)?.label ?? `${autoLockMinutes} min`;

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[4] }}>
        <button onClick={() => void navigate(-1)} style={{
          background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
          padding: SPACING[1], display: 'flex',
        }}>
          <IconArrowLeft size={20} />
        </button>
        <h1 style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary, textTransform: 'uppercase',
        }}>
          SETTINGS
        </h1>
      </div>

      {/* Network */}
      <div onClick={() => setShowNetworkPicker(v => !v)} style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <IconGlobe size={18} color={COLORS.textSecondary} />
          <div>
            <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontWeight: FONT_WEIGHT.medium }}>
              Network
            </div>
            <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted }}>
              {currentNetwork.name}
            </div>
          </div>
        </div>
        <IconChevronRight size={16} color={COLORS.textMuted} />
      </div>

      {showNetworkPicker && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: SPACING[1],
          padding: SPACING[2], backgroundColor: COLORS.surface,
          borderRadius: RADIUS.md, marginTop: SPACING[2], marginBottom: SPACING[2],
        }}>
          {NETWORKS.map(net => (
            <button
              key={net.id}
              onClick={() => void handleNetworkChange(net.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: `${SPACING[2]} ${SPACING[3]}`,
                backgroundColor: net.id === activeNetworkId ? `${COLORS.primary}14` : 'transparent',
                border: net.id === activeNetworkId ? `1px solid ${COLORS.primary}40` : '1px solid transparent',
                borderRadius: RADIUS.md, cursor: 'pointer',
                fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary,
                textAlign: 'left', width: '100%',
              }}
            >
              <span>{net.name}</span>
              {net.isTestnet && (
                <span style={{ fontSize: '10px', color: COLORS.warning, fontWeight: FONT_WEIGHT.semibold }}>
                  TESTNET
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Auto-lock */}
      <div onClick={() => setShowAutoLock(v => !v)} style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <IconLock size={18} color={COLORS.textSecondary} />
          <div>
            <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontWeight: FONT_WEIGHT.medium }}>
              Auto-lock
            </div>
            <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted }}>
              {autoLockLabel}
            </div>
          </div>
        </div>
        <IconChevronRight size={16} color={COLORS.textMuted} />
      </div>

      {showAutoLock && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: SPACING[1],
          padding: SPACING[2], backgroundColor: COLORS.surface,
          borderRadius: RADIUS.md, marginTop: SPACING[2], marginBottom: SPACING[2],
        }}>
          {AUTO_LOCK_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => void handleAutoLockChange(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: `${SPACING[2]} ${SPACING[3]}`,
                backgroundColor: opt.value === autoLockMinutes ? `${COLORS.primary}14` : 'transparent',
                border: opt.value === autoLockMinutes ? `1px solid ${COLORS.primary}40` : '1px solid transparent',
                borderRadius: RADIUS.md, cursor: 'pointer',
                fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary,
                textAlign: 'left', width: '100%',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Change passphrase */}
      <div onClick={() => setShowChangePassphrase(v => !v)} style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <IconKey size={18} color={COLORS.textSecondary} />
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontWeight: FONT_WEIGHT.medium }}>
            Change Passphrase
          </div>
        </div>
        <IconChevronRight size={16} color={COLORS.textMuted} />
      </div>

      {showChangePassphrase && (
        <div style={{
          marginTop: SPACING[2], marginBottom: SPACING[2],
          border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
          backgroundColor: COLORS.surface,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], padding: SPACING[3] }}>
            <Input label="Current Passphrase" type="password" value={currentPassphrase} onChange={setCurrentPassphrase} placeholder="Current passphrase" />
            <Input label="New Passphrase" type="password" value={newPassphrase} onChange={setNewPassphrase} placeholder="New passphrase (min 8 chars)" />
            <Input label="Confirm New Passphrase" type="password" value={confirmPassphrase} onChange={setConfirmPassphrase} placeholder="Confirm new passphrase" />
            <Button variant="primary" fullWidth isLoading={isChangingPassphrase} onClick={() => void handleChangePassphrase()}>
              Update Passphrase
            </Button>
          </div>
        </div>
      )}

      {/* Connected Sites */}
      <div onClick={() => setShowConnectedSites(v => !v)} style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <IconLink size={18} color={COLORS.textSecondary} />
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontWeight: FONT_WEIGHT.medium }}>
            Connected Sites ({Object.keys(connectedSites).length})
          </div>
        </div>
        <IconChevronRight size={16} color={COLORS.textMuted} />
      </div>

      {showConnectedSites && (
        <div style={{
          padding: SPACING[2], backgroundColor: COLORS.surface,
          borderRadius: RADIUS.md, marginTop: SPACING[2], marginBottom: SPACING[2],
        }}>
          {Object.keys(connectedSites).length === 0 ? (
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
              padding: SPACING[2], textAlign: 'center',
            }}>
              No connected sites yet.
            </div>
          ) : (
            Object.values(connectedSites).map(site => (
              <div key={site.origin} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: `${SPACING[2]} 0`, borderBottom: `1px solid ${COLORS.border}`,
              }}>
                <div>
                  <div style={{
                    fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary,
                  }}>
                    {site.origin}
                  </div>
                  <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: '10px', color: COLORS.textMuted }}>
                    Connected {new Date(site.connectedAt).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); void handleDisconnect(site.origin); }} style={{
                  background: 'none', border: `1px solid ${COLORS.error}40`,
                  borderRadius: RADIUS.sm, color: COLORS.error, cursor: 'pointer',
                  fontFamily: FONT_FAMILY.sans, fontSize: '11px', padding: `${SPACING[1]} ${SPACING[2]}`,
                }}>
                  Disconnect
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* View seed phrase */}
      <div onClick={() => { setShowSeedPhrase(v => !v); setSeedRevealed(false); setSeedPassphrase(''); setRevealedMnemonic(''); }} style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <IconEye size={18} color={COLORS.textSecondary} />
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontWeight: FONT_WEIGHT.medium }}>
            View Seed Phrase
          </div>
        </div>
        <IconChevronRight size={16} color={COLORS.textMuted} />
      </div>

      {showSeedPhrase && !seedRevealed && (
        <div style={{
          marginTop: SPACING[2], marginBottom: SPACING[2],
          border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
          backgroundColor: COLORS.surface,
        }}>
          <div style={{ padding: SPACING[3], display: 'flex', flexDirection: 'column', gap: SPACING[3] }}>
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.warning,
              display: 'flex', alignItems: 'center', gap: SPACING[2],
            }}>
              <IconAlertTriangle size={14} /> Enter your passphrase to reveal
            </div>
            <Input label="Passphrase" type="password" value={seedPassphrase} onChange={setSeedPassphrase} placeholder="Enter passphrase" onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && seedPassphrase) void handleRevealSeed(); }} />
            <Button variant="primary" fullWidth onClick={() => void handleRevealSeed()} disabled={!seedPassphrase}>
              Reveal Seed Phrase
            </Button>
          </div>
        </div>
      )}

      {/* Seed phrase shown in full-screen modal once revealed */}

      {/* Lock */}
      <div onClick={() => { setLocked(true); void navigate('/unlock'); }} style={rowStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <IconLock size={18} color={COLORS.textSecondary} />
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary, fontWeight: FONT_WEIGHT.medium }}>
            Lock Wallet
          </div>
        </div>
        <IconChevronRight size={16} color={COLORS.textMuted} />
      </div>

      {/* Version */}
      <div style={{
        fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
        padding: `${SPACING[3]} 0`,
      }}>
        Saiko Wallet Extension v0.1.10
      </div>

      {/* Reset */}
      <div style={{ marginTop: 'auto', paddingTop: SPACING[4] }}>
        {!showResetConfirm ? (
          <Button variant="ghost" fullWidth onClick={() => setShowResetConfirm(true)}>
            <span style={{ color: COLORS.error, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
              <IconAlertTriangle size={14} /> Reset Wallet
            </span>
          </Button>
        ) : (
          <Card bordered style={{ borderColor: `${COLORS.error}40` }}>
            <p style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.error,
              fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING[2],
            }}>
              This will delete all wallet data from this extension.
            </p>
            <p style={{
              fontFamily: FONT_FAMILY.sans, fontSize: '12px', color: COLORS.textSecondary,
              marginBottom: SPACING[3], lineHeight: '1.4',
            }}>
              Make sure you have your seed phrase backed up. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: SPACING[3] }}>
              <Button variant="ghost" fullWidth onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" fullWidth onClick={handleReset}>
                Confirm Reset
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Seed Phrase Modal — fixed overlay, bypasses Card overflow */}
      {showSeedPhrase && seedRevealed && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.9)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          padding: SPACING[4],
          overflowY: 'auto',
        }}>
          <div style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.error}66`,
            borderRadius: RADIUS.lg,
            padding: SPACING[4],
            width: '100%',
          }}>
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary, marginBottom: SPACING[3],
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2] }}>
                <IconAlertTriangle size={14} color={COLORS.error} />
                Your Seed Phrase
              </div>
              <button
                onClick={() => { setSeedRevealed(false); setShowSeedPhrase(false); setRevealedMnemonic(''); }}
                style={{
                  background: 'none', border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md, color: COLORS.textSecondary,
                  cursor: 'pointer', padding: `${SPACING[1]} ${SPACING[2]}`,
                  fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs,
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <IconArrowLeft size={12} /> Back
              </button>
            </div>

            {/* 3-column word grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: SPACING[2],
              marginBottom: SPACING[3],
            }}>
              {(revealedMnemonic || sessionMnemonic || '').split(' ').filter(Boolean).map((word, i) => (
                <div key={i} style={{
                  backgroundColor: COLORS.background,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.sm,
                  padding: `${SPACING[1]} ${SPACING[2]}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  minWidth: 0,
                }}>
                  <span style={{
                    fontFamily: FONT_FAMILY.mono, fontSize: '10px',
                    color: COLORS.textMuted, flexShrink: 0,
                  }}>
                    {i + 1}.
                  </span>
                  <span style={{
                    fontFamily: FONT_FAMILY.mono, fontSize: '11px',
                    color: COLORS.textPrimary,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {word}
                  </span>
                </div>
              ))}
            </div>

            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.error,
              marginBottom: SPACING[3], display: 'flex', alignItems: 'flex-start', gap: SPACING[1],
            }}>
              <IconAlertTriangle size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
              Never share this. Anyone with it can steal your funds.
            </div>

            <Button variant="ghost" fullWidth onClick={() => { setSeedRevealed(false); setShowSeedPhrase(false); setRevealedMnemonic(''); }}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
