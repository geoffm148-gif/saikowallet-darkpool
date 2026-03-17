/**
 * Dashboard Screen — Main wallet view (extension popup, 360x600).
 */
import React, { useContext, useEffect, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconSettings, IconLock, IconArrowUpRight, IconArrowDownLeft,
  IconArrowLeftRight, IconShield, IconRefreshCw, IconCopy, IconCheck, IconExternalLink, IconClock,
} from '../icons';
import {
  Card, Button, Input, COLORS,
  FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  SAIKO_TOKEN, SAIKO_CONTRACT_ADDRESS,
  encodeBalanceOf, decodeUint256,
} from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';
import { type StoredToken, loadCustomTokens, addCustomToken, SAIKO_BUILTIN, POPULAR_TOKENS } from '../utils/tokens';
import { getTokenLogoUrl, getKnownLogoUrl, fetchEthPrice, fetchTokenPrices } from '../utils/coingecko';
import { getAddress } from 'ethers';

/** RPC call through service worker. */
async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'rpc:call', rpcUrl, method, params }, (resp: any) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp?.error) return reject(new Error(typeof resp.error === 'string' ? resp.error : resp.error.message ?? JSON.stringify(resp.error)));
      resolve(resp?.result as T);
    });
  });
}

interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  isNative: boolean;
}

/** Encode ERC-20 balanceOf for custom tokens (simple inline). */
function encodeBalanceOfSimple(owner: string): string {
  const addr = owner.toLowerCase().replace('0x', '').padStart(64, '0');
  return '0x70a08231' + addr;
}

