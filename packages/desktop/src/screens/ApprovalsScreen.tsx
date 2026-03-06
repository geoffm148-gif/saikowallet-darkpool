import React, { useCallback, useContext, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IconArrowLeft, IconAlertTriangle, IconRefreshCw } from '../icons.js';
import {
  Card,
  Button,
  Badge,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import { ethers, HDNodeWallet, Mnemonic } from 'ethers';
import { buildRevokeApprovalTransaction } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context.js';
import { getActiveNetwork, getActiveRpc } from '../utils/network.js';
import { KNOWN_SPENDERS } from '../constants/known-contracts.js';

interface ApprovalRecord {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  spender: string;
  spenderLabel: string;
  amount: string;
  timestamp: number;
  txHash: string;
}

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
  maxWidth: '640px',
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING[6],
};

function formatApprovalAmount(value: string): string {
  try {
    const n = BigInt(value);
    if (n >= 2n ** 128n) return 'Unlimited';
    const whole = n / 10n ** 18n;
    return whole.toLocaleString('en-US');
  } catch {
    return value;
  }
}

export function ApprovalsScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress, addToast, sessionMnemonic } = useContext(AppCtx);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<{ tokenAddress: string; tokenSymbol: string; spender: string; spenderLabel: string } | null>(null);

  const network = getActiveNetwork();

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const baseUrl = network.id === 'sepolia'
        ? 'https://api-sepolia.etherscan.io'
        : network.id === 'base'
          ? 'https://api.basescan.org'
          : 'https://api.etherscan.io';

      const url = `${baseUrl}/api?module=account&action=tokentx&address=${walletAddress}&sort=desc&page=1&offset=100`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.status !== '1' || !Array.isArray(json.result)) {
        setApprovals([]);
        return;
      }

      // Extract unique token+spender from token transfers (approximation)
      // Real implementation would use eth_getLogs for Approval events
      const seen = new Map<string, ApprovalRecord>();

      for (const tx of json.result) {
        const from = (tx.from as string).toLowerCase();
        const to = (tx.to as string).toLowerCase();
        const addr = walletAddress.toLowerCase();

        if (from === addr && to !== addr) {
          const key = `${tx.contractAddress}-${to}`;
          if (!seen.has(key)) {
            seen.set(key, {
              tokenAddress: tx.contractAddress,
              tokenName: tx.tokenName ?? 'Unknown',
              tokenSymbol: tx.tokenSymbol ?? '???',
              spender: to,
              spenderLabel: KNOWN_SPENDERS[to] ?? `${to.slice(0, 6)}...${to.slice(-4)}`,
              amount: tx.value ?? '0',
              timestamp: parseInt(tx.timeStamp, 10) * 1000,
              txHash: tx.hash,
            });
          }
        }
      }

      setApprovals(Array.from(seen.values()));
    } catch {
      addToast({ type: 'error', message: 'Failed to fetch token approvals.' });
    } finally {
      setLoading(false);
    }
  }, [walletAddress, network.id, addToast]);

  useEffect(() => { void fetchApprovals(); }, [fetchApprovals]);

  const handleRevoke = useCallback(async (tokenAddress: string, spender: string) => {
    if (!sessionMnemonic) {
      addToast({ type: 'error', message: 'Wallet must be unlocked to revoke approvals' });
      return;
    }

    const key = `${tokenAddress}-${spender}`;
    setRevoking(key);
    try {
      const revokeTx = buildRevokeApprovalTransaction(tokenAddress, spender);

      addToast({
        type: 'info',
        title: 'Revoke Approval',
        message: `Revoking approval for ${spender.slice(0, 6)}...${spender.slice(-4)}. Signing transaction...`,
      });

      const hdWallet = HDNodeWallet.fromMnemonic(
        Mnemonic.fromPhrase(sessionMnemonic),
        `m/44'/60'/0'/0/0`,
      );
      const provider = new ethers.JsonRpcProvider(getActiveRpc());
      const wallet = hdWallet.connect(provider);

      const tx = await wallet.sendTransaction({
        to: revokeTx.to,
        data: revokeTx.data,
        value: revokeTx.value,
        gasLimit: revokeTx.gasLimit,
        type: 2,
      });

      setApprovals((prev) => prev.filter((a) => `${a.tokenAddress}-${a.spender}` !== key));
      addToast({ type: 'success', message: `Approval revoked — tx: ${tx.hash}` });
    } catch {
      addToast({ type: 'error', message: 'Failed to revoke approval.' });
    } finally {
      setRevoking(null);
    }
  }, [addToast, sessionMnemonic]);

  // Group by token
  const grouped = new Map<string, ApprovalRecord[]>();
  for (const a of approvals) {
    const key = a.tokenAddress.toLowerCase();
    const arr = grouped.get(key) ?? [];
    arr.push(a);
    grouped.set(key, arr);
  }

  return (
    <div style={PAGE_STYLE}>
      <div style={CONTENT_STYLE}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[4] }}>
          <motion.button
            onClick={() => void navigate('/settings')}
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
            TOKEN APPROVALS
          </h1>
          <div style={{ marginLeft: 'auto' }}>
            <motion.button
              onClick={() => void fetchApprovals()}
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
              aria-label="Refresh"
              whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
              whileTap={{ scale: 0.95 }}
            >
              <IconRefreshCw size={16} />
            </motion.button>
          </div>
        </div>

        <div style={{
          backgroundColor: `${COLORS.error}10`,
          border: `1px solid ${COLORS.error}33`,
          borderRadius: RADIUS.md,
          padding: SPACING[4],
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.sm,
          color: COLORS.textMuted,
          display: 'flex',
          alignItems: 'flex-start',
          gap: SPACING[2],
          lineHeight: '1.5',
        }}>
          <IconAlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px', color: COLORS.warning }} />
          <span>Token approvals let contracts spend your tokens. Revoke approvals you no longer need to reduce risk.</span>
        </div>

        {loading ? (
          <Card>
            <div style={{ textAlign: 'center', padding: SPACING[6], fontFamily: FONT_FAMILY.sans, color: COLORS.textMuted }}>
              Loading approvals...
            </div>
          </Card>
        ) : approvals.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: SPACING[6], fontFamily: FONT_FAMILY.sans, color: COLORS.textMuted }}>
              No token approvals found for this address.
            </div>
          </Card>
        ) : (
          Array.from(grouped.entries()).map(([tokenAddr, records]) => (
            <Card key={tokenAddr} title={`${records[0]!.tokenSymbol} — ${records[0]!.tokenName}`}>
              {records.map((a) => {
                const key = `${a.tokenAddress}-${a.spender}`;
                return (
                  <div key={key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${SPACING[4]} 0`,
                    borderBottom: `1px solid ${COLORS.divider}`,
                    gap: SPACING[3],
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontFamily: FONT_FAMILY.sans,
                        fontSize: FONT_SIZE.sm,
                        fontWeight: FONT_WEIGHT.medium,
                        color: COLORS.textPrimary,
                      }}>
                        {a.spenderLabel}
                      </div>
                      <div style={{
                        fontFamily: FONT_FAMILY.mono,
                        fontSize: FONT_SIZE.xs,
                        color: COLORS.textMuted,
                        marginTop: '2px',
                      }}>
                        Amount: {formatApprovalAmount(a.amount)}
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      aria-label={`Revoke ${a.tokenSymbol} approval for ${a.spenderLabel}`}
                      isLoading={revoking === key}
                      onClick={() => setConfirmingRevoke({ tokenAddress: a.tokenAddress, tokenSymbol: a.tokenSymbol, spender: a.spender, spenderLabel: a.spenderLabel })}
                    >
                      Revoke
                    </Button>
                  </div>
                );
              })}
            </Card>
          ))
        )}
      </div>

      {/* UI-5: Confirmation dialog before revoke */}
      {confirmingRevoke && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: SPACING[6],
        }}>
          <div style={{
            backgroundColor: COLORS.surface,
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`,
            padding: SPACING[6],
            maxWidth: '400px',
            width: '100%',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4] }}>
              <span style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.lg,
                fontWeight: FONT_WEIGHT.bold,
                color: COLORS.textPrimary,
              }}>
                Confirm Revoke
              </span>
              <span style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.textSecondary,
                lineHeight: '1.5',
              }}>
                Revoke access to <strong>{confirmingRevoke.tokenSymbol}</strong> for <strong>{confirmingRevoke.spenderLabel}</strong>? This will submit a transaction.
              </span>
              <div style={{ display: 'flex', gap: SPACING[3] }}>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingRevoke(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    const { tokenAddress, spender } = confirmingRevoke;
                    setConfirmingRevoke(null);
                    void handleRevoke(tokenAddress, spender);
                  }}
                >
                  Confirm Revoke
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
