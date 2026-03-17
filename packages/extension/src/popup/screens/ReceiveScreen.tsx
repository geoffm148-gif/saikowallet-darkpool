/**
 * Receive Screen — QR code and address display (extension popup).
 */
import React, { useContext, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { IconArrowLeft, IconCopy, IconCheck } from '../icons';
import {
  Button, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import { AppCtx } from '../context';

const SCREEN: CSSProperties = {
  minHeight: '600px',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: COLORS.background,
  padding: SPACING[4],
};

export function ReceiveScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress } = useContext(AppCtx);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[6] }}>
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
          RECEIVE
        </h1>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: SPACING[6], flex: 1, justifyContent: 'center',
      }}>
        {/* QR Code */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: RADIUS.lg,
          padding: SPACING[4],
          display: 'inline-block',
        }}>
          <QRCodeSVG
            value={walletAddress}
            size={180}
            bgColor="#FFFFFF"
            fgColor="#000000"
            level="M"
          />
        </div>

        <p style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary,
          textAlign: 'center',
        }}>
          Scan QR code or copy address below
        </p>

        {/* Address */}
        <div style={{
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          padding: SPACING[3],
          fontFamily: FONT_FAMILY.mono,
          fontSize: '11px',
          color: COLORS.textPrimary,
          wordBreak: 'break-all',
          textAlign: 'center',
          width: '100%',
        }}>
          {walletAddress}
        </div>

        <Button variant="primary" fullWidth onClick={() => void handleCopy()}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
            {copied ? <><IconCheck size={16} color={COLORS.success} /> Copied!</> : <><IconCopy size={16} /> Copy Address</>}
          </span>
        </Button>
      </div>
    </div>
  );
}
