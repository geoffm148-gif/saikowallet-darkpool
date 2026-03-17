/**
 * Dashboard Screen — Main wallet view.
 *
 * Shows:
 * - Header with wallet address + lock button
 * - SAIKO balance (featured, hero-sized)
 * - ETH balance
 * - Action buttons: Send, Receive, Swap
 * - Transaction history (placeholder)
 * - Community links
 *
 * Balances fetched via wallet-core RPC client.
 * SAIKO price fetched from CoinGecko with stale fallback.
 */
import React, { useCallback, useContext, useEffect, useState, useRef, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  IconSettings,
  IconLock,
  IconArrowUpRight,
  IconArrowDownLeft,
  IconArrowLeftRight,
  IconMessageCircle,
  IconTwitter,
  IconGlobe,
  IconRefreshCw,
  IconShield,
  IconLink2,
  IconCheck,
  IconClock,
  IconTrendingUp,
  IconTrendingDown,
  IconPlus,
} from '../icons.js';
import { CURRENCIES, formatFiat } from '../constants/currencies.js';
import {
  Card,
  TokenBalance,
  AddressDisplay,
  Badge,
  Button,
  SecurityBadge,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  SAIKO_TOKEN,
  SAIKO_CONTRACT_ADDRESS,
  SAIKO_COMMUNITY,
  createRpcClient,
  createProviderConfig,
  DEFAULT_MAINNET_PROVIDERS,
  // M-7: MAINNET_CHAIN_ID removed — use getActiveNetwork().chainId instead
  encodeBalanceOf,
  decodeUint256,
} from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context.js';
import { AccountSwitcherTrigger, AccountSwitcherDropdown } from '../components/AccountSwitcher.js';
import { fetchPrices as fetchSharedPrices, getCachedPrices as getSharedCachedPrices, type PriceData as SharedPriceData } from '../utils/price.js';
import { fetchTxHistory, type TxRecord } from '../utils/history.js';
import { getActiveNetwork, getActiveRpc, isTorEnabled } from '../utils/network.js';
import {
  loadCustomTokens,
  fetchTokenBalance as fetchCustomTokenBalance,
  fetchTokenMetadata,
  addCustomToken,
  POPULAR_TOKENS,
  type CustomToken,
} from '../utils/tokens.js';
import { fetchTokenPrices } from '../utils/coingecko.js';

// ── RPC helpers ──────────────────────────────────────────────────────────────

function getRpcClient() {
  const network = getActiveNetwork();
  // Tor status: isTorEnabled() is read here. RpcClientConfig does not support
  // a proxyUrl field — SOCKS5 proxying requires the Electron/Tauri shell layer
  // which routes fetch() through the Tor daemon. Full Tor routing: Sprint 3.
  if (isTorEnabled()) {
    // eslint-disable-next-line no-console
    console.info('[Tor] Tor enabled — full SOCKS5 routing requires desktop binary (Sprint 3)');
  }
  return createRpcClient({
    chainId: network.chainId,
    providers: [createProviderConfig(getActiveRpc()), ...DEFAULT_MAINNET_PROVIDERS],
    maxRetries: 3,
  });
}

async function fetchEthBalance(address: string): Promise<bigint> {
  const client = getRpcClient();
  const hex = await client.send<string>({
    method: 'eth_getBalance',
    params: [address, 'latest'],
  });
  return BigInt(hex);
}

async function fetchTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
  const client = getRpcClient();
  const data = encodeBalanceOf(walletAddress);
  const result = await client.send<string>({
    method: 'eth_call',
    params: [{ to: tokenAddress, data }, 'latest'],
  });
  return decodeUint256(result);
}

// ── Price fetch (shared util) ────────────────────────────────────────────────

const LS_CURRENCY = 'saiko_currency';
function getSelectedCurrency(): string {
  try { return localStorage.getItem(LS_CURRENCY) ?? 'USD'; } catch { return 'USD'; }
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatTokenAmount(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
  const wholeStr = whole.toLocaleString('en-US');
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

function formatFiatDisplay(amount: number): string {
  if (amount === 0) return formatFiat(0, getSelectedCurrency());
  return formatFiat(amount, getSelectedCurrency());
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ width, height }: { width: string; height: string }): React.ReactElement {
  return (
    <motion.div
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width,
        height,
        borderRadius: RADIUS.sm,
        backgroundColor: COLORS.border,
      }}
    />
  );
}

// ── Time formatting ──────────────────────────────────────────────────────────

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

// ── Shared layout ─────────────────────────────────────────────────────────────

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
};

const CONTENT_STYLE: CSSProperties = {
  maxWidth: '720px',
  width: '100%',
  margin: '0 auto',
  padding: `${SPACING[6]} ${SPACING[6]}`,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING[6],
};

const PREMIUM_CARD_SHADOW = '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 4px 16px rgba(0,0,0,0.3)';

