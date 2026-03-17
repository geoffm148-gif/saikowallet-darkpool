/**
 * Receive Screen — display wallet address as QR code.
 *
 * Features:
 * - QR code via qrcode.react
 * - One-tap copy with clipboard feedback
 * - Checksummed address displayed in monospace
 */
import React, { useCallback, useContext, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { IconArrowLeft, IconAlertTriangle, IconCopy, IconCheck } from '../icons.js';
import {
  Card,
  Button,
  AddressDisplay,
  Badge,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import { AppCtx } from '../context.js';

type TokenFilter = 'ETH' | 'SAIKO' | 'All';

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: SPACING[6],
};

const CONTENT_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING[6],
};

export function ReceiveScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress } = useContext(AppCtx);
  const [selectedToken, setSelectedToken] = useState<TokenFilter>('All');
  const [copySuccess, setCopySuccess] = useState(false);

  // Use checksummed address — the address from wallet-core (deriveAccount)
  // is already EIP-55 checksummed via ethers.getAddress
  const displayAddress = walletAddress || '0x0000000000000000000000000000000000000000';

  const handleCopyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayAddress);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback for environments where clipboard API is not available
      const textarea = document.createElement('textarea');
      textarea.value = displayAddress;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [displayAddress]);

  const handleCopied = (): void => {
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const tokens: TokenFilter[] = ['All', 'SAIKO', 'ETH'];

  const tokenSelectorStyle: CSSProperties = {
    display: 'flex',
    gap: SPACING[2],
  };

  const getTokenButtonStyle = (token: TokenFilter): CSSProperties => ({
    flex: 1,
    padding: `${SPACING[2]} ${SPACING[3]}`,
    borderRadius: RADIUS.md,
    border: `1px solid ${selectedToken === token ? COLORS.primary : COLORS.border}`,
    backgroundColor: selectedToken === token ? 'rgba(227,27,35,0.1)' : COLORS.surface,
    color: selectedToken === token ? COLORS.primary : COLORS.textSecondary,
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  });

  const qrContainerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: SPACING[6],
    padding: SPACING[8],
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
            RECEIVE
          </h1>
        </div>

        {/* Token Filter */}
        <div>
          <div style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textMuted,
            marginBottom: SPACING[2],
          }}>
            Show address for
          </div>
          <div style={tokenSelectorStyle}>
            {tokens.map((token) => (
              <button
                key={token}
                style={getTokenButtonStyle(token)}
                onClick={() => setSelectedToken(token)}
                type="button"
              >
                {token}
              </button>
            ))}
          </div>
        </div>

        {/* QR Code + Address */}
        <Card bordered elevated>
          <div style={qrContainerStyle}>
            {/* QR Code */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={{
                padding: SPACING[4],
                backgroundColor: '#FFFFFF',
                borderRadius: RADIUS.md,
                border: `3px solid ${COLORS.primary}`,
                boxShadow: `0 0 24px ${COLORS.primary}30`,
              }}
            >
              <QRCodeSVG
                value={displayAddress}
                size={200}
                bgColor="#FFFFFF"
                fgColor="#0A0A0A"
                level="H"
                includeMargin={false}
              />
            </motion.div>

            {/* Token Badge */}
            {selectedToken !== 'All' && (
              <Badge variant={selectedToken === 'SAIKO' ? 'error' : 'default'} dot>
                {selectedToken} Address
              </Badge>
            )}

            {/* Checksummed Address — monospace, full display */}
            <div style={{ width: '100%' }}>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.xs,
                color: COLORS.textMuted,
                marginBottom: SPACING[2],
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Your Wallet Address (EIP-55 Checksummed)
              </div>
              <div
                onClick={() => void handleCopyAddress()}
                style={{
                  fontFamily: FONT_FAMILY.mono,
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.textPrimary,
                  backgroundColor: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md,
                  padding: SPACING[4],
                  wordBreak: 'break-all',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACING[3],
                  letterSpacing: '0.04em',
                }}
              >
                <span style={{ flex: 1 }}>{displayAddress}</span>
                <span style={{ flexShrink: 0, color: copySuccess ? COLORS.success : COLORS.textMuted }}>
                  {copySuccess ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </span>
              </div>
            </div>

            {copySuccess && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.success,
                  fontWeight: FONT_WEIGHT.medium,
                }}
              >
                Address copied to clipboard
              </motion.div>
            )}
          </div>
        </Card>

        {/* Warning */}
        <div style={{
          backgroundColor: 'rgba(251,140,0,0.08)',
          border: `1px solid rgba(251,140,0,0.25)`,
          borderRadius: RADIUS.md,
          padding: SPACING[4],
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.sm,
          color: COLORS.textSecondary,
          lineHeight: '1.5',
          display: 'flex',
          alignItems: 'flex-start',
          gap: SPACING[2],
        }}>
          <IconAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px', color: COLORS.warning }} />
          <span>Only send Ethereum (ETH) and ERC-20 tokens to this address. Sending other assets may result in permanent loss.</span>
        </div>

        <Button variant="secondary" fullWidth onClick={() => void navigate('/dashboard')}>
          Done
        </Button>
      </div>
    </div>
  );
}
