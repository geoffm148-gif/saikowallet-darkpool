/**
 * Uniswap Quote Types and Builders
 *
 * WHY: Provides well-typed swap quote structures compatible with Uniswap V2/V3
 * integration. Mock implementations return realistic data shapes so the UI
 * can be built and tested before real DEX integration is wired up.
 */

import type { SwapToken } from './swap-tokens.js';
import { FEE_RATE_DISPLAY, calculateSwapFee } from './fee.js';
import { AbiCoder, parseUnits, formatUnits } from 'ethers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SwapQuote {
  readonly inputToken: SwapToken;
  readonly outputToken: SwapToken;
  /** Full amount the user entered (human-readable) */
  readonly inputAmount: string;
  /** Saiko Wallet fee in human-readable input token units (e.g. "5") */
  readonly feeAmount: string;
  /** Fee rate display string (e.g. "0.5%") */
  readonly feeRate: string;
  /** Amount routed to the DEX after fee deduction (human-readable) */
  readonly amountSwapped: string;
  /** Output amount in human-readable units (based on amountSwapped) */
  readonly outputAmount: string;
  /** Price impact as a percentage (e.g. 0.3 = 0.3%) */
  readonly priceImpact: number;
  /** Minimum received after applying slippage tolerance */
  readonly minimumReceived: string;
  /** Token route path: array of token addresses */
  readonly route: readonly string[];
  /** Estimated gas cost in ETH (human-readable) */
  readonly gasEstimate: string;
  /** Unix timestamp (ms) when this quote expires */
  readonly expiresAt: number;
  /** true = from on-chain getAmountsOut, false = mock fallback */
  readonly isLiveQuote: boolean;
  /** When the quote was fetched (ms since epoch) */
  readonly quoteTimestamp: number;
}

export interface BuildSwapQuoteParams {
  readonly inputToken: SwapToken;
  readonly outputToken: SwapToken;
  readonly inputAmount: string;
  readonly slippageTolerance: number; // e.g. 0.5 = 0.5%
}

// ─── Mock exchange rates (replace with real Uniswap V3 quoter) ───────────────

/**
 * Mock exchange rates: how many outputToken units per 1 inputToken.
 * Key format: "INPUT_SYMBOL:OUTPUT_SYMBOL"
 */
const MOCK_RATES: Record<string, number> = {
  'ETH:SAIKO': 500_000,
  'ETH:USDC': 3_200,
  'ETH:USDT': 3_200,
  'ETH:DAI': 3_200,
  'ETH:WETH': 1,
  'SAIKO:ETH': 0.000_002,
  'SAIKO:USDC': 0.000_000_064,
  'SAIKO:USDT': 0.000_000_064,
  'SAIKO:DAI': 0.000_000_064,
  'SAIKO:WETH': 0.000_002,
  'USDC:ETH': 1 / 3_200,
  'USDC:SAIKO': 15_625,
  'USDC:USDT': 1,
  'USDC:DAI': 1,
  'USDC:WETH': 1 / 3_200,
  'USDT:ETH': 1 / 3_200,
  'USDT:SAIKO': 15_625,
  'USDT:USDC': 1,
  'USDT:DAI': 1,
  'USDT:WETH': 1 / 3_200,
  'DAI:ETH': 1 / 3_200,
  'DAI:SAIKO': 15_625,
  'DAI:USDC': 1,
  'DAI:USDT': 1,
  'DAI:WETH': 1 / 3_200,
  'WETH:ETH': 1,
  'WETH:SAIKO': 500_000,
  'WETH:USDC': 3_200,
  'WETH:USDT': 3_200,
  'WETH:DAI': 3_200,
};

/**
 * Construct a swap quote. Currently returns mock data with realistic structure.
 * In production, replace the body with a call to the Uniswap V3 Quoter contract
 * via eth_call / the @uniswap/v3-sdk quoter.
 */
