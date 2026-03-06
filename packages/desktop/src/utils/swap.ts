/**
 * Desktop swap execution.
 *
 * All network calls use rpcCall() with 4-endpoint fallback (tx-utils.ts).
 * ethers.js is only used for signing — no JsonRpcProvider connection required.
 */

import { ethers, HDNodeWallet, Mnemonic, AbiCoder, parseUnits } from 'ethers';
import { isTorEnabled } from './network.js';
import { rpcCall, getGasParams, sendSignedTx, waitForReceipt, getNonce, ethCall } from './tx-utils.js';

const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const SAIKO = '0x4c89364F18Ecc562165820989549022e64eC2eD2';

const ALLOWANCE_SELECTOR = '0xdd62ed3e';
const FEE_BPS = 50n;
const FEE_DENOMINATOR = 10_000n;
const ETH_PSEUDO = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function tokenAddress(symbol: string): string {
  if (symbol === 'ETH') return ETH_PSEUDO;
  if (symbol === 'SAIKO') return SAIKO;
  throw new Error('Unknown token symbol: ' + symbol + '. Supported: ETH, SAIKO');
}

function getPath(inputAddr: string, outputAddr: string): string[] {
  if (inputAddr === ETH_PSEUDO) return [WETH, outputAddr];
  if (outputAddr === ETH_PSEUDO) return [inputAddr, WETH];
  return [inputAddr, WETH, outputAddr];
}

export interface DesktopSwapResult {
  approvalTxHash?: string;
  swapTxHash: string;
}

export async function checkApprovalNeeded(
  tokenAddr: string,
  ownerAddress: string,
  amount: bigint,
): Promise<boolean> {
  if (tokenAddr === ETH_PSEUDO) return false;
  try {
    const coder = AbiCoder.defaultAbiCoder();
    const data =
      ALLOWANCE_SELECTOR +
      coder.encode(['address', 'address'], [ownerAddress, UNISWAP_V2_ROUTER]).slice(2);
    const result = await ethCall(tokenAddr, data);
    const allowance = result && result !== '0x' ? BigInt(result) : 0n;
    return allowance < amount;
  } catch {
    return true;
  }
}

/**
 * Execute a swap from desktop.
 *
 * Uses rpcCall() with 4-endpoint fallback for ALL network calls.
 * ethers.js signs the tx; raw fetch() broadcasts it.
 */
export async function executeDesktopSwap(params: {
  inputSymbol: string;
  outputSymbol: string;
  inputAmount: string;
  minimumReceived: string;
  inputDecimals: number;
  outputDecimals: number;
  mnemonic: string;
}): Promise<DesktopSwapResult> {
  const {
    inputSymbol, outputSymbol, inputAmount, minimumReceived,
    inputDecimals, outputDecimals, mnemonic,
  } = params;

  if (!mnemonic) throw new Error('Wallet not unlocked');

  const hdWallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), `m/44'/60'/0'/0/0`);
  const walletAddress = hdWallet.address;

  const inputAddr = tokenAddress(inputSymbol);
  const outputAddr = tokenAddress(outputSymbol);
  const inputIsEth = inputAddr === ETH_PSEUDO;

  const amountInWei = parseUnits(inputAmount, inputDecimals);
  const feeUnits = (amountInWei * FEE_BPS) / FEE_DENOMINATOR;
  const swapUnits = amountInWei - feeUnits;
  const minAmountOutWei = parseUnits(minimumReceived, outputDecimals);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const path = getPath(inputAddr, outputAddr);

  const [nonce, gasParams] = await Promise.all([
    getNonce(walletAddress),
    getGasParams(),
  ]);
  let currentNonce = nonce;

  const iface = new ethers.Interface([
    'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory)',
    'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory)',
    'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory)',
  ]);

  const erc20Iface = new ethers.Interface([
    'function approve(address spender, uint256 amount) returns (bool)',
  ]);

  let approvalTxHash: string | undefined;

  // ── Approval ──────────────────────────────────────────────────────────────
  if (!inputIsEth) {
    const needsApproval = await checkApprovalNeeded(inputAddr, walletAddress, swapUnits);
    if (needsApproval) {
      approvalTxHash = await sendSignedTx(hdWallet, {
        to: inputAddr,
        data: erc20Iface.encodeFunctionData('approve', [UNISWAP_V2_ROUTER, swapUnits]),
        value: 0n,
        nonce: currentNonce,
        gasLimit: 65_000n,
        ...gasParams,
      });
      await waitForReceipt(approvalTxHash);
      currentNonce++;
    }
  }

  // ── Swap ──────────────────────────────────────────────────────────────────
  const outputIsEth = outputAddr === ETH_PSEUDO;
  let swapData: string;
  if (inputIsEth) {
    swapData = iface.encodeFunctionData('swapExactETHForTokens', [minAmountOutWei, path, walletAddress, deadline]);
  } else if (outputIsEth) {
    swapData = iface.encodeFunctionData('swapExactTokensForETH', [swapUnits, minAmountOutWei, path, walletAddress, deadline]);
  } else {
    swapData = iface.encodeFunctionData('swapExactTokensForTokens', [swapUnits, minAmountOutWei, path, walletAddress, deadline]);
  }

  const swapTxHash = await sendSignedTx(hdWallet, {
    to: UNISWAP_V2_ROUTER,
    data: swapData,
    value: inputIsEth ? swapUnits : 0n,
    nonce: currentNonce,
    gasLimit: 250_000n,
    ...gasParams,
  });

  return { approvalTxHash, swapTxHash };
}
