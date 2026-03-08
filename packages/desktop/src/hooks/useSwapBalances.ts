/**
 * useSwapBalances — fetches real on-chain balances for all swap tokens.
 * Polls every 30s and refreshes on address/network change.
 */
import { useEffect, useRef, useState } from 'react';
import {
  createRpcClient,
  createProviderConfig,
  DEFAULT_MAINNET_PROVIDERS,
  encodeBalanceOf,
  decodeUint256,
  type SwapToken,
} from '@saiko-wallet/wallet-core';
import { getActiveRpc, getActiveNetwork } from '../utils/network.js';

const ETH_PSEUDO = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const POLL_INTERVAL = 30_000;

export interface SwapBalances {
  /** raw bigint per token address (lowercase) */
  raw: Map<string, bigint>;
  /** formatted display string per symbol, e.g. "2.5031 ETH" */
  display: Map<string, string>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function getRpcClient() {
  const network = getActiveNetwork();
  return createRpcClient({
    chainId: network.chainId,
    providers: [createProviderConfig(getActiveRpc()), ...DEFAULT_MAINNET_PROVIDERS],
    maxRetries: 2,
  });
}

function formatAmount(raw: bigint, decimals: number, symbol: string): string {
  if (raw === 0n) return `0 ${symbol}`;
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
  const wholeFormatted = whole.toLocaleString('en-US');
  const amount = fracStr ? `${wholeFormatted}.${fracStr}` : wholeFormatted;
  return `${amount} ${symbol}`;
}

export function useSwapBalances(
  walletAddress: string,
  tokens: readonly SwapToken[],
): SwapBalances {
  const [raw, setRaw] = useState<Map<string, bigint>>(new Map());
  const [display, setDisplay] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef(0);

  const fetch = async (): Promise<void> => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);

    try {
      const client = getRpcClient();

      // Fetch all balances in parallel
      const results = await Promise.allSettled(
        tokens.map(async (token) => {
          const isEth = token.address.toLowerCase() === ETH_PSEUDO.toLowerCase();

          const balance = isEth
            ? BigInt(await client.send<string>({ method: 'eth_getBalance', params: [walletAddress, 'latest'] }))
            : decodeUint256(await client.send<string>({
                method: 'eth_call',
                params: [{ to: token.address, data: encodeBalanceOf(walletAddress) }, 'latest'],
              }));

          return { token, balance };
        }),
      );

      const newRaw = new Map<string, bigint>();
      const newDisplay = new Map<string, string>();

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { token, balance } = result.value;
          const key = token.address.toLowerCase();
          newRaw.set(key, balance);
          newRaw.set(token.symbol, balance); // also index by symbol for convenience
          newDisplay.set(token.symbol, formatAmount(balance, token.decimals, token.symbol));
        }
      }

      setRaw(newRaw);
      setDisplay(newDisplay);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to fetch balances');
    } finally {
      setLoading(false);
    }
  };

  const refresh = (): void => {
    triggerRef.current += 1;
  };

  useEffect(() => {
    void fetch();
    const interval = setInterval(() => void fetch(), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [walletAddress, triggerRef.current]);

  return { raw, display, loading, error, refresh };
}
