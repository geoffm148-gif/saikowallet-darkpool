/**
 * Swap Transaction Builder
 *
 * WHY: Constructs unsigned swap transactions using the Uniswap V2 Router
 * interface. The mock implementation produces the correct calldata structure
 * for easy drop-in replacement with live Uniswap V2/V3 integration.
 *
 * Uses Uniswap V2 Router: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D (mainnet)
 */

import { AbiCoder, parseUnits } from 'ethers';
import type { SwapQuote } from './uniswap-quotes.js';
import type { TransactionRequest } from '../types/index.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Uniswap V2 Router02 mainnet address */
export const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

/** ETH pseudo-address used as native currency marker */
const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

/** WETH mainnet address (needed for ETH→token swaps on V2) */
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

/** Default gas limit for swap transactions */
const SWAP_GAS_LIMIT = 200_000n;

/** Swap deadline: 20 minutes from now (in seconds) */
const DEADLINE_OFFSET_SECONDS = 20 * 60;

// ─── Function Selectors ───────────────────────────────────────────────────────

/**
 * keccak256("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)")
 * = 0x38ed1739
 */
const SELECTOR_SWAP_EXACT_TOKENS_FOR_TOKENS = '0x38ed1739';

/**
 * keccak256("swapExactETHForTokens(uint256,address[],address,uint256)")
 * = 0x7ff36ab5
 */
const SELECTOR_SWAP_EXACT_ETH_FOR_TOKENS = '0x7ff36ab5';

/**
 * keccak256("swapExactTokensForETH(uint256,uint256,address[],address,uint256)")
 * = 0x18cbafe5
 */
const SELECTOR_SWAP_EXACT_TOKENS_FOR_ETH = '0x18cbafe5';

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build an unsigned swap transaction from a quote.
 *
 * Routes:
 *   - ETH → Token: swapExactETHForTokens (payable, value = inputAmount)
 *   - Token → ETH: swapExactTokensForETH
 *   - Token → Token: swapExactTokensForTokens
 *
 * In production, replace with Uniswap V3 Universal Router or SDK-generated calldata.
 */
export function buildSwapTransaction(
  quote: SwapQuote,
  walletAddress: string,
): TransactionRequest {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_OFFSET_SECONDS);
  const inputIsEth = quote.inputToken.address === ETH_ADDRESS;
  const outputIsEth = quote.outputToken.address === ETH_ADDRESS;

  // Use post-fee amount — fee is deducted before routing to DEX
  const amountIn = parseUnitsFromHuman(
    quote.amountSwapped,
    quote.inputToken.decimals,
  );
  const amountOutMin = parseUnitsFromHuman(
    quote.minimumReceived,
    quote.outputToken.decimals,
  );

  // Build path: replace ETH pseudo-address with WETH for V2 routing
  const inputAddr = inputIsEth ? WETH_ADDRESS : quote.inputToken.address;
  const outputAddr = outputIsEth ? WETH_ADDRESS : quote.outputToken.address;
  const path = buildPath(quote.route, inputAddr, outputAddr);

  let data: string;
  let value: bigint;

  if (inputIsEth) {
    // swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)
    data = encodeExactEthForTokens(amountOutMin, path, walletAddress, deadline);
    value = amountIn;
  } else if (outputIsEth) {
    // swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)
    data = encodeExactTokensForEth(amountIn, amountOutMin, path, walletAddress, deadline);
    value = 0n;
  } else {
    // swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)
    data = encodeExactTokensForTokens(amountIn, amountOutMin, path, walletAddress, deadline);
    value = 0n;
  }

  return {
    type: 'eip1559',
    from: walletAddress,
    to: UNISWAP_V2_ROUTER,
    value,
    nonce: 0, // caller must fill in the real nonce before signing
    gasLimit: SWAP_GAS_LIMIT,
    chainId: 1,
    // 30 gwei base + 1.5 gwei tip (mock estimates — caller should use real gas estimator)
    maxFeePerGas: 31_500_000_000n,
    maxPriorityFeePerGas: 1_500_000_000n,
    data,
  };
}

// ─── ABI Encoding ─────────────────────────────────────────────────────────────

function encodeExactTokensForTokens(
  amountIn: bigint,
  amountOutMin: bigint,
  path: string[],
  to: string,
  deadline: bigint,
): string {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
    [amountIn, amountOutMin, path, to, deadline],
  );
  return SELECTOR_SWAP_EXACT_TOKENS_FOR_TOKENS + encoded.slice(2);
}

function encodeExactEthForTokens(
  amountOutMin: bigint,
  path: string[],
  to: string,
  deadline: bigint,
): string {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'address[]', 'address', 'uint256'],
    [amountOutMin, path, to, deadline],
  );
  return SELECTOR_SWAP_EXACT_ETH_FOR_TOKENS + encoded.slice(2);
}

function encodeExactTokensForEth(
  amountIn: bigint,
  amountOutMin: bigint,
  path: string[],
  to: string,
  deadline: bigint,
): string {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
    [amountIn, amountOutMin, path, to, deadline],
  );
  return SELECTOR_SWAP_EXACT_TOKENS_FOR_ETH + encoded.slice(2);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert human-readable amount to token units (BigInt).
 * Handles large SAIKO amounts and small ETH/stablecoin amounts.
 */
function parseUnitsFromHuman(amount: string, decimals: number): bigint {
  try {
    // parseUnits can fail on very small numbers with too many decimal places
    // Clamp decimal places to the token's precision
    const parts = amount.split('.');
    const intPart = parts[0] ?? '0';
    const fracPart = (parts[1] ?? '').slice(0, decimals).padEnd(0, '');
    const clamped = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
    return parseUnits(clamped, decimals);
  } catch {
    return 0n;
  }
}

/**
 * Build the swap route path array.
 * Uses the quote's route if available, otherwise direct pair [inputAddr, outputAddr].
 */
function buildPath(
  routeAddresses: readonly string[],
  inputAddr: string,
  outputAddr: string,
): string[] {
  if (routeAddresses.length >= 2) {
    // Replace ETH pseudo-address in route with WETH
    return routeAddresses.map((addr) =>
      addr === ETH_ADDRESS ? WETH_ADDRESS : addr,
    );
  }
  return [inputAddr, outputAddr];
}
