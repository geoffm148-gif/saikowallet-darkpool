/**
 * Settings Screen — Network, auto-lock, reset (extension popup).
 */
import React, { useContext, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconChevronRight, IconGlobe, IconLock, IconAlertTriangle } from '../icons';
import {
  Button, Card, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
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
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${SPACING[3]} 0`,
  borderBottom: `1px solid ${COLORS.border}`,
  cursor: 'pointer',
};

export function SettingsScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { activeNetworkId, setActiveNetworkId, setWalletCreated, setLocked, addToast } = useContext(AppCtx);
  const [showNetworkPicker, setShowNetworkPicker] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const currentNetwork = getNetworkById(activeNetworkId);

  const handleNetworkChange = async (id: string) => {
    setActiveNetworkId(id);
    await bgSetNetwork(id);
    setShowNetworkPicker(false);
    addToast({ type: 'success', message: `Switched to ${getNetworkById(id).name}` });
  };

  const handleReset = () => {
    chrome.storage.local.clear(() => {
      setWalletCreated(false);
      setLocked(true);
      void navigate('/onboarding');
      addToast({ type: 'info', message: 'Wallet reset. All data cleared.' });
    });
  };

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
        Saiko Wallet Extension v0.1.0
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
    </div>
  );
}
