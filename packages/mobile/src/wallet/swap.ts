import { ethers, HDNodeWallet, Mnemonic, AbiCoder, parseUnits, formatUnits, formatEther } from 'ethers';

const RPC_URLS = ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'];
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const SAIKO = '0x4c89364F18Ecc562165820989549022e64eC2eD2';

const GET_AMOUNTS_OUT_SELECTOR = '0xd06ca61f';
const ALLOWANCE_SELECTOR = '0xdd62ed3e';
const APPROVE_SELECTOR = '0x095ea7b3';
const MAX_UINT256 = 2n ** 256n - 1n;
const FEE_BPS = 50n;
const FEE_DENOMINATOR = 10_000n;

export interface SwapQuoteResult {
  inputAmount: string;
  outputAmount: string;
  minimumReceived: string;
  priceImpact: number;
  gasEstimate: string;
  feeAmount: string;
  isLive: boolean;
  expiresAt: number;
}

export interface SwapResult {
  approvalTxHash?: string;
  swapTxHash: string;
}

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URLS[0]);
}

async function rpcCall(method: string, params: unknown[]): Promise<string> {
  for (const url of RPC_URLS) {
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

function getPath(from: 'ETH' | 'SAIKO', to: 'ETH' | 'SAIKO'): string[] {
  if (from === 'ETH') return [WETH, SAIKO];
  return [SAIKO, WETH];
}

/**
 * Fetch a live quote using Uniswap V2 getAmountsOut.
 * Falls back to a calculated estimate if RPC fails.
 */
export async function fetchQuote(
  fromToken: 'ETH' | 'SAIKO',
  toToken: 'ETH' | 'SAIKO',
  amountIn: string,
  slippageBps: number,
): Promise<SwapQuoteResult> {
  const decimals = 18;
  const inputUnits = parseUnits(amountIn, decimals);

  // Fee deduction
  const feeUnits = (inputUnits * FEE_BPS) / FEE_DENOMINATOR;
  const swapUnits = inputUnits - feeUnits;
  const feeAmount = formatUnits(feeUnits, decimals);

  try {
    const path = getPath(fromToken, toToken);
    const coder = AbiCoder.defaultAbiCoder();
    const data =
      GET_AMOUNTS_OUT_SELECTOR +
      coder.encode(['uint256', 'address[]'], [swapUnits, path]).slice(2);

    const result = await rpcCall('eth_call', [
      { to: UNISWAP_V2_ROUTER, data },
      'latest',
    ]);

    const decoded = coder.decode(['uint256[]'], result);
    const amounts = (decoded[0] as bigint[]).map((v: bigint) => BigInt(v));
    const amountOut = amounts[amounts.length - 1]!;

    const outputNum = Number(formatUnits(amountOut, decimals));
    const inputNum = Number(formatUnits(swapUnits, decimals));
    const priceImpact = inputNum > 0
      ? Math.max(0, Math.min(inputNum * 0.001, 5))
      : 0;

    // Slippage
    const minOut = (amountOut * (10000n - BigInt(slippageBps))) / 10000n;

    return {
      inputAmount: amountIn,
      outputAmount: formatUnits(amountOut, decimals),
      minimumReceived: formatUnits(minOut, decimals),
      priceImpact,
      gasEstimate: '0.005',
      feeAmount,
      isLive: true,
      expiresAt: Date.now() + 30_000,
    };
  } catch {
    // MOCK FALLBACK — RPC unavailable
    const mockRate = fromToken === 'ETH' ? 500_000 : 0.000_002;
    const swapNum = Number(formatUnits(swapUnits, decimals));
    const outputNum = swapNum * mockRate;
    const minOut = outputNum * (1 - slippageBps / 10000);

    return {
      inputAmount: amountIn,
      outputAmount: String(outputNum),
      minimumReceived: String(minOut),
      priceImpact: 0.1,
      gasEstimate: '0.005',
      feeAmount,
      isLive: false,
      expiresAt: Date.now() + 30_000,
    };
  }
}

/**
 * Execute a swap. Handles approval if needed, then swaps.
 * Re-derives private key ephemerally — never stored.
 */
export async function executeSwap(params: {
  mnemonic: string;
  accountIndex: number;
  fromToken: 'ETH' | 'SAIKO';
  toToken: 'ETH' | 'SAIKO';
  amountIn: string;
  minAmountOut: string;
  slippageBps: number;
}): Promise<SwapResult> {
  const { mnemonic, accountIndex, fromToken, toToken, amountIn, minAmountOut } = params;

  // Derive wallet
  const hdWallet = HDNodeWallet.fromMnemonic(
    Mnemonic.fromPhrase(mnemonic),
    `m/44'/60'/0'/0/${accountIndex}`,
  );
  const provider = getProvider();
  const wallet = hdWallet.connect(provider);
  const walletAddress = wallet.address;

  const decimals = 18;
  const amountInWei = parseUnits(amountIn, decimals);
  const minAmountOutWei = parseUnits(minAmountOut, decimals);

  // Fee deduction
  const feeUnits = (amountInWei * FEE_BPS) / FEE_DENOMINATOR;
  const swapUnits = amountInWei - feeUnits;

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const path = getPath(fromToken, toToken);
  const coder = AbiCoder.defaultAbiCoder();
  const iface = new ethers.Interface([
    'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)',
    'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  ]);

  let approvalTxHash: string | undefined;

  // If selling SAIKO: check and handle approval
  if (fromToken === 'SAIKO') {
    const allowanceData =
      ALLOWANCE_SELECTOR +
      coder.encode(['address', 'address'], [walletAddress, UNISWAP_V2_ROUTER]).slice(2);

    const allowanceResult = await rpcCall('eth_call', [
      { to: SAIKO, data: allowanceData },
      'latest',
    ]);

    const currentAllowance = allowanceResult && allowanceResult !== '0x'
      ? BigInt(allowanceResult)
      : 0n;

    if (currentAllowance < swapUnits) {
      const approveData =
        APPROVE_SELECTOR +
        coder.encode(['address', 'uint256'], [UNISWAP_V2_ROUTER, MAX_UINT256]).slice(2);

      const approveTx = await wallet.sendTransaction({
        to: SAIKO,
        data: approveData,
        value: 0n,
        gasLimit: 60_000n,
        type: 2,
      });
      await approveTx.wait();
      approvalTxHash = approveTx.hash;
    }
  }

  // Build and send swap tx
  let swapTxHash: string;

  if (fromToken === 'ETH') {
    const data = iface.encodeFunctionData('swapExactETHForTokens', [
      minAmountOutWei,
      path,
      walletAddress,
      deadline,
    ]);

    const tx = await wallet.sendTransaction({
      to: UNISWAP_V2_ROUTER,
      data,
      value: swapUnits,
      gasLimit: 200_000n,
      type: 2,
    });
    swapTxHash = tx.hash;
  } else {
    const data = iface.encodeFunctionData('swapExactTokensForETH', [
      swapUnits,
      minAmountOutWei,
      path,
      walletAddress,
      deadline,
    ]);

    const tx = await wallet.sendTransaction({
      to: UNISWAP_V2_ROUTER,
      data,
      value: 0n,
      gasLimit: 200_000n,
      type: 2,
    });
    swapTxHash = tx.hash;
  }

  return { approvalTxHash, swapTxHash };
}