export function buildSwapQuote(params: BuildSwapQuoteParams): SwapQuote {
  const { inputToken, outputToken, inputAmount, slippageTolerance } = params;

  const rateKey = `${inputToken.symbol}:${outputToken.symbol}`;
  const rate = MOCK_RATES[rateKey] ?? 1;

  // ── Fee deduction (BigInt, basis points) ──────────────────────────────────
  const inputUnits = parseUnitsFromHuman(inputAmount, inputToken.decimals);
  const { fee: feeUnits, amountAfterFee: swapUnits } = calculateSwapFee(inputUnits);
  const feeAmount = formatOutput(
    Number(feeUnits) / 10 ** inputToken.decimals,
    inputToken.decimals,
  );
  const amountSwappedNum = Number(swapUnits) / 10 ** inputToken.decimals;
  const amountSwapped = formatOutput(amountSwappedNum, inputToken.decimals);

  // ── Output based on post-fee amount ───────────────────────────────────────
  const outputNum = amountSwappedNum * rate;

  const priceImpact = calculatePriceImpact(amountSwapped, String(outputNum), rate);
  const minimumReceived = calculateMinimumReceived(String(outputNum), slippageTolerance);
  const outputAmount = formatOutput(outputNum, outputToken.decimals);

  return {
    inputToken,
    outputToken,
    inputAmount,
    feeAmount,
    feeRate: FEE_RATE_DISPLAY,
    amountSwapped,
    outputAmount,
    priceImpact,
    minimumReceived,
    route: [inputToken.address, outputToken.address],
    gasEstimate: '0.005',
    expiresAt: Date.now() + 30_000,
    isLiveQuote: false,
    quoteTimestamp: Date.now(),
  };
}

// ─── Helpers (internal) ───────────────────────────────────────────────────────

function parseUnitsFromHuman(amount: string, decimals: number): bigint {
  try {
    const parts = amount.split('.');
    const intPart = parts[0] ?? '0';
    const fracPart = (parts[1] ?? '').slice(0, decimals);
    const clamped = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
    return parseUnits(clamped, decimals);
  } catch {
    return 0n;
  }
}

/**
 * Calculate price impact as a percentage.
 *
 * In production this would compare the effective execution price
 * against the current pool mid price from Uniswap V3.
 */
export function calculatePriceImpact(
  inputAmount: string,
  outputAmount: string,
  marketPrice: number,
): number {
  const inputNum = parseFloat(inputAmount) || 0;
  const outputNum = parseFloat(outputAmount) || 0;

  if (inputNum === 0 || marketPrice === 0) return 0;

  const expectedOutput = inputNum * marketPrice;
  if (expectedOutput === 0) return 0;

  const impact = ((expectedOutput - outputNum) / expectedOutput) * 100;
  // Clamp to realistic range and scale with trade size (mock simulation)
  const sizeImpact = Math.min(inputNum * 0.001, 5); // up to 5% for large trades
  return Math.max(0, Math.min(impact + sizeImpact, 99));
}

/**
 * Calculate minimum tokens received after applying slippage tolerance.
 * slippageTolerance: e.g. 0.5 means 0.5%
 */
export function calculateMinimumReceived(
  outputAmount: string,
  slippageTolerance: number,
): string {
  const outputNum = parseFloat(outputAmount) || 0;
  const multiplier = 1 - slippageTolerance / 100;
  const minimum = outputNum * multiplier;
  return formatOutput(minimum, 6);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatOutput(value: number, decimals: number): string {
  if (value === 0) return '0';
  // For very large numbers (e.g. SAIKO), no decimal places needed
  if (value >= 1_000_000) return value.toFixed(0);
  if (value >= 1_000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.0001) return value.toFixed(6);
  // For tiny values, use up to the token's decimals
  return value.toFixed(Math.min(decimals, 10));
}

// ─── Live Uniswap V2 Quotes ─────────────────────────────────────────────────

const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const GET_AMOUNTS_OUT_SELECTOR = '0xd06ca61f';

const RPC_FALLBACKS = [
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth',
];

export interface FetchSwapQuoteParams extends BuildSwapQuoteParams {
  readonly rpcUrl?: string;
}

async function rpcCall(
  primaryRpc: string,
  method: string,
  params: unknown[],
): Promise<string> {
  const rpcs = [primaryRpc, ...RPC_FALLBACKS.filter((r) => r !== primaryRpc)];
  for (const url of rpcs) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const json = await res.json();
      if (json.error) continue;
      return json.result as string;
    } catch {
      continue;
    }
  }
  throw new Error(`RPC call ${method} failed on all endpoints`);
}