const iconButtonBase: CSSProperties = {
  background: 'none',
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS.md,
  color: COLORS.textSecondary,
  cursor: 'pointer',
  padding: `${SPACING[2]} ${SPACING[3]}`,
  display: 'flex',
  alignItems: 'center',
  gap: SPACING[2],
  transition: 'color 0.15s ease, border-color 0.15s ease',
  outline: 'none',
};

// ── Header ────────────────────────────────────────────────────────────────────

export const LS_AUTO_REFRESH = 'saiko_auto_refresh_seconds';

function Header({
  address,
  onLock,
  onSettings,
  onRefresh,
  isRefreshing,
}: {
  address: string;
  onLock: () => void;
  onSettings: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}): React.ReactElement {
  const ctx = useContext(AppCtx);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const activeAccount = ctx.accounts.find(a => a.index === ctx.activeAccountIndex) ?? ctx.accounts[0];

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${SPACING[4]} ${SPACING[6]}`,
    backgroundColor: COLORS.surface,
    borderBottom: `1px solid ${COLORS.border}`,
    gap: SPACING[4],
  };

  const logoStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: SPACING[3],
  };

  const actionsStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: SPACING[3],
  };

  const handleRename = React.useCallback((index: number, newName: string) => {
    if (newName.trim()) ctx.renameAccount(index, newName.trim());
  }, [ctx]);

  const handleRemove = React.useCallback((index: number) => {
    ctx.removeAccount(index);
  }, [ctx]);

  return (
    <header style={headerStyle}>
      <div style={logoStyle}>
        <img
          src="/assets/saiko-logo-transparent.png"
          alt="Saiko"
          style={{ width: '36px', height: '36px', objectFit: 'contain' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.base,
          fontWeight: FONT_WEIGHT.semibold,
          color: COLORS.textPrimary,
        }}>
          SAIKO WALLET
        </span>
      </div>

      {/* Account switcher replaces static AddressDisplay */}
      <div style={{ position: 'relative' }}>
        {activeAccount ? (
          <>
            <AccountSwitcherTrigger
              account={activeAccount}
              onClick={() => setDropdownOpen(!dropdownOpen)}
            />
            <AccountSwitcherDropdown
              open={dropdownOpen}
              onClose={() => setDropdownOpen(false)}
              accounts={ctx.accounts}
              activeIndex={ctx.activeAccountIndex}
              onSelect={(index) => ctx.switchAccount(index)}
              onCreateNew={() => ctx.createAccount()}
              onRename={handleRename}
              onRemove={handleRemove}
            />
          </>
        ) : (
          <AddressDisplay address={address} truncateChars={5} />
        )}
      </div>

      <div style={actionsStyle}>
        {isTorEnabled() && (
          <motion.button
            style={{
              ...iconButtonBase,
              borderColor: COLORS.success,
              color: COLORS.success,
              fontSize: FONT_SIZE.xs,
              fontWeight: FONT_WEIGHT.bold,
              fontFamily: FONT_FAMILY.mono,
              padding: `${SPACING[1]} ${SPACING[2]}`,
            }}
            onClick={onSettings}
            aria-label="Tor enabled — click to view settings"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Tor routing enabled"
          >
            T
          </motion.button>
        )}
        {(() => {
          const net = getActiveNetwork();
          if (net.id === 'mainnet') return <Badge variant="connected" dot>Mainnet</Badge>;
          if (net.isTestnet) return <Badge variant="testnet" dot>{net.name.split(' ')[0]}</Badge>;
          return <Badge variant="default" dot>{net.name}</Badge>;
        })()}
        <motion.button
          style={iconButtonBase}
          onClick={onRefresh}
          aria-label="Refresh balances"
          whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
          whileTap={{ scale: 0.95 }}
          animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
          transition={isRefreshing ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : { duration: 0 }}
        >
          <IconRefreshCw size={16} />
        </motion.button>
        <motion.button
          style={iconButtonBase}
          onClick={onSettings}
          aria-label="Settings"
          whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
          whileTap={{ scale: 0.95 }}
        >
          <IconSettings size={16} />
        </motion.button>
        <motion.button
          style={iconButtonBase}
          onClick={onLock}
          aria-label="Lock wallet"
          whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
          whileTap={{ scale: 0.95 }}
        >
          <IconLock size={16} />
        </motion.button>
      </div>
    </header>
  );
}

// ── Action Buttons ────────────────────────────────────────────────────────────

const ACTION_DEFS = [
  { icon: <IconArrowUpRight size={28} />, label: 'Send', key: 'send' },
  { icon: <IconArrowDownLeft size={28} />, label: 'Receive', key: 'receive' },
  { icon: <IconArrowLeftRight size={28} />, label: 'Swap', key: 'swap' },
  { icon: <IconShield size={28} />, label: 'DarkPool', key: 'darkpool' },
  { icon: <IconLink2 size={28} />, label: 'WalletConnect', key: 'walletconnect' },
] as const;

function ActionButtons({
  onSend,
  onReceive,
  onSwap,
  onDarkPool,
  onWalletConnect,
}: {
  onSend: () => void;
  onReceive: () => void;
  onSwap: () => void;
  onDarkPool: () => void;
  onWalletConnect: () => void;
}): React.ReactElement {
  const containerStyle: CSSProperties = {
    display: 'flex',
    gap: SPACING[4],
  };

  const actionStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: SPACING[2],
    padding: SPACING[4],
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg,
    cursor: 'pointer',
    outline: 'none',
    color: COLORS.textSecondary,
  };

  const labelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  };

  const handlers: Record<string, () => void> = {
    send: onSend,
    receive: onReceive,
    swap: onSwap,
    darkpool: onDarkPool,
    walletconnect: onWalletConnect,
  };

  return (
    <div style={containerStyle}>
      {ACTION_DEFS.map(({ icon, label, key }, i) => (
        <motion.button
          key={label}
          data-testid={`${key}-btn`}
          style={{
            ...actionStyle,
            ...(key === 'darkpool' ? {
              borderColor: 'rgba(227,27,35,0.4)',
              color: COLORS.primary,
            } : {}),
          }}
          onClick={handlers[key]}
          aria-label={label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: i * 0.05, ease: 'easeOut' }}
          whileHover={{ scale: 1.02, borderColor: COLORS.primary }}
          whileTap={{ scale: 0.98 }}
        >
          <span aria-hidden="true">{icon}</span>
          <span style={{
            ...labelStyle,
            ...(key === 'darkpool' ? { color: COLORS.primary } : {}),
          }}>{label}</span>
        </motion.button>
      ))}
    </div>
  );
}

// ── Transaction History ───────────────────────────────────────────────────────

const LS_NOTIFICATIONS = 'saiko_notif_enabled';

function sendBrowserNotification(title: string, body: string): void {
  try {
    if (!('Notification' in window)) return;
    if (localStorage.getItem(LS_NOTIFICATIONS) !== 'true') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch { /* ignore */ }
}

function TransactionHistory({ walletAddress }: { walletAddress: string }): React.ReactElement {
  const [txs, setTxs] = React.useState<TxRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const prevTxHashesRef = React.useRef<Set<string>>(new Set());

  const load = React.useCallback(() => {
    if (!walletAddress) return;
    setLoading(true);
    setError(false);
    fetchTxHistory(walletAddress)
      .then((newTxs) => {
        // Detect new incoming transactions for browser notifications
        if (prevTxHashesRef.current.size > 0) {
          for (const tx of newTxs) {
            if (tx.isIncoming && !prevTxHashesRef.current.has(tx.hash)) {
              sendBrowserNotification(
                `Received ${tx.amount} ${tx.symbol}`,
                `From ${tx.counterparty}`,
              );
            }
          }
        }
        prevTxHashesRef.current = new Set(newTxs.map((t) => t.hash));
        setTxs(newTxs);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [walletAddress]);

  React.useEffect(() => { load(); }, [load]);

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: SPACING[4],
    padding: `${SPACING[4]} 0`,
    borderBottom: `1px solid ${COLORS.divider}`,
  };

  const iconStyle: CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  return (
    <Card title="Recent Activity">
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], padding: SPACING[2] }}>
          <Skeleton width="100%" height="48px" />
          <Skeleton width="100%" height="48px" />
          <Skeleton width="100%" height="48px" />
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: SPACING[4] }}>
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: SPACING[3] }}>
            Unable to load history
          </div>
          <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
        </div>
      ) : txs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: SPACING[4], fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted }}>
          No transactions yet
        </div>
      ) : (
        txs.map((tx, i) => (
          <motion.div
            key={tx.hash}
            style={rowStyle}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05, ease: 'easeOut' }}
          >
            <div
              style={{
                ...iconStyle,
                backgroundColor: tx.isIncoming
                  ? 'rgba(67,160,71,0.15)'
                  : tx.type === 'swap' ? 'rgba(66,165,245,0.15)' : 'rgba(227,27,35,0.15)',
                color: tx.isIncoming ? COLORS.success : tx.type === 'swap' ? '#42A5F5' : COLORS.error,
              }}
            >
              {tx.isIncoming
                ? <IconArrowDownLeft size={16} />
                : tx.type === 'swap' ? <IconArrowLeftRight size={16} /> : <IconArrowUpRight size={16} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.md,
                fontWeight: FONT_WEIGHT.medium,
                color: COLORS.textPrimary,
                textTransform: 'capitalize',
              }}>
                {tx.type}
              </div>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.textMuted,
              }}>
                {tx.counterparty} &middot; {timeAgoStr(tx.timestamp)}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontFamily: FONT_FAMILY.mono,
                fontSize: FONT_SIZE.md,
                fontWeight: FONT_WEIGHT.medium,
                color: tx.isIncoming ? COLORS.success : COLORS.textPrimary,
              }}>
                {tx.isIncoming ? '+' : '-'}{tx.amount} {tx.symbol}
              </div>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.xs,
                color: tx.status === 'failed' ? COLORS.error : COLORS.success,
              }}>
                {tx.status}
              </div>
            </div>
          </motion.div>
        ))
      )}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        paddingTop: SPACING[4],
      }}>
        <a
          href={`${getActiveNetwork().explorerUrl}/address/${walletAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textMuted,
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          View All on Etherscan
        </a>
      </div>
    </Card>
  );
}