/** Decode a string result from ERC-20 name()/symbol(). */
function decodeString(hex: string): string {
  if (!hex || hex === '0x' || hex.length < 130) return '';
  try {
    const offset = parseInt(hex.slice(2, 66), 16) * 2;
    const len = parseInt(hex.slice(2 + offset, 2 + offset + 64), 16);
    const strHex = hex.slice(2 + offset + 64, 2 + offset + 64 + len * 2);
    const bytes = [];
    for (let i = 0; i < strHex.length; i += 2) {
      bytes.push(parseInt(strHex.slice(i, i + 2), 16));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return '';
  }
}

export function DashboardScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress, setLocked, activeNetworkId, addToast, accounts, activeAccountIndex, switchAccount, createAccount } = useContext(AppCtx);

  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [ethBalanceRaw, setEthBalanceRaw] = useState<bigint | null>(null);
  const [saikoBalance, setSaikoBalance] = useState<string | null>(null);
  const [saikoBalanceRaw, setSaikoBalanceRaw] = useState<bigint | null>(null);
  const [customBalances, setCustomBalances] = useState<TokenBalance[]>([]);
  const [ethPriceUsd, setEthPriceUsd] = useState(0);
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [newTokenAddress, setNewTokenAddress] = useState('');
  const [addingToken, setAddingToken] = useState(false);
  const [logoUrls, setLogoUrls] = useState<Map<string, string>>(new Map());

  const network = getNetworkById(activeNetworkId);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return;
    setIsRefreshing(true);
    try {
      const rpcUrl = network.rpcUrl;
      const ethResult = await rpcCall<string>(rpcUrl, 'eth_getBalance', [walletAddress, 'latest']);
      const ethWei = BigInt(ethResult);
      const ethFormatted = (Number(ethWei) / 1e18).toFixed(4);
      setEthBalance(ethFormatted);
      setEthBalanceRaw(ethWei);

      // Only fetch SAIKO on mainnet
      let saikoRaw: bigint | null = null;
      if (network.chainId === 1) {
        try {
          const data = encodeBalanceOf(walletAddress);
          const tokenResult = await rpcCall<string>(rpcUrl, 'eth_call', [{ to: SAIKO_CONTRACT_ADDRESS, data }, 'latest']);
          saikoRaw = decodeUint256(tokenResult);
          const formatted = (Number(saikoRaw) / 10 ** SAIKO_TOKEN.decimals).toFixed(0);
          setSaikoBalance(formatted);
          setSaikoBalanceRaw(saikoRaw);
        } catch {
          setSaikoBalance('0');
        }
      }

      // Fetch custom token balances
      const customTokens = await loadCustomTokens();
      const customBalanceResults: TokenBalance[] = await Promise.all(
        customTokens.map(async (t) => {
          let balance = '0';
          try {
            const data = encodeBalanceOfSimple(walletAddress);
            const hex = await rpcCall<string>(rpcUrl, 'eth_call', [{ to: t.address, data }, 'latest']);
            const raw = hex && hex !== '0x' ? BigInt(hex) : 0n;
            balance = (Number(raw) / 10 ** t.decimals).toFixed(t.decimals <= 8 ? t.decimals : 4);
          } catch { /* keep 0 */ }
          return {
            address: t.address,
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
            balance,
            isNative: false,
          };
        }),
      );

      // Auto-detect popular tokens with non-zero balance (mainnet only)
      const customAddrs = new Set(customTokens.map((t) => t.address.toLowerCase()));
      const SAIKO_LOWER = SAIKO_CONTRACT_ADDRESS.toLowerCase();
      const popularToCheck = network.chainId === 1
        ? POPULAR_TOKENS.filter((t) => t.address.toLowerCase() !== SAIKO_LOWER && !customAddrs.has(t.address.toLowerCase()))
        : [];
      const autoDetected: TokenBalance[] = [];
      await Promise.all(
        popularToCheck.map(async (t) => {
          try {
            const data = encodeBalanceOfSimple(walletAddress);
            const hex = await rpcCall<string>(rpcUrl, 'eth_call', [{ to: t.address, data }, 'latest']);
            const raw = hex && hex !== '0x' ? BigInt(hex) : 0n;
            if (raw > 0n) {
              const balance = (Number(raw) / 10 ** t.decimals).toFixed(t.decimals <= 8 ? t.decimals : 4);
              autoDetected.push({ address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals, balance, isNative: false });
            }
          } catch { /* skip */ }
        }),
      );

      const allCustom = [...customBalanceResults, ...autoDetected];
      setCustomBalances(allCustom);

      // Fetch prices for portfolio total (mainnet only, non-blocking)
      if (network.chainId === 1) {
        const tokenAddrsForPricing = [SAIKO_CONTRACT_ADDRESS, ...allCustom.map((t) => t.address)];
        Promise.all([
          fetchEthPrice(),
          fetchTokenPrices(tokenAddrsForPricing),
        ]).then(([ethPrice, tPrices]) => {
          setEthPriceUsd(ethPrice);
          setTokenPrices(tPrices);
        }).catch(() => { /* non-critical */ });
      }
    } catch {
      addToast({ type: 'error', message: 'Failed to fetch balances' });
    } finally {
      setIsRefreshing(false);
    }
  }, [walletAddress, activeNetworkId, network.chainId, network.rpcUrl, addToast]);

  useEffect(() => { void fetchBalances(); }, [fetchBalances]);

  // Fetch CoinGecko logos for all displayed tokens
  useEffect(() => {
    const ETH_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const SAIKO_ADDRESS = SAIKO_CONTRACT_ADDRESS.toLowerCase();
    const addresses = [ETH_ADDRESS, SAIKO_ADDRESS, ...customBalances.map(t => t.address.toLowerCase())];
    // Seed known logos instantly (no async)
    const instant = new Map<string, string>();
    for (const addr of addresses) {
      const known = getKnownLogoUrl(addr);
      if (known) instant.set(addr, known);
    }
    setLogoUrls(new Map(instant));
    // Then fetch unknown ones from CoinGecko
    void (async () => {
      const updates = new Map(instant);
      let changed = false;
      for (const addr of addresses) {
        if (!updates.has(addr)) {
          const url = await getTokenLogoUrl(addr);
          if (url) { updates.set(addr, url); changed = true; }
          await new Promise<void>(r => setTimeout(r, 150)); // rate limit
        }
      }
      if (changed) setLogoUrls(new Map(updates));
    })();
  }, [customBalances, SAIKO_CONTRACT_ADDRESS]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  const handleLock = useCallback(() => {
    setLocked(true);
    void navigate('/unlock');
  }, [setLocked, navigate]);

  const handleAddToken = useCallback(async () => {
    if (!newTokenAddress) return;
    setAddingToken(true);
    try {
      const addr = getAddress(newTokenAddress);
      const rpcUrl = network.rpcUrl;
      const [nameHex, symbolHex, decimalsHex] = await Promise.all([
        rpcCall<string>(rpcUrl, 'eth_call', [{ to: addr, data: '0x06fdde03' }, 'latest']),
        rpcCall<string>(rpcUrl, 'eth_call', [{ to: addr, data: '0x95d89b41' }, 'latest']),
        rpcCall<string>(rpcUrl, 'eth_call', [{ to: addr, data: '0x313ce567' }, 'latest']),
      ]);
      const name = decodeString(nameHex) || 'Unknown';
      const symbol = decodeString(symbolHex) || '???';
      const rawDec = decimalsHex && decimalsHex !== '0x' ? BigInt(decimalsHex) : 18n;
      const decimals = Number(rawDec);
      await addCustomToken({ address: addr, symbol, name, decimals });
      addToast({ type: 'success', message: `Added ${symbol}` });
      setNewTokenAddress('');
      setShowAddToken(false);
      void fetchBalances();
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message || 'Failed to add token' });
    } finally {
      setAddingToken(false);
    }
  }, [newTokenAddress, network.rpcUrl, addToast, fetchBalances]);

  /** Renders a 32px circular token logo — img if available, else text fallback. */
  const TokenIcon = ({ address, symbol, color }: { address: string; symbol: string; color: string }) => {
    const logo = logoUrls.get(address.toLowerCase());
    if (logo) {
      return (
        <img
          src={logo}
          alt={symbol}
          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', backgroundColor: COLORS.surface }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      );
    }
    return (
      <div style={{
        width: 32, height: 32, borderRadius: '50%', backgroundColor: `${color}1A`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT_FAMILY.sans, fontSize: '10px', fontWeight: FONT_WEIGHT.bold, color,
      }}>
        {symbol.slice(0, 3)}
      </div>
    );
  };

  const actionBtn: CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACING[1],
    padding: SPACING[3], backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg, cursor: 'pointer', color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY.sans, fontSize: '12px', fontWeight: FONT_WEIGHT.medium,
    transition: 'border-color 0.15s',
  };

  const tokenRow: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: `${SPACING[3]} ${SPACING[3]}`,
    borderBottom: `1px solid ${COLORS.border}`,
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
          <button onClick={() => void navigate('/history')} style={{
            background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
            padding: SPACING[1], display: 'flex',
          }} title="Transaction History">
            <IconClock size={18} />
          </button>
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

      {/* Account Switcher */}
      {accounts.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowAccountPicker(v => !v)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING[2],
            padding: `${SPACING[1]} ${SPACING[3]}`, backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, cursor: 'pointer',
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary,
          }}>
            <span style={{ fontWeight: FONT_WEIGHT.semibold }}>
              {accounts.find(a => a.index === activeAccountIndex)?.name ?? `Account ${activeAccountIndex + 1}`}
            </span>
            <span style={{ color: COLORS.textMuted, fontSize: '10px' }}>
              ▼
            </span>
          </button>
          {showAccountPicker && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              marginTop: '4px', backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              {accounts.map(acct => (
                <button
                  key={acct.index}
                  onClick={() => { switchAccount(acct.index); setShowAccountPicker(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${SPACING[2]} ${SPACING[3]}`, border: 'none', cursor: 'pointer',
                    backgroundColor: acct.index === activeAccountIndex ? `${COLORS.primary}14` : 'transparent',
                    fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontWeight: acct.index === activeAccountIndex ? FONT_WEIGHT.semibold : FONT_WEIGHT.regular }}>
                    {acct.name}
                  </span>
                  <span style={{ fontFamily: FONT_FAMILY.mono, fontSize: '10px', color: COLORS.textMuted }}>
                    {acct.address.slice(0, 6)}...{acct.address.slice(-4)}
                  </span>
                </button>
              ))}
              <button
                onClick={() => { createAccount(); setShowAccountPicker(false); }}
                style={{
                  width: '100%', padding: `${SPACING[2]} ${SPACING[3]}`, border: 'none',
                  borderTop: `1px solid ${COLORS.border}`, cursor: 'pointer',
                  backgroundColor: 'transparent', fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.xs, color: COLORS.primary, textAlign: 'center',
                }}
              >
                + Add Account
              </button>
            </div>
          )}
        </div>
      )}

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

      {/* Portfolio Hero — plain div avoids Card overflow:hidden clipping */}
      <div style={{
        textAlign: 'center',
        padding: SPACING[4],
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
      }}>
        {/* Total USD */}
        {(() => {
          if (ethPriceUsd === 0) return (
            <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: '11px', color: COLORS.textMuted, marginBottom: SPACING[1] }}>
              Loading prices…
            </div>
          );
          let total = 0;
          if (ethBalanceRaw !== null) total += Number(ethBalanceRaw) / 1e18 * ethPriceUsd;
          if (saikoBalanceRaw !== null) {
            const saikoPrice = tokenPrices[SAIKO_CONTRACT_ADDRESS.toLowerCase()];
            if (saikoPrice) total += Number(saikoBalanceRaw) / 1e18 * saikoPrice;
          }
          for (const t of customBalances) {
            const price = tokenPrices[t.address.toLowerCase()];
            if (price) total += parseFloat(t.balance) * price;
          }
          const formatted = total >= 1000
            ? `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `$${total.toFixed(2)}`;
          return (
            <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: '26px', fontWeight: 700, color: COLORS.textPrimary, marginBottom: SPACING[1] }}>
              {formatted}
            </div>
          );
        })()}
        <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted, lineHeight: 1 }}>
          {ethBalance ?? '—'} ETH
        </div>
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
      </div>

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

      {/* Assets List */}
      <div>
        <div style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary, marginBottom: SPACING[2], textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Assets
        </div>
        <Card bordered style={{ padding: 0, overflow: 'hidden' }}>
          {/* ETH row */}
          <div style={tokenRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
              <TokenIcon address="0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" symbol="ETH" color={COLORS.textSecondary} />
              <div>
                <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>ETH</div>
                <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted }}>Ethereum</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary }}>{ethBalance ?? '—'}</div>
              {ethPriceUsd > 0 && ethBalance && (
                <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: '11px', color: COLORS.textMuted }}>
                  ${(parseFloat(ethBalance) * ethPriceUsd).toFixed(2)}
                </div>
              )}
            </div>
          </div>

          {/* SAIKO row (mainnet only) */}
          {network.chainId === 1 && (
            <div style={tokenRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
                <TokenIcon address={SAIKO_CONTRACT_ADDRESS} symbol="SAIKO" color={COLORS.primary} />
                <div>
                  <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>
                    SAIKO
                  </div>
                  <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted }}>
                    Saiko
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary }}>
                  {saikoBalance !== null ? Number(saikoBalance).toLocaleString() : '—'}
                </div>
                {(() => {
                  const saikoPrice = tokenPrices[SAIKO_CONTRACT_ADDRESS.toLowerCase()];
                  if (!saikoPrice || saikoBalanceRaw === null) return null;
                  const usd = Number(saikoBalanceRaw) / 1e18 * saikoPrice;
                  return <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: '11px', color: COLORS.textMuted }}>${usd.toFixed(2)}</div>;
                })()}
              </div>
            </div>
          )}

          {/* Custom token rows */}
          {customBalances.map(t => (
            <div key={t.address} style={tokenRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
                <TokenIcon address={t.address} symbol={t.symbol} color={COLORS.textMuted} />
                <div>
                  <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>
                    {t.symbol}
                  </div>
                  <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted }}>
                    {t.name}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary }}>{t.balance}</div>
                {(() => {
                  const price = tokenPrices[t.address.toLowerCase()];
                  if (!price) return null;
                  const usd = parseFloat(t.balance) * price;
                  return <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: '11px', color: COLORS.textMuted }}>${usd < 0.01 && usd > 0 ? '<0.01' : usd.toFixed(2)}</div>;
                })()}
              </div>
            </div>
          ))}

          {/* Add Token button */}
          <button
            onClick={() => setShowAddToken(true)}
            style={{
              width: '100%', padding: `${SPACING[2]} ${SPACING[3]}`, border: 'none',
              borderTop: customBalances.length > 0 || network.chainId === 1 ? 'none' : undefined,
              cursor: 'pointer', backgroundColor: 'transparent',
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.primary,
              textAlign: 'center',
            }}
          >
            + Add Token
          </button>
        </Card>
      </div>

      {/* Network info */}
      <div style={{
        fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
        textAlign: 'center', marginTop: 'auto', paddingTop: SPACING[2],
      }}>
        Connected to {network.name}
      </div>

      {/* Add Token Modal */}
      {showAddToken && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: SPACING[4],
        }} onClick={() => setShowAddToken(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 340, backgroundColor: COLORS.background,
              borderRadius: RADIUS.lg, padding: SPACING[4],
              display: 'flex', flexDirection: 'column', gap: SPACING[3],
            }}
          >
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary,
            }}>
              Add Token
            </div>
            {/* Popular token chips */}
            {(() => {
              const existingAddrs = new Set(customBalances.map((t) => t.address.toLowerCase()));
              const SAIKO_LOWER = SAIKO_CONTRACT_ADDRESS.toLowerCase();
              const chips = POPULAR_TOKENS.filter(
                (t) => t.address.toLowerCase() !== SAIKO_LOWER && !existingAddrs.has(t.address.toLowerCase()),
              );
              if (chips.length === 0) return null;
              return (
                <div>
                  <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginBottom: SPACING[2] }}>
                    Popular
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING[1] }}>
                    {chips.map((t) => (
                      <button
                        key={t.address}
                        onClick={() => setNewTokenAddress(t.address)}
                        style={{
                          padding: `3px ${SPACING[2]}`,
                          backgroundColor: newTokenAddress.toLowerCase() === t.address.toLowerCase() ? COLORS.primary + '22' : COLORS.surface,
                          border: `1px solid ${newTokenAddress.toLowerCase() === t.address.toLowerCase() ? COLORS.primary : COLORS.border}`,
                          borderRadius: RADIUS.full,
                          color: newTokenAddress.toLowerCase() === t.address.toLowerCase() ? COLORS.primary : COLORS.textSecondary,
                          fontFamily: FONT_FAMILY.sans,
                          fontSize: '11px',
                          fontWeight: FONT_WEIGHT.medium,
                          cursor: 'pointer',
                        }}
                      >
                        {t.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            <Input
              label="Contract Address"
              value={newTokenAddress}
              onChange={setNewTokenAddress}
              placeholder="0x..."
              monospace
            />
            <div style={{ display: 'flex', gap: SPACING[2] }}>
              <Button variant="secondary" fullWidth onClick={() => setShowAddToken(false)}>
                Cancel
              </Button>
              <Button
                variant="primary" fullWidth isLoading={addingToken}
                disabled={newTokenAddress.length < 42}
                onClick={() => void handleAddToken()}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Inline keyframes for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
