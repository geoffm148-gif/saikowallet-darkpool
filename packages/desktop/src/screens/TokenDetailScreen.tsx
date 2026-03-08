/**
 * Token Detail Screen — shows balance, price, 24h change, actions, recent txs.
 *
 * Route: /token/:address
 * Special case: address === 'eth' shows native ETH details.
 */
import React, { useCallback, useContext, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconArrowDownLeft,
  IconExternalLink,
  IconTrendingUp,
  IconTrendingDown,
} from '../icons.js';
import {
  Card,
  Button,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  SAIKO_CONTRACT_ADDRESS,
  SAIKO_TOKEN,
  createRpcClient,
  createProviderConfig,
  DEFAULT_MAINNET_PROVIDERS,
  encodeBalanceOf,
  decodeUint256,
} from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context.js';
import { getActiveNetwork, getActiveRpc } from '../utils/network.js';
import { fetchTokenBalance, fetchTokenMetadata, loadCustomTokens, type CustomToken } from '../utils/tokens.js';
import { fetchTxHistory, type TxRecord } from '../utils/history.js';

// ── RPC ─────────────────────────────────────────────────────────────────────

function getRpcClient() {
  const network = getActiveNetwork();
  return createRpcClient({
    chainId: network.chainId,
    providers: [createProviderConfig(getActiveRpc()), ...DEFAULT_MAINNET_PROVIDERS],
    maxRetries: 3,
  });
}

// ── Formatting ──────────────────────────────────────────────────────────────

function formatTokenAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
  const wholeStr = whole.toLocaleString('en-US');
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

