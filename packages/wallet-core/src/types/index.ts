/**
 * Shared TypeScript types for the Saiko Wallet core engine.
 *
 * WHY: Centralizing types ensures consistent data shapes across keychain,
 * crypto, tx, rpc, and token modules. All financial values use BigInt
 * to prevent floating-point precision bugs that could cost users funds.
 */

// ─── Network ─────────────────────────────────────────────────────────────────

export interface NetworkConfig {
  readonly chainId: number;
  readonly name: string;
  readonly rpcUrls: readonly string[];
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
  readonly blockExplorerUrl: string;
  readonly isTestnet: boolean;
}

export interface ProviderConfig {
  readonly url: string;
  readonly timeoutMs: number;
  readonly weight: number; // Higher = preferred in rotation
}

// ─── Wallet / Key Management ──────────────────────────────────────────────────

export interface WalletAccount {
  readonly address: string; // EIP-55 checksummed address
  readonly derivationPath: string; // e.g. "m/44'/60'/0'/0/0"
  readonly index: number;
  readonly publicKey: string; // Uncompressed hex
}

export interface DerivedAccounts {
  readonly accounts: readonly WalletAccount[];
  readonly masterFingerprint: string; // BIP-32 master key fingerprint
}

export type MnemonicWordCount = 12 | 24;

export interface MnemonicResult {
  readonly mnemonic: string; // Space-separated BIP-39 words — NEVER log this
  readonly entropy: Uint8Array; // Raw entropy — zero-out after use
}

export interface EncryptedKeystore {
  readonly version: 1;
  readonly ciphertext: string; // Base64-encoded libsodium secretbox ciphertext
  readonly nonce: string; // Base64-encoded 24-byte XSalsa20-Poly1305 nonce
  readonly salt: string; // Base64-encoded Argon2id salt
  readonly kdfParams: {
    readonly algorithm: 'argon2id';
    readonly memoryKb: number;
    readonly iterations: number;
    readonly parallelism: number;
  };
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export type TransactionType = 'legacy' | 'eip1559';

export interface BaseTransactionRequest {
  readonly from: string;
  readonly to: string;
  readonly value: bigint; // Wei — always BigInt, never float
  readonly nonce: number;
  readonly gasLimit: bigint;
  readonly chainId: number;
  readonly data?: string; // Hex-encoded calldata (for ERC-20 transfers)
}

export interface LegacyTransactionRequest extends BaseTransactionRequest {
  readonly type: 'legacy';
  readonly gasPrice: bigint; // Wei
}

export interface Eip1559TransactionRequest extends BaseTransactionRequest {
  readonly type: 'eip1559';
  readonly maxFeePerGas: bigint; // Wei (EIP-1559 total fee cap)
  readonly maxPriorityFeePerGas: bigint; // Wei (miner tip)
}

export type TransactionRequest = LegacyTransactionRequest | Eip1559TransactionRequest;

export interface SignedTransaction {
  readonly serialized: string; // Hex-encoded RLP for eth_sendRawTransaction
  readonly hash: string; // Transaction hash (32 bytes, hex)
  readonly from: string;
}

export type GasSpeed = 'slow' | 'normal' | 'fast';

export interface GasEstimate {
  readonly slow: GasPrice;
  readonly normal: GasPrice;
  readonly fast: GasPrice;
  readonly estimatedAt: number; // Unix timestamp — cache invalidation
}

export interface GasPrice {
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly gasPrice: bigint; // Legacy fallback
}

export interface NonceState {
  readonly address: string;
  readonly onChainNonce: number; // eth_getTransactionCount (latest)
  readonly pendingNonce: number; // Locally tracked pending nonce
  readonly gaps: readonly number[]; // Nonces with missing txns (potential gaps)
}

// ─── ERC-20 Tokens ───────────────────────────────────────────────────────────

export interface TokenInfo {
  readonly address: string; // EIP-55 checksummed
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly chainId: number;
  readonly isFeatured: boolean;
  readonly logoUrl?: string;
}

export interface TokenBalance {
  readonly token: TokenInfo;
  readonly raw: bigint; // Raw uint256 balance from contract
  readonly formatted: string; // Human-readable (e.g., "123.45")
}

// ─── RPC ─────────────────────────────────────────────────────────────────────

export interface RpcRequest {
  readonly method: string;
  readonly params: readonly unknown[];
}

export interface RpcResponse<T = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly result?: T;
  readonly error?: {
    readonly code: number;
    readonly message: string;
  };
}

export interface RpcClientConfig {
  readonly providers: readonly ProviderConfig[];
  readonly maxRetries: number;
  readonly chainId: number;
}

// ─── Crypto ──────────────────────────────────────────────────────────────────

export interface Argon2Params {
  readonly memoryKb: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly saltLength: number;
  readonly keyLength: number;
}