// ── Community Links ───────────────────────────────────────────────────────────

const COMMUNITY_DEFS = [
  { icon: <IconMessageCircle size={16} />, label: 'Telegram', key: 'telegram' },
  { icon: <IconTwitter size={16} />, label: 'Twitter', key: 'twitter' },
  { icon: <IconGlobe size={16} />, label: 'Website', key: 'website' },
] as const;

function CommunityLinks(): React.ReactElement {
  const linkStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    padding: `${SPACING[3]} ${SPACING[4]}`,
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.md,
    color: COLORS.textSecondary,
    textDecoration: 'none',
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    cursor: 'pointer',
  };

  const urls: Record<string, string> = {
    telegram: SAIKO_COMMUNITY.telegram,
    twitter: SAIKO_COMMUNITY.twitter,
    website: SAIKO_COMMUNITY.website,
  };

  return (
    <Card title="Community">
      <div style={{ display: 'flex', gap: SPACING[3] }}>
        {COMMUNITY_DEFS.map(({ icon, label, key }) => (
          <motion.a
            key={label}
            href={urls[key]}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
            aria-label={`Visit Saiko Inu on ${label}`}
            whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </motion.a>
        ))}
      </div>
    </Card>
  );
}

// ── Balance State ─────────────────────────────────────────────────────────────

