/**
 * DarkPool Screen — Overview of user's DarkPool notes (extension popup, 360x600).
 */
import React, { useCallback, useContext, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { IconArrowLeft, IconShield, IconArrowDownLeft, IconArrowUpRight } from '../icons';
import {
  Card, Button, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  DARKPOOL_TIERS, TIER_LABELS, DARK_POOL_ADDRESS, DARK_POOL_STAKING_ADDRESS,
  loadNotes,
} from '@saiko-wallet/wallet-core';
import type { DarkPoolNote } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';

const SCREEN: CSSProperties = {
  minHeight: '600px', display: 'flex', flexDirection: 'column',
  backgroundColor: COLORS.background, padding: SPACING[4],
};

/** RPC call through service worker. */
async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'rpc:call', rpcUrl, method, params }, (resp: any) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp?.error) return reject(new Error(resp.error.message ?? JSON.stringify(resp.error)));
      resolve(resp?.result as T);
    });
  });
}

export function DarkPoolScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress, activeNetworkId, addToast } = useContext(AppCtx);
  const rpcUrl = getNetworkById(activeNetworkId).rpcUrl;

  const [notes, setNotes] = useState<DarkPoolNote[]>([]);
  const [totalStaked, setTotalStaked] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    // Load notes from chrome.storage.local
    try {
      const notesKey = walletAddress.toLowerCase() + ':saiko-darkpool-notes-v1';
      const loaded = await loadNotes(notesKey);
      setNotes(loaded);
    } catch { /* no notes */ }

    // Fetch total staked from contract
    try {
      const coder = ethers.AbiCoder.defaultAbiCoder();
      const totalStakedSel = ethers.id('totalStaked()').slice(0, 10);
      const result = await rpcCall<string>(rpcUrl, 'eth_call', [
        { to: DARK_POOL_STAKING_ADDRESS, data: totalStakedSel }, 'latest',
      ]);
      if (result && result !== '0x') {
        const val = coder.decode(['uint256'], result)[0] as bigint;
        setTotalStaked((Number(val) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 }));
      }
    } catch { /* unavailable */ }

    setIsLoading(false);
  }, [walletAddress, rpcUrl]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const activeNotes = notes.filter(n => !n.isSpent);
  const spentNotes = notes.filter(n => n.isSpent);

  const noteLabel = (note: DarkPoolNote): string => {
    const tierAmount = DARKPOOL_TIERS[note.tier];
    return TIER_LABELS[tierAmount?.toString() ?? ''] ?? `Tier ${note.tier + 1}`;
  };

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[4] }}>
        <button onClick={() => void navigate('/dashboard')} style={{
          background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
          color: COLORS.textSecondary, cursor: 'pointer', padding: `${SPACING[2]} ${SPACING[3]}`,
          display: 'flex', alignItems: 'center',
        }}>
          <IconArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: SPACING[2],
          }}>
            <IconShield size={18} /> DarkPool
          </div>
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
            Break the link between wallets
          </div>
        </div>
      </div>

      {/* Staking info */}
      {totalStaked && (
        <div style={{
          padding: SPACING[3], backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.border}`, marginBottom: SPACING[3],
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
          textAlign: 'center',
        }}>
          Total staked in DarkPool: <span style={{ color: COLORS.textPrimary, fontWeight: FONT_WEIGHT.semibold }}>
            {totalStaked} SAIKO
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: SPACING[3], marginBottom: SPACING[4] }}>
        <button onClick={() => void navigate('/darkpool/deposit')} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING[1],
          padding: SPACING[3], backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.lg, cursor: 'pointer', color: COLORS.textPrimary,
          fontFamily: FONT_FAMILY.sans, fontSize: '12px', fontWeight: FONT_WEIGHT.medium,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', backgroundColor: `${COLORS.primary}1A`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconArrowDownLeft size={18} color={COLORS.primary} />
          </div>
          Deposit
        </button>
        <button onClick={() => void navigate('/darkpool/withdraw')} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING[1],
          padding: SPACING[3], backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.lg, cursor: 'pointer', color: COLORS.textPrimary,
          fontFamily: FONT_FAMILY.sans, fontSize: '12px', fontWeight: FONT_WEIGHT.medium,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', backgroundColor: `rgba(67,160,71,0.15)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconArrowUpRight size={18} color="#43A047" />
          </div>
          Withdraw
        </button>
      </div>

      {/* Notes list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{
            textAlign: 'center', padding: SPACING[8],
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted,
          }}>Loading notes...</div>
        ) : notes.length === 0 ? (
          <Card bordered style={{ textAlign: 'center', padding: SPACING[6] }}>
            <IconShield size={32} color={COLORS.textMuted} />
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted,
              marginTop: SPACING[3],
            }}>
              No DarkPool notes yet. Deposit to get started.
            </div>
          </Card>
        ) : (
          <>
            {/* Active notes */}
            {activeNotes.length > 0 && (
              <div style={{ marginBottom: SPACING[3] }}>
                <div style={{
                  fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
                  color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em',
                  marginBottom: SPACING[2],
                }}>Active Notes ({activeNotes.length})</div>
                {activeNotes.map(note => (
                  <div key={note.commitment} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${SPACING[3]} ${SPACING[3]}`, backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
                    marginBottom: SPACING[2],
                  }}>
                    <div>
                      <div style={{
                        fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm,
                        fontWeight: FONT_WEIGHT.medium, color: COLORS.textPrimary,
                      }}>{noteLabel(note)}</div>
                      <div style={{
                        fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
                      }}>{new Date(note.timestamp).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2] }}>
                      <span style={{
                        padding: `${SPACING[1]} ${SPACING[2]}`, borderRadius: RADIUS.sm,
                        backgroundColor: 'rgba(67,160,71,0.15)', color: '#43A047',
                        fontFamily: FONT_FAMILY.sans, fontSize: '10px', fontWeight: FONT_WEIGHT.semibold,
                      }}>ACTIVE</span>
                      <button
                        onClick={() => void navigate('/darkpool/withdraw', { state: { note: serializeNote(note) } })}
                        style={{
                          background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm,
                          color: COLORS.textSecondary, cursor: 'pointer', padding: `${SPACING[1]} ${SPACING[2]}`,
                          fontFamily: FONT_FAMILY.sans, fontSize: '10px',
                        }}
                      >Withdraw</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Spent notes */}
            {spentNotes.length > 0 && (
              <div>
                <div style={{
                  fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
                  color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em',
                  marginBottom: SPACING[2],
                }}>Spent Notes ({spentNotes.length})</div>
                {spentNotes.map(note => (
                  <div key={note.commitment} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${SPACING[3]} ${SPACING[3]}`, backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
                    marginBottom: SPACING[2], opacity: 0.5,
                  }}>
                    <div>
                      <div style={{
                        fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm,
                        fontWeight: FONT_WEIGHT.medium, color: COLORS.textPrimary,
                      }}>{noteLabel(note)}</div>
                      <div style={{
                        fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
                      }}>{new Date(note.timestamp).toLocaleDateString()}</div>
                    </div>
                    <span style={{
                      padding: `${SPACING[1]} ${SPACING[2]}`, borderRadius: RADIUS.sm,
                      backgroundColor: 'rgba(227,27,35,0.15)', color: COLORS.error,
                      fontFamily: FONT_FAMILY.sans, fontSize: '10px', fontWeight: FONT_WEIGHT.semibold,
                    }}>SPENT</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function serializeNote(note: DarkPoolNote): Record<string, unknown> {
  return {
    secret: Array.from(note.secret),
    nullifier: Array.from(note.nullifier),
    commitment: note.commitment,
    amount: note.amount.toString(),
    tier: note.tier,
    timestamp: note.timestamp,
    txHash: note.txHash,
    viewingKey: Array.from(note.viewingKey),
    isSpent: note.isSpent,
  };
}
