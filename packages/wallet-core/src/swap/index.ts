/**
 * Swap module public API.
 */
export type { SwapQuote, BuildSwapQuoteParams, FetchSwapQuoteParams } from './uniswap-quotes.js';
export {
  buildSwapQuote,
  fetchSwapQuote,
  calculatePriceImpact,
  calculateMinimumReceived,
} from './uniswap-quotes.js';

export type { SwapToken } from './swap-tokens.js';
export {
  SWAP_TOKENS,
  getSwapTokens,
  findToken,
} from './swap-tokens.js';

export {
  buildSwapTransaction,
  UNISWAP_V2_ROUTER,
} from './swap-builder.js';

export {
  FEE_BPS,
  FEE_DENOMINATOR,
  FEE_RATE_DISPLAY,
  FEE_RECIPIENT,
  calculateSwapFee,
  isBelowMinimumSwapAmount,
} from './fee.js';
export type { SwapFeeResult } from './fee.js';

export type { ApprovalStatus } from './token-approval.js';
export {
  checkTokenApproval,
  buildApproveTransaction,
  buildRevokeApprovalTransaction,
} from './token-approval.js';

export type { SwapExecutionPlan } from './swap-executor.js';
export { buildSwapExecutionPlan } from './swap-executor.js';
