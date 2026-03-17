/**
 * History Screen — wallet transaction history via Etherscan.
 */
import React, { useCallback, useContext, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconArrowUpRight, IconArrowDownLeft, IconArrowLeftRight, IconRefreshCw, IconExternalLink } from '../icons';
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS } from '@saiko-wallet/ui-kit';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';
import { fetchTxHistory, formatRelativeTime, getTxExplorerUrl, type TxRecord } from '../utils/history';

const SCREEN: CSSProperties = {
  minHeight: '600px',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
};

export function HistoryScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress, activeNetworkId } = useContext(AppCtx);
  const network = getNetworkById(activeNetworkId);

  const [txs, setTxs] = useState<TxRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoading(true);
    setError(null);
    try {
      const records = await fetchTxHistory(walletAddress, activeNetworkId);
      setTxs(records);
    } catch {
      setError('Could not load history. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, activeNetworkId]);

  useEffect(() => { void load(); }, [load]);

  const openExplorer = (hash: string) => {
    window.open(getTxExplorerUrl(hash, activeNetworkId), '_blank', 'noopener,noreferrer');
  };

  function TxIcon({ tx }: { tx: TxRecord }) {
    const isSwap = tx.type === 'swap';
    const isContract = tx.type === 'contract' || tx.type === 'approve';
    const color = tx.status === 'failed'
      ? COLORS.error
      : isSwap ? '#627EEA'
      : tx.isIncoming ? COLORS.success : COLORS.textMuted;
    const bg = tx.status === 'failed'
      ? `${COLORS.error}1A`
      : isSwap ? 'rgba(98,126,234,0.15)'
      : tx.isIncoming ? `${COLORS.success}1A` : `${COLORS.textMuted}1A`;

    return (
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        backgroundColor: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {isSwap
          ? <IconArrowLeftRight size={16} color={color} />
          : isContract
            ? <span style={{ fontSize: '14px' }}>⚙</span>
            : tx.isIncoming
              ? <IconArrowDownLeft size={16} color={color} />
              : <IconArrowUpRight size={16} color={color} />
        }
      </div>
    );
  }

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING[3],
        padding: SPACING[4], borderBottom: `1px solid ${COLORS.border}`,
        flexShrink: 0,
      }}>
        <button
          onClick={() => void navigate('/dashboard')}
          style={{
            background: 'none', border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md, color: COLORS.textSecondary,
            cursor: 'pointer', padding: `${SPACING[2]} ${SPACING[3]}`,
            display: 'flex', alignItems: 'center',
          }}
        >
          <IconArrowLeft size={16} />
        </button>
        <div style={{
          flex: 1,
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.base,
          fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary,
        }}>
          Transaction History
        </div>
        <button
          onClick={() => void load()}
          disabled={isLoading}
          style={{
            background: 'none', border: 'none', color: COLORS.textMuted,
            cursor: 'pointer', padding: SPACING[1], display: 'flex',
          }}
        >
          <IconRefreshCw size={16} style={isLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && txs.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: SPACING[8], gap: SPACING[3],
          }}>
            <IconRefreshCw size={24} color={COLORS.textMuted} style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted }}>
              Loading history…
            </div>
          </div>
        )}

        {error && (
          <div style={{
            margin: SPACING[4],
            padding: SPACING[4],
            backgroundColor: `${COLORS.error}14`,
            border: `1px solid ${COLORS.error}44`,
            borderRadius: RADIUS.md,
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.error,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {!isLoading && !error && txs.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: SPACING[8], gap: SPACING[2],
          }}>
            <div style={{ fontSize: '32px' }}>🕐</div>
            <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted }}>
              No transactions yet
            </div>
          </div>
        )}

        {txs.map((tx) => (
          <button
            key={tx.hash}
            onClick={() => openExplorer(tx.hash)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: SPACING[3],
              padding: `${SPACING[3]} ${SPACING[4]}`,
              border: 'none', borderBottom: `1px solid ${COLORS.border}`,
              backgroundColor: 'transparent', cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <TxIcon tx={tx} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], marginBottom: '2px' }}>
                <span style={{
                  fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
                  fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary,
                }}>
                  {tx.type === 'swap' ? 'Swap'
                    : tx.type === 'approve' ? 'Approve'
                    : tx.type === 'contract' ? 'Contract'
                    : tx.isIncoming ? 'Received' : 'Sent'}
                </span>
                {tx.status === 'failed' && (
                  <span style={{
                    fontFamily: FONT_FAMILY.sans, fontSize: '10px',
                    color: COLORS.error, backgroundColor: `${COLORS.error}1A`,
                    padding: '1px 6px', borderRadius: RADIUS.full,
                    fontWeight: FONT_WEIGHT.medium,
                  }}>
                    Failed
                  </span>
                )}
              </div>
              <div style={{
                fontFamily: FONT_FAMILY.mono, fontSize: '11px', color: COLORS.textMuted,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {tx.type === 'swap' && tx.counterpartyName
                  ? tx.counterpartyName
                  : `${tx.isIncoming ? 'From' : 'To'}: ${tx.counterparty}`}
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm,
                fontWeight: FONT_WEIGHT.semibold,
                color: tx.status === 'failed'
                  ? COLORS.textMuted
                  : tx.isIncoming ? COLORS.success : COLORS.textPrimary,
              }}>
                {tx.isIncoming ? '+' : '-'}{tx.amount} {tx.symbol}
              </div>
              <div style={{
                fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
                display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end',
              }}>
                {formatRelativeTime(tx.timestamp)}
                <IconExternalLink size={10} color={COLORS.textMuted} />
              </div>
            </div>
          </button>
        ))}

        {txs.length > 0 && (
          <div style={{
            padding: SPACING[4], textAlign: 'center',
            fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
          }}>
            Showing last {txs.length} transactions · Powered by Blockscout
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