interface CustomTokenBalance {
  token: CustomToken;
  balance: bigint;
}

interface BalanceState {
  saikoRaw: bigint | null;
  ethRaw: bigint | null;
  priceData: SharedPriceData | null;
  customTokens: CustomTokenBalance[];
  tokenPrices: Record<string, number>;
  isLoading: boolean;
  error: string | null;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DashboardScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress, setLocked } = useContext(AppCtx);
  const isMounted = useRef(true);

  const [balances, setBalances] = useState<BalanceState>({
    saikoRaw: null,
    ethRaw: null,
    priceData: null,
    customTokens: [],
    tokenPrices: {},
    isLoading: true,
    error: null,
  });
  const [showAddToken, setShowAddToken] = useState(false);
  const [addTokenAddress, setAddTokenAddress] = useState('');
  const [addTokenMeta, setAddTokenMeta] = useState<CustomToken | null>(null);
  const [addTokenLoading, setAddTokenLoading] = useState(false);
  const [addTokenError, setAddTokenError] = useState('');

  const address = walletAddress || '0x0000000000000000000000000000000000000000';

  // ── Easter egg: "starship" keyword + Konami code ─────────────────────────
  useEffect(() => {
    const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight'];
    let typed = '';
    let konamiIdx = 0;
    const handler = (e: KeyboardEvent) => {
      // Konami code
      if (e.key === KONAMI[konamiIdx]) {
        konamiIdx++;
        if (konamiIdx === KONAMI.length) { konamiIdx = 0; void navigate('/starship'); return; }
      } else {
        konamiIdx = 0;
      }
      // "starship" typing (ignore if focused on an input)
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key.length === 1) {
        typed += e.key.toLowerCase();
        if (typed.length > 10) typed = typed.slice(-10);
        if (typed.includes('starship')) { void navigate('/starship'); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  // ─────────────────────────────────────────────────────────────────────────

  const loadBalances = useCallback(async () => {
    setBalances((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const customTokenList = loadCustomTokens();
      const isMainnet = getActiveNetwork().chainId === 1;

      // On mainnet: auto-detect popular tokens not already in the custom list
      const customAddresses = new Set(customTokenList.map((t) => t.address.toLowerCase()));
      const SAIKO_LOWER = SAIKO_CONTRACT_ADDRESS.toLowerCase();
      const popularToCheck = isMainnet
        ? POPULAR_TOKENS.filter(
            (t) => t.address.toLowerCase() !== SAIKO_LOWER && !customAddresses.has(t.address.toLowerCase()),
          )
        : [];

      const allSettled = await Promise.allSettled([
        fetchEthBalance(address),
        fetchTokenBalance(SAIKO_CONTRACT_ADDRESS, address),
        fetchSharedPrices(),
        ...customTokenList.map((t) => fetchCustomTokenBalance(t.address, address)),
        ...popularToCheck.map((t) => fetchCustomTokenBalance(t.address, address)),
      ]);

      if (!isMounted.current) return;

      const ethRaw = allSettled[0]!;
      const saikoRaw = allSettled[1]!;
      const priceData = allSettled[2]!;
      const customResults = allSettled.slice(3, 3 + customTokenList.length);
      const popularResults = allSettled.slice(3 + customTokenList.length);

      const customTokens: CustomTokenBalance[] = [];
      for (let i = 0; i < customTokenList.length; i++) {
        const result = customResults[i];
        const balance = result && result.status === 'fulfilled' ? result.value as bigint : 0n;
        customTokens.push({ token: customTokenList[i]!, balance });
      }

      // Add auto-detected popular tokens with non-zero balance
      const chainId = getActiveNetwork().chainId;
      for (let i = 0; i < popularToCheck.length; i++) {
        const result = popularResults[i];
        const balance = result && result.status === 'fulfilled' ? result.value as bigint : 0n;
        if (balance > 0n) {
          customTokens.push({
            token: { ...popularToCheck[i]!, chainId, isCustom: true },
            balance,
          });
        }
      }

      // Fetch USD prices for custom/popular tokens (non-blocking — set state first then update)
      const customAddrsForPricing = customTokens.map((ct) => ct.token.address);
      const tokenPricesResult: Record<string, number> = {};
      fetchTokenPrices(customAddrsForPricing).then((prices) => {
        if (!isMounted.current) return;
        setBalances((prev) => ({ ...prev, tokenPrices: prices }));
      }).catch(() => { /* non-critical */ });

      setBalances({
        ethRaw: ethRaw.status === 'fulfilled' ? ethRaw.value : null,
        saikoRaw: saikoRaw.status === 'fulfilled' ? saikoRaw.value : null,
        priceData: priceData.status === 'fulfilled' ? priceData.value : getSharedCachedPrices(),
        customTokens,
        tokenPrices: tokenPricesResult,
        isLoading: false,
        error: ethRaw.status === 'rejected' && saikoRaw.status === 'rejected'
          ? 'Could not fetch balances. Check your connection.'
          : null,
      });
    } catch {
      if (!isMounted.current) return;
      setBalances((prev) => ({ ...prev, isLoading: false, error: 'Network error fetching balances.' }));
    }
  }, [address]);

  useEffect(() => {
    isMounted.current = true;
    void loadBalances();

    // Auto-refresh interval (0 = off)
    const seconds = parseInt(localStorage.getItem(LS_AUTO_REFRESH) ?? '0', 10);
    if (seconds > 0) {
      const interval = setInterval(() => void loadBalances(), seconds * 1000);
      return () => { isMounted.current = false; clearInterval(interval); };
    }

    return () => { isMounted.current = false; };
  }, [loadBalances]);

  // Derived display values
  const ethBalance = balances.ethRaw !== null ? formatTokenAmount(balances.ethRaw, 18) : '—';
  const saikoBalance = balances.saikoRaw !== null ? formatTokenAmount(balances.saikoRaw, 18) : '—';

  const ethUsdPrice = balances.priceData?.ethUsd ?? 0;
  const ethFiat = balances.ethRaw !== null && ethUsdPrice > 0
    ? formatFiatDisplay(Number(balances.ethRaw) / 1e18 * ethUsdPrice)
    : '—';

  const saikoUsdPrice = balances.priceData?.saikoUsd ?? 0;
  const saikoFiat = balances.saikoRaw !== null && saikoUsdPrice > 0
    ? formatFiatDisplay(Number(balances.saikoRaw) / 1e18 * saikoUsdPrice)
    : '—';
  const saikoChange = balances.priceData
    ? `${balances.priceData.change24h >= 0 ? '+' : ''}${balances.priceData.change24h.toFixed(2)}%`
    : undefined;
  const ethChange = balances.priceData?.ethChange24h
    ? `${balances.priceData.ethChange24h >= 0 ? '+' : ''}${balances.priceData.ethChange24h.toFixed(2)}%`
    : undefined;

  // Total portfolio value in USD
  const totalPortfolioUsd = (() => {
    let total = 0;
    let hasPrices = false;
    if (balances.ethRaw !== null && ethUsdPrice > 0) {
      total += Number(balances.ethRaw) / 1e18 * ethUsdPrice;
      hasPrices = true;
    }
    if (balances.saikoRaw !== null && saikoUsdPrice > 0) {
      total += Number(balances.saikoRaw) / 1e18 * saikoUsdPrice;
      hasPrices = true;
    }
    for (const { token, balance } of balances.customTokens) {
      const price = balances.tokenPrices[token.address.toLowerCase()];
      if (price && price > 0) {
        total += Number(balance) / 10 ** token.decimals * price;
        hasPrices = true;
      }
    }
    return hasPrices ? total : null;
  })();

  const totalPortfolioDisplay = totalPortfolioUsd !== null
    ? formatFiatDisplay(totalPortfolioUsd)
    : '—';

  const handleLock = useCallback((): void => {
    setLocked(true);
    void navigate('/unlock');
  }, [setLocked, navigate]);

  return (
    <div style={PAGE_STYLE}>
      <Header
        address={address}
        onLock={handleLock}
        onSettings={() => void navigate('/settings')}
        onRefresh={() => void loadBalances()}
        isRefreshing={balances.isLoading}
      />

      <div style={CONTENT_STYLE}>
        {/* Portfolio Total */}
        <div style={{
          padding: `${SPACING[3]} ${SPACING[1]} ${SPACING[2]}`,
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.xs,
            color: COLORS.textMuted,
            fontWeight: FONT_WEIGHT.medium,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: SPACING[1],
          }}>Total Portfolio Value</div>
          <div style={{
            fontFamily: FONT_FAMILY.mono,
            fontSize: '28px',
            color: COLORS.textPrimary,
            fontWeight: FONT_WEIGHT.bold,
            letterSpacing: '-0.5px',
          }}>
            {balances.isLoading && totalPortfolioDisplay === '—' ? (
              <span style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.lg }}>Loading…</span>
            ) : totalPortfolioDisplay}
          </div>
          {balances.priceData && (
            <div style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.xs,
              color: COLORS.textMuted,
              marginTop: SPACING[1],
            }}>
              <IconClock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
              {`Updated ${Math.max(1, Math.round((Date.now() - balances.priceData.updatedAt) / 1000))}s ago`}
            </div>
          )}
        </div>

        {/* Backup Warning Banner */}
        {localStorage.getItem('saiko_recovery_verified') !== 'true' && (
          <div
            style={{
              background: `${COLORS.warning}1F`,
              border: `1px solid ${COLORS.warning}66`,
              borderRadius: RADIUS.md,
              padding: `${SPACING[3]} ${SPACING[4]}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: SPACING[3],
            }}
          >
            <span style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: '#FFB74D',
              display: 'flex',
              alignItems: 'center',
              gap: SPACING[2],
            }}>
              {'\u26A0\uFE0F'} Backup not verified — funds at risk if you lose this device.
            </span>
            <Button variant="secondary" size="sm" onClick={() => void navigate('/settings')}>
              Verify Now
            </Button>
          </div>
        )}

        {/* SAIKO Balance — Featured Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0, ease: 'easeOut' }}
          style={{
            background: 'linear-gradient(135deg, #1A0A0A 0%, #141414 60%, #0A0A0A 100%)',
            borderRadius: RADIUS.lg,
            boxShadow: '0 0 40px rgba(227,27,35,0.08), 0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          <Card bordered elevated>
            {balances.isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], padding: SPACING[4] }}>
                <Skeleton width="120px" height="16px" />
                <Skeleton width="240px" height="40px" />
                <Skeleton width="100px" height="14px" />
              </div>
            ) : (
              <TokenBalance
                symbol="SAIKO"
                name={SAIKO_TOKEN.name}
                balance={saikoBalance}
                fiatValue={saikoFiat}
                logoUrl="/assets/saiko-logo.png"
                featured
              />
            )}
          </Card>
        </motion.div>

        {/* Action Buttons */}
        <ActionButtons
          onSend={() => void navigate('/send')}
          onReceive={() => void navigate('/receive')}
          onSwap={() => void navigate('/swap')}
          onDarkPool={() => void navigate('/darkpool')}
          onWalletConnect={() => void navigate('/walletconnect')}
        />

        {/* Assets */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1, ease: 'easeOut' }}
          style={{ boxShadow: PREMIUM_CARD_SHADOW }}
        >
          <Card title="Assets" headerAction={
            <motion.button
              style={{ ...iconButtonBase, padding: SPACING[1] }}
              onClick={() => void loadBalances()}
              aria-label="Refresh balances"
              whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
              whileTap={{ scale: 0.9 }}
            >
              <IconRefreshCw size={14} />
            </motion.button>
          }>
            {balances.isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], padding: SPACING[2] }}>
                <Skeleton width="180px" height="20px" />
                <Skeleton width="100px" height="14px" />
                <Skeleton width="180px" height="20px" />
                <Skeleton width="100px" height="14px" />
              </div>
            ) : (
              <div>
                {/* SAIKO row */}
                <div
                  data-testid="saiko-token-row"
                  onClick={() => void navigate('/token/0x4c89364F18Ecc562165820989549022e64eC2eD2')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: SPACING[4],
                    padding: `${SPACING[4]} 0`,
                    borderBottom: `1px solid ${COLORS.border}`,
                    cursor: 'pointer',
                  }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: `${COLORS.primary}20`,
                    border: `1px solid ${COLORS.primary}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}>
                    <img
                      src="/assets/saiko-logo-transparent.png"
                      alt="SAIKO"
                      style={{ width: '36px', height: '36px', objectFit: 'contain' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>SAIKO</div>
                    <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Saiko Inu
                      {saikoChange && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          backgroundColor: balances.priceData && balances.priceData.change24h >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(227,27,35,0.12)',
                          color: balances.priceData && balances.priceData.change24h >= 0 ? COLORS.success : COLORS.error,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: FONT_SIZE.xs,
                          fontWeight: FONT_WEIGHT.semibold,
                        }}>
                          {balances.priceData && balances.priceData.change24h >= 0
                            ? <IconTrendingUp size={10} />
                            : <IconTrendingDown size={10} />
                          }
                          {saikoChange}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>{saikoBalance}</div>
                    <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginTop: '2px' }}>{saikoFiat}</div>
                  </div>
                </div>

                {/* ETH row */}
                <div
                  data-testid="eth-token-row"
                  onClick={() => void navigate('/token/eth')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: SPACING[4],
                    padding: `${SPACING[4]} 0`,
                    borderBottom: balances.customTokens.length > 0 ? `1px solid ${COLORS.border}` : undefined,
                    cursor: 'pointer',
                  }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(98,126,234,0.12)',
                    border: '1px solid #627EEA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '20px',
                    fontWeight: 900,
                    color: '#627EEA',
                  }}>
                    Ξ
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>ETH</div>
                    <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Ethereum
                      {ethChange && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          backgroundColor: balances.priceData && balances.priceData.ethChange24h >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(227,27,35,0.12)',
                          color: balances.priceData && balances.priceData.ethChange24h >= 0 ? COLORS.success : COLORS.error,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: FONT_SIZE.xs,
                          fontWeight: FONT_WEIGHT.semibold,
                        }}>
                          {balances.priceData && balances.priceData.ethChange24h >= 0
                            ? <IconTrendingUp size={10} />
                            : <IconTrendingDown size={10} />
                          }
                          {ethChange}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>{ethBalance}</div>
                    <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginTop: '2px' }}>{ethFiat}</div>
                  </div>
                </div>

                {/* Custom token rows */}
                {balances.customTokens.map(({ token, balance }, i) => (
                  <div
                    key={token.address}
                    onClick={() => void navigate(`/token/${token.address}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: SPACING[4],
                      padding: `${SPACING[4]} 0`,
                      borderBottom: i < balances.customTokens.length - 1 ? `1px solid ${COLORS.border}` : undefined,
                      cursor: 'pointer',
                    }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(227,27,35,0.08)',
                      border: `1px solid ${COLORS.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: '14px',
                      fontWeight: 700,
                      color: COLORS.textSecondary,
                      fontFamily: FONT_FAMILY.mono,
                    }}>
                      {token.logoUrl ? (
                        <img src={token.logoUrl} alt={token.symbol} style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                      ) : (
                        token.symbol.slice(0, 2)
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>{token.symbol}</div>
                      <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginTop: '2px' }}>{token.name}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>
                        {formatTokenAmount(balance, token.decimals)}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add Token button */}
                <div style={{ paddingTop: SPACING[4], textAlign: 'center' }}>
                  <button
                    onClick={() => setShowAddToken(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: SPACING[2],
                      backgroundColor: 'transparent',
                      border: `1px solid ${COLORS.primary}`,
                      borderRadius: RADIUS.md,
                      color: COLORS.primary,
                      fontFamily: FONT_FAMILY.sans,
                      fontSize: FONT_SIZE.sm,
                      fontWeight: FONT_WEIGHT.semibold,
                      cursor: 'pointer',
                      padding: `${SPACING[2]} ${SPACING[4]}`,
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${COLORS.primary}15`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                  >
                    <IconPlus size={14} />
                    Add Token
                  </button>
                </div>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Error Banner */}
        {balances.error && (
          <div style={{
            backgroundColor: 'rgba(227,27,35,0.08)',
            border: `1px solid rgba(227,27,35,0.3)`,
            borderRadius: RADIUS.md,
            padding: SPACING[4],
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.error,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>{balances.error}</span>
            <Button variant="ghost" size="sm" onClick={() => void loadBalances()}>Retry</Button>
          </div>
        )}

        {/* Transaction History */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.15, ease: 'easeOut' }}
        >
          <TransactionHistory walletAddress={address} />
        </motion.div>

        {/* Community */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.2, ease: 'easeOut' }}
        >
          <CommunityLinks />
        </motion.div>

        {/* Security Status */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: SPACING[4] }}>
          <SecurityBadge
            status="backup-complete"
            showDetail
            onClick={() => void navigate('/settings')}
          />
        </div>
      </div>

      {/* Add Token Modal */}
      {showAddToken && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => { setShowAddToken(false); setAddTokenAddress(''); setAddTokenMeta(null); setAddTokenError(''); }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.lg,
              padding: SPACING[6],
              boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.lg,
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary,
              margin: `0 0 ${SPACING[4]}`,
            }}>
              Add Token
            </h3>

            {/* Popular token quick-add chips */}
            {(() => {
              const existingAddrs = new Set(loadCustomTokens().map((t) => t.address.toLowerCase()));
              const SAIKO_LOWER = SAIKO_CONTRACT_ADDRESS.toLowerCase();
              const chips = POPULAR_TOKENS.filter(
                (t) => t.address.toLowerCase() !== SAIKO_LOWER && !existingAddrs.has(t.address.toLowerCase()),
              );
              if (chips.length === 0) return null;
              return (
                <div style={{ marginBottom: SPACING[4] }}>
                  <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginBottom: SPACING[2] }}>
                    Popular tokens
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING[2] }}>
                    {chips.map((t) => (
                      <button
                        key={t.address}
                        onClick={() => {
                          setAddTokenAddress(t.address);
                          setAddTokenError('');
                          setAddTokenLoading(true);
                          fetchTokenMetadata(t.address)
                            .then((meta) => setAddTokenMeta(meta))
                            .catch(() => setAddTokenError('Could not fetch token metadata.'))
                            .finally(() => setAddTokenLoading(false));
                        }}
                        style={{
                          padding: `${SPACING[1]} ${SPACING[3]}`,
                          backgroundColor: COLORS.background,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: RADIUS.full ?? '9999px',
                          color: COLORS.textSecondary,
                          fontFamily: FONT_FAMILY.sans,
                          fontSize: FONT_SIZE.xs,
                          fontWeight: FONT_WEIGHT.medium,
                          cursor: 'pointer',
                          transition: 'border-color 0.15s, color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          (e.target as HTMLButtonElement).style.borderColor = COLORS.primary;
                          (e.target as HTMLButtonElement).style.color = COLORS.primary;
                        }}
                        onMouseLeave={(e) => {
                          (e.target as HTMLButtonElement).style.borderColor = COLORS.border;
                          (e.target as HTMLButtonElement).style.color = COLORS.textSecondary;
                        }}
                      >
                        {t.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div style={{ marginBottom: SPACING[4] }}>
              <label style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, display: 'block', marginBottom: SPACING[2] }}>
                Contract Address
              </label>
              <input
                value={addTokenAddress}
                onChange={(e) => { setAddTokenAddress(e.target.value); setAddTokenError(''); }}
                onBlur={() => {
                  const addr = addTokenAddress.trim();
                  if (!addr || addr.length !== 42) return;
                  setAddTokenLoading(true);
                  setAddTokenError('');
                  fetchTokenMetadata(addr)
                    .then((meta) => setAddTokenMeta(meta))
                    .catch(() => setAddTokenError('Could not fetch token metadata. Verify the address.'))
                    .finally(() => setAddTokenLoading(false));
                }}
                placeholder="0x..."
                style={{
                  width: '100%',
                  padding: `${SPACING[3]} ${SPACING[3]}`,
                  backgroundColor: COLORS.background,
                  border: `1px solid ${addTokenError ? COLORS.error : COLORS.border}`,
                  borderRadius: RADIUS.md,
                  color: COLORS.textPrimary,
                  fontFamily: FONT_FAMILY.mono,
                  fontSize: FONT_SIZE.sm,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {addTokenError && (
                <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.error, marginTop: SPACING[1] }}>
                  {addTokenError}
                </div>
              )}
            </div>
            {addTokenLoading && (
              <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: SPACING[4] }}>
                Fetching token info...
              </div>
            )}
            {addTokenMeta && (
              <div style={{
                backgroundColor: COLORS.background,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                padding: SPACING[3],
                marginBottom: SPACING[4],
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
              }}>
                <div style={{ color: COLORS.textPrimary, fontWeight: FONT_WEIGHT.semibold }}>{addTokenMeta.symbol} — {addTokenMeta.name}</div>
                <div style={{ color: COLORS.textMuted, marginTop: '2px' }}>{addTokenMeta.decimals} decimals</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: SPACING[3] }}>
              <Button variant="ghost" onClick={() => { setShowAddToken(false); setAddTokenAddress(''); setAddTokenMeta(null); setAddTokenError(''); }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!addTokenMeta}
                onClick={() => {
                  if (!addTokenMeta) return;
                  addCustomToken(addTokenMeta);
                  setShowAddToken(false);
                  setAddTokenAddress('');
                  setAddTokenMeta(null);
                  void loadBalances();
                }}
              >
                Add Token
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
