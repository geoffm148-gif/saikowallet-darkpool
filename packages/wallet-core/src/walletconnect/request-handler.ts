import { Wallet } from 'ethers';

/**
 * Handle a personal_sign or eth_sign request.
 * Returns the signature hex string.
 *
 * personal_sign: params[0] = hex message, params[1] = address
 * eth_sign:      params[0] = address, params[1] = hex message
 */
export function signMessage(privateKey: string, params: unknown[], method: string = 'personal_sign'): string {
  const wallet = new Wallet(privateKey);
  const walletAddr = wallet.address.toLowerCase();

  let message: string;
  let signerAddress: string;

  if (method === 'eth_sign') {
    // eth_sign: params[0] = address, params[1] = hex message
    signerAddress = (params[0] as string).toLowerCase();
    message = params[1] as string;
  } else {
    // personal_sign: params[0] = hex message, params[1] = address
    message = params[0] as string;
    signerAddress = (params[1] as string).toLowerCase();
  }

  if (signerAddress !== walletAddr) {
    throw new Error(`Signer address mismatch: requested ${signerAddress}, wallet is ${walletAddr}`);
  }

  const msgBytes =
    typeof message === 'string' && message.startsWith('0x')
      ? Buffer.from(message.slice(2), 'hex')
      : message;
  return wallet.signMessageSync(msgBytes);
}

/**
 * Handle eth_signTypedData_v4 (EIP-712).
 * params[0] = address, params[1] = JSON string of typed data
 */
export async function signTypedData(privateKey: string, params: unknown[]): Promise<string> {
  const typedDataStr = params[1] as string;
  const typedData = JSON.parse(typedDataStr) as {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };

  const wallet = new Wallet(privateKey);

  // Remove EIP712Domain from types — ethers adds it automatically
  const types = { ...typedData.types };
  delete types['EIP712Domain'];

  return wallet.signTypedData(
    typedData.domain,
    types,
    typedData.message,
  );
}

export interface ParsedTxRequest {
  to: string;
  value: bigint;
  data: string;
  gas?: bigint;
}

/**
 * Parse an eth_sendTransaction request into a structured tx object.
 * Does NOT sign — caller handles signing separately.
 */
export function parseSendTransactionRequest(params: unknown[]): ParsedTxRequest {
  const tx = params[0] as Record<string, string | undefined>;
  return {
    to: tx['to'] ?? '',
    value: tx['value'] ? BigInt(tx['value']) : 0n,
    data: tx['data'] ?? '0x',
    gas: tx['gas'] ? BigInt(tx['gas']) : tx['gasLimit'] ? BigInt(tx['gasLimit']) : undefined,
  };
}
