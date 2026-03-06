/**
 * Desktop swap execution — uses fetch for RPC calls (browser-compatible).
 */

import { ethers, HDNodeWallet, Mnemonic, AbiCoder, parseUnits, formatUnits } from 'ethers';
import { getActiveRpc, isTorEnabled } from './network.js';

const RPC_URLS_FALLBACK = ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'];
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const SAIKO = '0x4c89364F18Ecc562165820989549022e64eC2eD2';

const ALLOWANCE_SELECTOR = '0xdd62ed3e';
const APPROVE_SELECTOR = '0x095ea7b3';
const MAX_UINT256 = 2n ** 256n - 1n;
const FEE_BPS = 50n;
const FEE_DENOMINATOR = 10_000n;

const ETH_PSEUDO = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

async function rpcCall(method: string, params: unknown[]): Promise<string> {
  // Tor: isTorEnabled() checked — SOCKS5 proxy needs Electron shell (Sprint 3)
  if (isTorEnabled()) {
    // eslint-disable-next-line no-console
    console.info('[Tor] Tor enabled — full SOCKS5 routing requires desktop binary (Sprint 3)');
  }
  const urls = [getActiveRpc(), ...RPC_URLS_FALLBACK];
  for (const url of urls) {
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
  throw new Error(`RPC call ${method} failed`);
}

function tokenAddress(symbol: string): string {
  if (symbol === 'ETH') return ETH_PSEUDO;
  if (symbol === 'SAIKO') return SAIKO;
  throw new Error('Unknown token symbol: ' + symbol + '. Supported: ETH, SAIKO');
}

function getPath(inputAddr: string, outputAddr: string): string[] {
  const inIsEth = inputAddr === ETH_PSEUDO;
  const outIsEth = outputAddr === ETH_PSEUDO;
  if (inIsEth) return [WETH, outputAddr];
  if (outIsEth) return [inputAddr, WETH];
  return [inputAddr, WETH, outputAddr];
}

export interface DesktopSwapResult {
  approvalTxHash?: string;
  swapTxHash: string;
}

/**
 * Check if approval is needed for a token.
 */
export async function checkApprovalNeeded(
  tokenAddr: string,
  ownerAddress: string,
  amount: bigint,
): Promise<boolean> {
  if (tokenAddr === ETH_PSEUDO) return false;

  const coder = AbiCoder.defaultAbiCoder();
  const data =
    ALLOWANCE_SELECTOR +
    coder.encode(['address', 'address'], [ownerAddress, UNISWAP_V2_ROUTER]).slice(2);

  try {
    const result = await rpcCall('eth_call', [
      { to: tokenAddr, data },
      'latest',
    ]);
    const allowance = result && result !== '0x' ? BigInt(result) : 0n;
    return allowance < amount;
  } catch {
    return true;
  }
}

/**
 * Execute a swap from desktop. Requires mnemonic from session context.
 *
 * WARNING: JS strings cannot be zeroed from memory. The `mnemonic` param
 * is a plain string — this is a known limitation. Consider refactoring to
 * pass a signing callback instead of raw mnemonic.
 */
export async function executeDesktopSwap(params: {
  inputSymbol: string;
  outputSymbol: string;
  inputAmount: string;
  minimumReceived: string;
  inputDecimals: number;
  outputDecimals: number;
  /** WARNING: JS strings cannot be zeroed from memory. This is a known limitation.
   *  Consider refactoring to pass a signing callback instead of raw mnemonic. */
  mnemonic: string;
}): Promise<DesktopSwapResult> {
  const { inputSymbol, outputSymbol, inputAmount, minimumReceived, inputDecimals, outputDecimals, mnemonic } = params;

  if (!mnemonic) throw new Error('Wallet not unlocked');

  const hdWallet = HDNodeWallet.fromMnemonic(
    Mnemonic.fromPhrase(mnemonic),
    `m/44'/60'/0'/0/0`,
  );
  const provider = new ethers.JsonRpcProvider(getActiveRpc());
  const wallet = hdWallet.connect(provider);
  const walletAddress = wallet.address;

  const inputAddr = tokenAddress(inputSymbol);
  const outputAddr = tokenAddress(outputSymbol);
  const inputIsEth = inputAddr === ETH_PSEUDO;

  const amountInWei = parseUnits(inputAmount, inputDecimals);
  const feeUnits = (amountInWei * FEE_BPS) / FEE_DENOMINATOR;
  const swapUnits = amountInWei - feeUnits;
  const minAmountOutWei = parseUnits(minimumReceived, outputDecimals);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const path = getPath(inputAddr, outputAddr);

  const iface = new ethers.Interface([
    'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory)',
    'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory)',
    'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory)',
  ]);

  let approvalTxHash: string | undefined;

  // Handle approval for non-ETH inputs
  if (!inputIsEth) {
    const needsApproval = await checkApprovalNeeded(inputAddr, walletAddress, swapUnits);
    if (needsApproval) {
      const coder = AbiCoder.defaultAbiCoder();
      // H-2: Approve only the exact swap amount, not MAX_UINT256
      const approveData =
        APPROVE_SELECTOR +
        coder.encode(['address', 'uint256'], [UNISWAP_V2_ROUTER, swapUnits]).slice(2);

      const approveTx = await wallet.sendTransaction({
        to: inputAddr,
        data: approveData,
        value: 0n,
        gasLimit: 60_000n,
        type: 2,
      });
      await approveTx.wait();
      approvalTxHash = approveTx.hash;
    }
  }

  // Build and send swap
  let swapTxHash: string;
  const outputIsEth = outputAddr === ETH_PSEUDO;

  if (inputIsEth) {
    const data = iface.encodeFunctionData('swapExactETHForTokens', [
      minAmountOutWei, path, walletAddress, deadline,
    ]);
    const tx = await wallet.sendTransaction({
      to: UNISWAP_V2_ROUTER, data, value: swapUnits, gasLimit: 200_000n, type: 2,
    });
    swapTxHash = tx.hash;
  } else if (outputIsEth) {
    const data = iface.encodeFunctionData('swapExactTokensForETH', [
      swapUnits, minAmountOutWei, path, walletAddress, deadline,
    ]);
    const tx = await wallet.sendTransaction({
      to: UNISWAP_V2_ROUTER, data, value: 0n, gasLimit: 200_000n, type: 2,
    });
    swapTxHash = tx.hash;
  } else {
    const data = iface.encodeFunctionData('swapExactTokensForTokens', [
      swapUnits, minAmountOutWei, path, walletAddress, deadline,
    ]);
    const tx = await wallet.sendTransaction({
      to: UNISWAP_V2_ROUTER, data, value: 0n, gasLimit: 200_000n, type: 2,
    });
    swapTxHash = tx.hash;
  }

  return { approvalTxHash, swapTxHash };
}
