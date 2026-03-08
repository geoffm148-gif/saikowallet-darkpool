/**
 * Swap Execution Plan Builder
 *
 * Combines quote + approval check + swap transaction into one orchestrated plan.
 */

import type { SwapQuote } from './uniswap-quotes.js';
import type { TransactionRequest } from '../types/index.js';
import { buildSwapTransaction } from './swap-builder.js';
import { checkTokenApproval, buildApproveTransaction } from './token-approval.js';
import { UNISWAP_V2_ROUTER } from './swap-builder.js';
import { parseUnits } from 'ethers';

const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export interface SwapExecutionPlan {
  quote: SwapQuote;
  needsApproval: boolean;
  approvalTx?: { to: string; data: string; value: bigint; gasLimit: bigint };
  swapTx: TransactionRequest;
}

/**
 * Build a complete execution plan for a swap.
 * Returns approval tx (if needed for ERC-20 input) + swap tx ready to sign.
 */
export async function buildSwapExecutionPlan(
  rpcUrl: string,
  quote: SwapQuote,
  walletAddress: string,
): Promise<SwapExecutionPlan> {
  const swapTx = buildSwapTransaction(quote, walletAddress);
  const inputIsEth = quote.inputToken.address === ETH_ADDRESS;

  let needsApproval = false;
  let approvalTx: SwapExecutionPlan['approvalTx'];

  if (!inputIsEth) {
    const amountIn = parseUnits(quote.amountSwapped, quote.inputToken.decimals);
    const status = await checkTokenApproval(
      rpcUrl,
      quote.inputToken.address,
      walletAddress,
      UNISWAP_V2_ROUTER,
      amountIn,
    );

    if (status.needsApproval) {
      needsApproval = true;
      approvalTx = buildApproveTransaction(
        quote.inputToken.address,
        UNISWAP_V2_ROUTER,
        walletAddress,
        amountIn,
      );
    }
  }

  return { quote, needsApproval, approvalTx, swapTx };
}
