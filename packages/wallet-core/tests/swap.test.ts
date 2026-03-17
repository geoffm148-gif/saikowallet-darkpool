import { describe, expect, it } from 'vitest';
import { parseUnits } from 'ethers';
import {
  buildSwapQuote,
  buildSwapTransaction,
  calculateMinimumReceived,
  findToken,
} from '../src/swap/index.js';
import { buildApproveTransaction } from '../src/swap/token-approval.js';

const ETH = findToken('ETH')!;
const SAIKO = findToken('SAIKO')!;

describe('buildSwapQuote (mock fallback)', () => {
  it('returns a quote with correct shape and fee deduction', () => {
    const quote = buildSwapQuote({
      inputToken: ETH,
      outputToken: SAIKO,
      inputAmount: '1',
      slippageTolerance: 0.5,
    });

    expect(quote.inputToken.symbol).toBe('ETH');
    expect(quote.outputToken.symbol).toBe('SAIKO');
    expect(quote.inputAmount).toBe('1');
    expect(quote.feeRate).toBe('0.5%');
    expect(quote.isLiveQuote).toBe(false);
    expect(quote.quoteTimestamp).toBeGreaterThan(0);
    expect(quote.expiresAt).toBeGreaterThan(Date.now());

    // Fee: 0.5% of 1 ETH = 0.005 ETH, amountSwapped = 0.995
    expect(parseFloat(quote.feeAmount)).toBeCloseTo(0.005, 6);
    expect(parseFloat(quote.amountSwapped)).toBeCloseTo(0.995, 6);

    // Output should be positive
    expect(parseFloat(quote.outputAmount)).toBeGreaterThan(0);
    expect(parseFloat(quote.minimumReceived)).toBeGreaterThan(0);
  });

  it('fee deduction: 0.5% fee on 1 ETH → amountSwapped = 0.995 ETH', () => {
    const quote = buildSwapQuote({
      inputToken: ETH,
      outputToken: SAIKO,
      inputAmount: '1',
      slippageTolerance: 0.5,
    });
    expect(parseFloat(quote.amountSwapped)).toBeCloseTo(0.995, 6);
  });
});

describe('buildApproveTransaction', () => {
  const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  const TOKEN = '0x4c89364F18Ecc562165820989549022e64eC2eD2';
  const WALLET = '0x1234567890123456789012345678901234567890';

  it('returns correct selector and encoded data', () => {
    const amount = 1000000n;
    const tx = buildApproveTransaction(TOKEN, ROUTER, WALLET, amount);

    expect(tx.to).toBe(TOKEN);
    expect(tx.value).toBe(0n);
    expect(tx.gasLimit).toBe(60_000n);
    // approve(address,uint256) selector = 0x095ea7b3
    expect(tx.data.startsWith('0x095ea7b3')).toBe(true);
    // Data should contain the router address (lowercased, zero-padded)
    expect(tx.data.toLowerCase()).toContain(
      ROUTER.toLowerCase().slice(2),
    );
  });
});

describe('buildSwapTransaction', () => {
  const WALLET = '0x1234567890123456789012345678901234567890';
  const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

  it('ETH→SAIKO: correct selector and positive value', () => {
    const quote = buildSwapQuote({
      inputToken: ETH,
      outputToken: SAIKO,
      inputAmount: '0.1',
      slippageTolerance: 0.5,
    });
    const tx = buildSwapTransaction(quote, WALLET);

    expect(tx.to).toBe(ROUTER);
    // swapExactETHForTokens = 0x7ff36ab5
    expect(tx.data.startsWith('0x7ff36ab5')).toBe(true);
    expect(tx.value).toBeGreaterThan(0n);
  });

  it('SAIKO→ETH: correct selector and zero value', () => {
    const quote = buildSwapQuote({
      inputToken: SAIKO,
      outputToken: ETH,
      inputAmount: '100000',
      slippageTolerance: 0.5,
    });
    const tx = buildSwapTransaction(quote, WALLET);

    expect(tx.to).toBe(ROUTER);
    // swapExactTokensForETH = 0x18cbafe5
    expect(tx.data.startsWith('0x18cbafe5')).toBe(true);
    expect(tx.value).toBe(0n);
  });
});

describe('calculateMinimumReceived', () => {
  it('0.5% slippage on 1000 output → 995', () => {
    const result = calculateMinimumReceived('1000', 0.5);
    expect(parseFloat(result)).toBeCloseTo(995, 1);
  });

  it('1% slippage on 1000 output → 990', () => {
    const result = calculateMinimumReceived('1000', 1);
    expect(parseFloat(result)).toBeCloseTo(990, 1);
  });

  it('0% slippage → same amount', () => {
    const result = calculateMinimumReceived('500', 0);
    expect(parseFloat(result)).toBeCloseTo(500, 1);
  });
});