function timeAgoStr(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

// ── Layout ──────────────────────────────────────────────────────────────────

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

// ── Price types ─────────────────────────────────────────────────────────────

interface TokenPrice {
  usd: number;
  change24h: number;
}

async function fetchTokenPrice(address: string): Promise<TokenPrice | null> {
  const isSaiko = address.toLowerCase() === SAIKO_CONTRACT_ADDRESS.toLowerCase();
  try {
    if (isSaiko) {
      const res = await fetch(
        'https://api.dexscreener.com/latest/dex/tokens/0x4c89364F18Ecc562165820989549022e64eC2eD2',
      );
      if (!res.ok) return null;
      const json = await res.json();
      const pair = json?.pairs?.[0];
      if (!pair) return null;
      return {
        usd: parseFloat(pair.priceUsd) || 0,
        change24h: pair.priceChange?.h24 ?? 0,
      };
    }
    // CoinGecko by contract address
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${address}&vs_currencies=usd&include_24hr_change=true`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.[address.toLowerCase()];
    if (!data) return null;
    return {
      usd: data.usd ?? 0,
      change24h: data.usd_24h_change ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchEthPrice(): Promise<TokenPrice | null> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true',
    );
    if (!res.ok) return null;
    const json = await res.json();
    return {
      usd: json?.ethereum?.usd ?? 0,
      change24h: json?.ethereum?.usd_24h_change ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Component ───────────────────────────────────────────────────────────────

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

export function TokenDetailScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { address: tokenAddress } = useParams<{ address: string }>();
  const { walletAddress } = useContext(AppCtx);
  const isEth = tokenAddress === 'eth';
  const contractAddress = isEth ? '' : (tokenAddress ?? '');

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [price, setPrice] = useState<TokenPrice | null>(null);
  const [txs, setTxs] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);

  const addr = walletAddress || '0x0000000000000000000000000000000000000000';

  // Resolve token info
  useEffect(() => {
    if (isEth) {
      setTokenInfo({ symbol: 'ETH', name: 'Ethereum', decimals: 18 });
      return;
    }
    const isSaiko = contractAddress.toLowerCase() === SAIKO_CONTRACT_ADDRESS.toLowerCase();
    if (isSaiko) {
      setTokenInfo({ symbol: 'SAIKO', name: SAIKO_TOKEN.name, decimals: 18, logoUrl: '/assets/saiko-logo-transparent.png' });
      return;
    }
    // Check custom tokens
    const custom = loadCustomTokens().find(
      (t) => t.address.toLowerCase() === contractAddress.toLowerCase(),
    );
    if (custom) {
      setTokenInfo({ symbol: custom.symbol, name: custom.name, decimals: custom.decimals, logoUrl: custom.logoUrl });
      return;
    }
    // Fetch metadata
    void fetchTokenMetadata(contractAddress).then((meta) => {
      setTokenInfo({ symbol: meta.symbol, name: meta.name, decimals: meta.decimals });
    }).catch(() => {
      setTokenInfo({ symbol: '???', name: 'Unknown Token', decimals: 18 });
    });
  }, [isEth, contractAddress]);

  // Fetch balance
  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        if (isEth) {
          const client = getRpcClient();
          const hex = await client.send<string>({ method: 'eth_getBalance', params: [addr, 'latest'] });
          setBalance(BigInt(hex));
        } else {
          const bal = await fetchTokenBalance(contractAddress, addr);
          setBalance(bal);
        }
      } catch {
        setBalance(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [isEth, contractAddress, addr]);

  // Fetch price
  useEffect(() => {
    void (async () => {
      if (isEth) {
        setPrice(await fetchEthPrice());
      } else {
        setPrice(await fetchTokenPrice(contractAddress));
      }
    })();
  }, [isEth, contractAddress]);

  // Fetch transaction history filtered to this token
  useEffect(() => {
    setTxLoading(true);
    void fetchTxHistory(addr)
      .then((all) => {
        if (isEth) {
          setTxs(all.filter((tx) => tx.token === 'ETH'));
        } else {
          const isSaiko = contractAddress.toLowerCase() === SAIKO_CONTRACT_ADDRESS.toLowerCase();
          if (isSaiko) {
            setTxs(all.filter((tx) => tx.token === 'SAIKO'));
          } else {
            // Filter by hash matching — generic tokens won't match, show empty
            setTxs([]);
          }
        }
      })
      .catch(() => setTxs([]))
      .finally(() => setTxLoading(false));
  }, [addr, isEth, contractAddress]);

  const displayBalance = balance !== null && tokenInfo
    ? formatTokenAmount(balance, tokenInfo.decimals)
    : '---';

  const fiatValue = balance !== null && price && price.usd > 0 && tokenInfo
    ? `$${(Number(balance) / Math.pow(10, tokenInfo.decimals) * price.usd).toFixed(2)}`
    : null;

  const change24h = price?.change24h;
  const changeStr = change24h !== undefined && change24h !== null
    ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`
    : null;

  const explorerUrl = getActiveNetwork().explorerUrl;

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
            {tokenInfo?.symbol ?? 'Token'}
          </h1>
        </div>

        {/* Token Info Card */}
        <Card bordered elevated>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[4], marginBottom: SPACING[4] }}>
            {/* Logo */}
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: isEth ? 'rgba(98,126,234,0.12)' : `${COLORS.primary}20`,
              border: `1px solid ${isEth ? '#627EEA' : COLORS.primary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}>
              {tokenInfo?.logoUrl ? (
                <img
                  src={tokenInfo.logoUrl}
                  alt={tokenInfo.symbol}
                  style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : isEth ? (
                <span style={{ fontSize: '28px', fontWeight: 900, color: '#627EEA' }}>$</span>
              ) : (
                <span style={{
                  fontFamily: FONT_FAMILY.mono,
                  fontSize: FONT_SIZE.lg,
                  fontWeight: FONT_WEIGHT.bold,
                  color: COLORS.textSecondary,
                }}>
                  {(tokenInfo?.symbol ?? '??').slice(0, 2)}
                </span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.lg,
                fontWeight: FONT_WEIGHT.bold,
                color: COLORS.textPrimary,
              }}>
                {tokenInfo?.name ?? 'Loading...'}
              </div>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.textMuted,
              }}>
                {tokenInfo?.symbol ?? ''}
              </div>
            </div>
          </div>

          {/* Balance */}
          {loading ? (
            <div style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE['2xl'],
              color: COLORS.textMuted,
              marginBottom: SPACING[2],
            }}>
              Loading...
            </div>
          ) : (
            <>
              <div style={{
                fontFamily: FONT_FAMILY.mono,
                fontSize: FONT_SIZE['2xl'],
                fontWeight: FONT_WEIGHT.bold,
                color: COLORS.textPrimary,
                marginBottom: SPACING[1],
              }}>
                {displayBalance} {tokenInfo?.symbol}
              </div>
              {fiatValue && (
                <div style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.base,
                  color: COLORS.textSecondary,
                  marginBottom: SPACING[1],
                }}>
                  {fiatValue}
                </div>
              )}
            </>
          )}

          {/* Price + 24h change */}
          {price && price.usd > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACING[3],
              marginTop: SPACING[2],
            }}>
              <span style={{
                fontFamily: FONT_FAMILY.mono,
                fontSize: FONT_SIZE.sm,
                color: COLORS.textMuted,
              }}>
                ${price.usd < 0.01 ? price.usd.toExponential(2) : price.usd.toFixed(2)}
              </span>
              {changeStr && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  backgroundColor: change24h! >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(227,27,35,0.12)',
                  color: change24h! >= 0 ? COLORS.success : COLORS.error,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontSize: FONT_SIZE.xs,
                  fontWeight: FONT_WEIGHT.semibold,
                }}>
                  {change24h! >= 0 ? <IconTrendingUp size={10} /> : <IconTrendingDown size={10} />}
                  {changeStr}
                </span>
              )}
            </div>
          )}
        </Card>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: SPACING[4] }}>
          <motion.div style={{ flex: 1 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => void navigate(isEth ? '/send' : `/send?token=${contractAddress}`)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <IconArrowUpRight size={18} /> Send
              </span>
            </Button>
          </motion.div>
          <motion.div style={{ flex: 1 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="secondary"
              fullWidth
              size="lg"
              onClick={() => void navigate('/receive')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <IconArrowDownLeft size={18} /> Receive
              </span>
            </Button>
          </motion.div>
        </div>

        {/* Recent Transactions */}
        <Card title="Recent Transactions">
          {txLoading ? (
            <div style={{
              textAlign: 'center',
              padding: SPACING[4],
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textMuted,
            }}>
              Loading transactions...
            </div>
          ) : txs.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: SPACING[4],
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textMuted,
            }}>
              No transactions for this token
            </div>
          ) : (
            txs.slice(0, 10).map((tx, i) => (
              <motion.div
                key={tx.hash}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.05, ease: 'easeOut' }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACING[4],
                  padding: `${SPACING[3]} 0`,
                  borderBottom: i < Math.min(txs.length, 10) - 1 ? `1px solid ${COLORS.divider}` : 'none',
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: tx.isIncoming ? 'rgba(67,160,71,0.15)' : 'rgba(227,27,35,0.15)',
                  color: tx.isIncoming ? COLORS.success : COLORS.error,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {tx.isIncoming ? <IconArrowDownLeft size={14} /> : <IconArrowUpRight size={14} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.sm,
                    fontWeight: FONT_WEIGHT.medium,
                    color: COLORS.textPrimary,
                    textTransform: 'capitalize',
                  }}>
                    {tx.type}
                  </div>
                  <div style={{
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.xs,
                    color: COLORS.textMuted,
                  }}>
                    {tx.counterparty} &middot; {timeAgoStr(tx.timestamp)}
                  </div>
                </div>
                <div style={{
                  fontFamily: FONT_FAMILY.mono,
                  fontSize: FONT_SIZE.sm,
                  fontWeight: FONT_WEIGHT.medium,
                  color: tx.isIncoming ? COLORS.success : COLORS.textPrimary,
                  flexShrink: 0,
                }}>
                  {tx.isIncoming ? '+' : '-'}{tx.amount} {tx.symbol}
                </div>
              </motion.div>
            ))
          )}
        </Card>

        {/* Etherscan link */}
        {!isEth && (
          <div style={{ textAlign: 'center' }}>
            <a
              href={`${explorerUrl}/token/${contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.textMuted,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              View on Etherscan <IconExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
