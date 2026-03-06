import { ethers, HDNodeWallet, Mnemonic } from 'ethers';

const RPC_URL = 'https://cloudflare-eth.com';
const SAIKO_CONTRACT = '0x4c89364F18Ecc562165820989549022e64eC2eD2';

export interface SendParams {
  mnemonic: string;
  accountIndex: number;
  toAddress: string;
  amountWei: bigint;
  token: 'ETH' | 'SAIKO';
}

export interface GasEstimate {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit: bigint;
  estimatedCostEth: string;
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

export async function estimateGas(
  params: Omit<SendParams, 'mnemonic' | 'accountIndex'>,
): Promise<GasEstimate> {
  const feeData = await provider.getFeeData();
  const latestBlock = await provider.getBlock('latest');
  const baseFee = latestBlock?.baseFeePerGas ?? 20_000_000_000n;

  const maxPriorityFeePerGas = 1_500_000_000n; // 1.5 gwei
  const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;

  const gasLimit = params.token === 'ETH' ? 21_000n : 100_000n;

  const costWei = maxFeePerGas * gasLimit;
  const costEth = ethers.formatEther(costWei);
  const estimatedCostEth = `~${parseFloat(costEth).toFixed(6)} ETH`;

  return { maxFeePerGas, maxPriorityFeePerGas, gasLimit, estimatedCostEth };
}

export async function sendTransaction(params: SendParams): Promise<string> {
  const { mnemonic, accountIndex, toAddress, amountWei, token } = params;

  const hdWallet = HDNodeWallet.fromMnemonic(
    Mnemonic.fromPhrase(mnemonic),
    `m/44'/60'/0'/0/${accountIndex}`,
  );
  const wallet = hdWallet.connect(provider);

  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  const gasEst = await estimateGas({ toAddress, amountWei, token });

  if (token === 'ETH') {
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei,
      nonce,
      maxFeePerGas: gasEst.maxFeePerGas,
      maxPriorityFeePerGas: gasEst.maxPriorityFeePerGas,
      gasLimit: gasEst.gasLimit,
      type: 2,
    });
    return tx.hash;
  }

  // SAIKO ERC-20 transfer
  const iface = new ethers.Interface([
    'function transfer(address to, uint256 amount) returns (bool)',
  ]);
  const data = iface.encodeFunctionData('transfer', [toAddress, amountWei]);

  const tx = await wallet.sendTransaction({
    to: SAIKO_CONTRACT,
    data,
    nonce,
    maxFeePerGas: gasEst.maxFeePerGas,
    maxPriorityFeePerGas: gasEst.maxPriorityFeePerGas,
    gasLimit: gasEst.gasLimit,
    type: 2,
  });
  return tx.hash;
}
