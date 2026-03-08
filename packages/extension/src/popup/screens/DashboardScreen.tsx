/**
 * Dashboard Screen — Main wallet view (extension popup, 360x600).
 */
import React, { useContext, useEffect, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconSettings, IconLock, IconArrowUpRight, IconArrowDownLeft,
  IconArrowLeftRight, IconShield, IconRefreshCw, IconCopy, IconCheck, IconExternalLink,
} from '../icons';
import {
  Card, AddressDisplay, Button, COLORS,
  FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  SAIKO_TOKEN, SAIKO_CONTRACT_ADDRESS,
  createRpcClient, createProviderConfig, DEFAULT_MAINNET_PROVIDERS,
  encodeBalanceOf, decodeUint256,
} from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';

function getRpcClient(networkId: string) {
  const network = getNetworkById(networkId);
  const providers = network.chainId === 1
    ? [createProviderConfig(network.rpcUrl), ...DEFAULT_MAINNET_PROVIDERS]
    : [createProviderConfig(network.rpcUrl)];
  return createRpcClient({ providers, maxRetries: 3, chainId: network.chainId });
}

export function DashboardScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress, setLocked, activeNetworkId, addToast } = useContext(AppCtx);

  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [saikoBalance, setSaikoBalance] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const network = getNetworkById(activeNetworkId);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return;
    setIsRefreshing(true);
    try {
      const rpc = getRpcClient(activeNetworkId);
      const ethResult = await rpc.send<string>({ method: 'eth_getBalance', params: [walletAddress, 'latest'] });
      const ethWei = BigInt(ethResult);
      const ethFormatted = (Number(ethWei) / 1e18).toFixed(4);
      setEthBalance(ethFormatted);

      // Only fetch SAIKO on mainnet
      if (network.chainId === 1) {
        try {
          const data = encodeBalanceOf(walletAddress);
          const tokenResult = await rpc.send<string>({ method: 'eth_call', params: [{ to: SAIKO_CONTRACT_ADDRESS, data }, 'latest'] });
          const raw = decodeUint256(tokenResult);
          const formatted = (Number(raw) / 10 ** SAIKO_TOKEN.decimals).toFixed(0);
          setSaikoBalance(formatted);
        } catch {
          setSaikoBalance('0');
        }
      }
    } catch {
      addToast({ type: 'error', message: 'Failed to fetch balances' });
    } finally {
      setIsRefreshing(false);
    }
  }, [walletAddress, activeNetworkId, network.chainId, addToast]);

  useEffect(() => { void fetchBalances(); }, [fetchBalances]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  const handleLock = useCallback(() => {
    setLocked(true);
    void navigate('/unlock');
  }, [setLocked, navigate]);

  const actionBtn: CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING[1],
    padding: SPACING[3], backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg, cursor: 'pointer', color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY.sans, fontSize: '12px', fontWeight: FONT_WEIGHT.medium,
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      minHeight: '600px', backgroundColor: COLORS.background, padding: SPACING[4],
      display: 'flex', flexDirection: 'column', gap: SPACING[4],
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold,
          color: COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          SAIKO WALLET
        </div>
        <div style={{ display: 'flex', gap: SPACING[2] }}>
          <button onClick={() => void navigate('/settings')} style={{
            background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
            padding: SPACING[1], display: 'flex',
          }}>
            <IconSettings size={18} />
          </button>
          <button onClick={handleLock} style={{
            background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
            padding: SPACING[1], display: 'flex',
          }}>
            <IconLock size={18} />
          </button>
        </div>
      </div>

      {/* Testnet banner */}
      {network.isTestnet && (
        <div style={{
          backgroundColor: `${COLORS.warning}1A`, border: `1px solid ${COLORS.warning}40`,
          borderRadius: RADIUS.md, padding: `${SPACING[1]} ${SPACING[3]}`,
          textAlign: 'center', fontFamily: FONT_FAMILY.sans, fontSize: '11px',
          fontWeight: FONT_WEIGHT.semibold, color: COLORS.warning,
        }}>
          TESTNET — {network.name}
        </div>
      )}

      {/* Address */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING[2],
      }}>
        <div style={{
          fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary,
        }}>
          {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
        </div>
        <button onClick={() => void handleCopy()} style={{
          background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
          padding: '2px', display: 'flex',
        }}>
          {copied ? <IconCheck size={14} color={COLORS.success} /> : <IconCopy size={14} />}
        </button>
        <button onClick={() => window.open(`${network.explorerUrl}/address/${walletAddress}`, '_blank', 'noopener,noreferrer')} style={{
          background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
          padding: '2px', display: 'flex',
        }}>
          <IconExternalLink size={14} />
        </button>
      </div>

      {/* ETH Balance (hero) */}
      <Card bordered style={{ textAlign: 'center', padding: SPACING[6] }}>
        <div style={{
          fontFamily: FONT_FAMILY.sans, fontSize: '32px', fontWeight: FONT_WEIGHT.extrabold,
          color: COLORS.textPrimary, lineHeight: 1,
        }}>
          {ethBalance ?? '—'} <span style={{ fontSize: FONT_SIZE.lg, color: COLORS.textSecondary }}>ETH</span>
        </div>
        {network.chainId === 1 && saikoBalance !== null && (
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.primary,
            marginTop: SPACING[2],
          }}>
            {Number(saikoBalance).toLocaleString()} SAIKO
          </div>
        )}
        <button
          onClick={() => void fetchBalances()}
          disabled={isRefreshing}
          style={{
            background: 'none', border: 'none', color: COLORS.textMuted,
            cursor: 'pointer', padding: SPACING[1], marginTop: SPACING[2],
            display: 'inline-flex', alignItems: 'center', gap: SPACING[1],
            fontFamily: FONT_FAMILY.sans, fontSize: '11px',
          }}
        >
          <IconRefreshCw size={12} style={isRefreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </Card>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: SPACING[3] }}>
        <button onClick={() => void navigate('/send')} style={actionBtn}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            backgroundColor: `${COLORS.primary}1A`, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <IconArrowUpRight size={18} color={COLORS.primary} />
          </div>
          Send
        </button>
        <button onClick={() => void navigate('/receive')} style={actionBtn}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            backgroundColor: `${COLORS.success}1A`, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <IconArrowDownLeft size={18} color={COLORS.success} />
          </div>
          Receive
        </button>
        <button onClick={() => void navigate('/swap')} style={actionBtn}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            backgroundColor: `rgba(98,126,234,0.15)`, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <IconArrowLeftRight size={18} color="#627EEA" />
          </div>
          Swap
        </button>
        <button onClick={() => void navigate('/darkpool')} style={actionBtn}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            backgroundColor: `${COLORS.primary}1A`, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <IconShield size={18} color={COLORS.primary} />
          </div>
          DarkPool
        </button>
      </div>

      {/* Network info */}
      <div style={{
        fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
        textAlign: 'center', marginTop: 'auto', paddingTop: SPACING[2],
      }}>
        Connected to {network.name}
      </div>

      {/* Inline keyframes for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