/**
 * Call Uniswap V2 Router getAmountsOut on-chain.
 * Returns array of amounts along the path (last = output).
 */
async function getAmountsOut(
  rpcUrl: string,
  amountIn: bigint,
  path: string[],
): Promise<bigint[]> {
  const coder = AbiCoder.defaultAbiCoder();
  const data =
    GET_AMOUNTS_OUT_SELECTOR +
    coder.encode(['uint256', 'address[]'], [amountIn, path]).slice(2);

  const result = await rpcCall(rpcUrl, 'eth_call', [
    { to: UNISWAP_V2_ROUTER, data },
    'latest',
  ]);

  // Decode: returns uint256[]
  const decoded = coder.decode(['uint256[]'], result);
  return (decoded[0] as bigint[]).map((v: bigint) => BigInt(v));
}

function buildSwapPath(inputToken: SwapToken, outputToken: SwapToken): string[] {
  const inputIsEth = inputToken.address === ETH_ADDRESS;
  const outputIsEth = outputToken.address === ETH_ADDRESS;

  if (inputIsEth) {
    return [WETH_ADDRESS, outputToken.address];
  }
  if (outputIsEth) {
    return [inputToken.address, WETH_ADDRESS];
  }
  // Token→Token: route through WETH
  return [inputToken.address, WETH_ADDRESS, outputToken.address];
}

/**
 * Fetch a live swap quote from Uniswap V2 via on-chain getAmountsOut.
 * Falls back to mock `buildSwapQuote()` if RPC fails.
 */
export async function fetchSwapQuote(params: FetchSwapQuoteParams): Promise<SwapQuote> {
  const { inputToken, outputToken, inputAmount, slippageTolerance, rpcUrl } = params;
  const primaryRpc = rpcUrl ?? RPC_FALLBACKS[0]!;

  try {
    const inputUnits = parseUnitsFromHuman(inputAmount, inputToken.decimals);
    if (inputUnits === 0n) {
      return buildSwapQuote(params);
    }

    // Fee deduction before quoting
    const { fee: feeUnits, amountAfterFee: swapUnits } = calculateSwapFee(inputUnits);
    const feeAmount = formatUnits(feeUnits, inputToken.decimals);
    const amountSwapped = formatUnits(swapUnits, inputToken.decimals);

    // Build path and get on-chain quote
    const path = buildSwapPath(inputToken, outputToken);
    const amounts = await getAmountsOut(primaryRpc, swapUnits, path);
    const amountOut = amounts[amounts.length - 1]!;

    const outputNum = Number(formatUnits(amountOut, outputToken.decimals));
    const outputAmount = formatOutput(outputNum, outputToken.decimals);

    // Price impact: compare effective price vs marginal price from a tiny quote
    const swapNumIn = Number(formatUnits(swapUnits, inputToken.decimals));
    const effectiveRate = swapNumIn > 0 ? outputNum / swapNumIn : 0;
    const priceImpact = calculatePriceImpact(amountSwapped, outputAmount, effectiveRate);

    // Slippage
    const minimumReceived = calculateMinimumReceived(outputAmount, slippageTolerance);

    return {
      inputToken,
      outputToken,
      inputAmount,
      feeAmount,
      feeRate: FEE_RATE_DISPLAY,
      amountSwapped,
      outputAmount,
      priceImpact,
      minimumReceived,
      route: path,
      gasEstimate: '0.005',
      expiresAt: Date.now() + 30_000,
      isLiveQuote: true,
      quoteTimestamp: Date.now(),
    };
  } catch {
    // MOCK FALLBACK — RPC unavailable
    return buildSwapQuote(params);
  }
}
