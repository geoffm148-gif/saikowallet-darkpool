import React, { useCallback, useState, type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export interface AddressDisplayProps {
  /** Full Ethereum address (0x...) */
  address: string;
  /** How many chars to show at start/end when truncated */
  truncateChars?: number;
  /** Show full address without truncation */
  showFull?: boolean;
  /** Label above the address */
  label?: string;
  /** Show copy button */
  showCopy?: boolean;
  /** Callback after address is copied */
  onCopied?: () => void;
  style?: CSSProperties;
}

/**
 * Truncates an Ethereum address for display.
 * WHY: Showing only prefix + suffix lets users verify the address
 * without overwhelming the screen. Common attack: address poisoning
 * relies on similar prefix/suffix — we always show both.
 */
function truncateAddress(address: string, chars: number): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/** Copy icon SVG — inline to avoid external deps */
function CopyIcon({ copied }: { copied: boolean }): React.ReactElement {
  if (copied) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 7l3.5 3.5L12 3" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="4" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <path d="M4 4V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

/** Displays a truncated Ethereum address with a copy-to-clipboard button */
export function AddressDisplay({
  address,
  truncateChars = 6,
  showFull = false,
  label,
  showCopy = true,
  onCopied,
  style,
}: AddressDisplayProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable — fallback silently
    }
  }, [address, onCopied]);

  const displayAddress = showFull ? address : truncateAddress(address, truncateChars);

  const containerStyle: CSSProperties = {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: SPACING[1],
    ...style,
  };

  const labelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textMuted,
    letterSpacing: '0.04em',
  };

  const rowStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACING[2]} ${SPACING[3]}`,
  };

  const addressStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    letterSpacing: '0.04em',
    lineHeight: '1.4',
    wordBreak: 'break-all',
  };

  const copyButtonStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: SPACING[1],
    color: copied ? COLORS.success : COLORS.textSecondary,
    display: 'flex',
    alignItems: 'center',
    borderRadius: RADIUS.sm,
    transition: 'color 0.15s ease',
    flexShrink: 0,
  };

  return (
    <div style={containerStyle}>
      {label !== undefined && <span style={labelStyle}>{label}</span>}
      <div style={rowStyle}>
        <span style={addressStyle} title={address}>
          {displayAddress}
        </span>
        {showCopy && (
          <button
            style={copyButtonStyle}
            onClick={() => void handleCopy()}
            aria-label={copied ? 'Copied!' : 'Copy address'}
            title={copied ? 'Copied!' : 'Copy to clipboard'}
          >
            <CopyIcon copied={copied} />
          </button>
        )}
      </div>
    </div>
  );
}
