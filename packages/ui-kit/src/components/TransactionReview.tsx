import React, { type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export interface TransactionReviewProps {
  /** Destination address */
  toAddress: string;
  /** From address */
  fromAddress?: string;
  /** Token symbol (e.g., "SAIKO") */
  tokenSymbol: string;
  /** Human-readable amount (e.g., "1,000 SAIKO") */
  amount: string;
  /** USD value of amount (e.g., "$12.34") */
  amountUsd?: string;
  /** Gas fee in ETH (e.g., "0.002 ETH") */
  gasFee: string;
  /** Gas fee in USD */
  gasFeeUsd?: string;
  /** Total cost (amount + gas) if same token */
  totalCost?: string;
  /** Network name */
  network?: string;
  /** Estimated confirmation time */
  estimatedTime?: string;
  /** Whether this is a token approval, not a transfer */
  isApproval?: boolean;
  /** Contract being called (for non-transfer txns) */
  contractAddress?: string;
  style?: CSSProperties;
}

interface ReviewRowProps {
  label: string;
  value: string;
  subValue?: string;
  mono?: boolean;
  highlight?: boolean;
  danger?: boolean;
}

function ReviewRow({
  label,
  value,
  subValue,
  mono = false,
  highlight = false,
  danger = false,
}: ReviewRowProps): React.ReactElement {
  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING[4],
    padding: `${SPACING[3]} 0`,
    borderBottom: `1px solid ${COLORS.divider}`,
  };

  const labelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    flexShrink: 0,
    paddingTop: '1px',
  };

  const valueStyle: CSSProperties = {
    fontFamily: mono ? FONT_FAMILY.mono : FONT_FAMILY.sans,
    fontSize: FONT_SIZE.md,
    fontWeight: highlight ? FONT_WEIGHT.semibold : FONT_WEIGHT.regular,
    color: danger ? COLORS.error : highlight ? COLORS.textPrimary : COLORS.textSecondary,
    textAlign: 'right',
    wordBreak: 'break-all',
  };

  const subValueStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: '2px',
  };

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <div>
        <div style={valueStyle}>{value}</div>
        {subValue !== undefined && <div style={subValueStyle}>{subValue}</div>}
      </div>
    </div>
  );
}

/**
 * Full transaction review card.
 *
 * WHY: EVERY transaction must be reviewed by the user before signing.
 * This component is the single source of truth for what the user approves.
 * Never sign without showing this.
 */
export function TransactionReview({
  toAddress,
  fromAddress,
  tokenSymbol,
  amount,
  amountUsd,
  gasFee,
  gasFeeUsd,
  totalCost,
  network,
  estimatedTime,
  isApproval = false,
  contractAddress,
  style,
}: TransactionReviewProps): React.ReactElement {
  const containerStyle: CSSProperties = {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...style,
  };

  const headerStyle: CSSProperties = {
    backgroundColor: COLORS.surfaceElevated,
    padding: `${SPACING[3]} ${SPACING[6]}`,
    borderBottom: `1px solid ${COLORS.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const headerTitleStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  };

  const bodyStyle: CSSProperties = {
    padding: `0 ${SPACING[6]}`,
  };

  const truncate = (addr: string): string =>
    `${addr.slice(0, 8)}…${addr.slice(-6)}`;

  const warningStyle: CSSProperties = {
    backgroundColor: 'rgba(229,57,53,0.08)',
    border: `1px solid rgba(229,57,53,0.3)`,
    borderRadius: RADIUS.md,
    padding: SPACING[4],
    margin: `${SPACING[4]} 0`,
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.error,
    lineHeight: '1.5',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={headerTitleStyle}>
          {isApproval ? 'Token Approval' : 'Transaction Review'}
        </span>
        {network !== undefined && (
          <span
            style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.xs,
              color: COLORS.textMuted,
            }}
          >
            {network}
          </span>
        )}
      </div>
      <div style={bodyStyle}>
        {isApproval && (
          <div style={warningStyle}>
            ⚠️ This approval grants a contract permission to spend your {tokenSymbol}. Only approve contracts you trust.
          </div>
        )}
        {fromAddress !== undefined && (
          <ReviewRow label="From" value={truncate(fromAddress)} mono />
        )}
        <ReviewRow label="To" value={truncate(toAddress)} mono />
        {contractAddress !== undefined && (
          <ReviewRow label="Contract" value={truncate(contractAddress)} mono />
        )}
        <ReviewRow
          label="Amount"
          value={amount}
          subValue={amountUsd}
          highlight
        />
        <ReviewRow
          label="Network Fee"
          value={gasFee}
          subValue={gasFeeUsd}
        />
        {totalCost !== undefined && (
          <ReviewRow
            label="Total"
            value={totalCost}
            highlight
          />
        )}
        {estimatedTime !== undefined && (
          <ReviewRow label="Est. Time" value={estimatedTime} />
        )}
      </div>
    </div>
  );
}
