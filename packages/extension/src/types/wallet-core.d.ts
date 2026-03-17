/**
 * Type declarations for @saiko-wallet/wallet-core.
 * Generated for extension build (wallet-core dist not available in worktree).
 */
declare module '@saiko-wallet/wallet-core' {
  // ── Accounts ────────────────────────────────────────────────────────────────
  export interface SubWallet {
    index: number;
    name: string;
    address: string;
    derivationPath: string;
    createdAt: number;
    isDefault: boolean;
  }

  export interface AccountsState {
    wallets: SubWallet[];
    activeIndex: number;
    nextIndex: number;
  }

  // ── Types ───────────────────────────────────────────────────────────────────
  export type MnemonicWordCount = 12 | 24;

  export interface MnemonicResult {
    readonly mnemonic: string;
    readonly entropy: Uint8Array;
  }

  export interface WalletAccount {
    readonly address: string;
    readonly derivationPath: string;
    readonly index: number;
    readonly publicKey: string;
  }

  export interface TokenInfo {
    readonly address: string;
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
    readonly chainId: number;
    readonly isFeatured: boolean;
    readonly logoUrl?: string;
  }

  // ── Keychain ────────────────────────────────────────────────────────────────
  export function generateMnemonic(wordCount?: MnemonicWordCount): MnemonicResult;
  export function deriveAccount(mnemonic: string, index: number): WalletAccount;

  // ── Tokens ──────────────────────────────────────────────────────────────────
  export const SAIKO_TOKEN: TokenInfo;
  export const SAIKO_CONTRACT_ADDRESS: string;
  export function encodeBalanceOf(owner: string): string;
  export function decodeUint256(data: string): bigint;

  // ── ERC-20 ──────────────────────────────────────────────────────────────────
  export function encodeTransfer(to: string, amount: bigint): string;
  export function encodeApprove(spender: string, amount: bigint): string;

  // ── DarkPool Types ──────────────────────────────────────────────────────────
  export interface DarkPoolNote {
    readonly secret: Uint8Array;
    readonly nullifier: Uint8Array;
    readonly commitment: string;
    readonly amount: bigint;
    readonly tier: number;
    readonly timestamp: number;
    readonly txHash: string;
    readonly viewingKey: Uint8Array;
    readonly isSpent: boolean;
    readonly poolVersion?: 'v2' | 'v3';
  }

  // ── DarkPool Constants ──────────────────────────────────────────────────────
  export const DARKPOOL_TIERS: readonly bigint[];
  export const TIER_LABELS: Readonly<Record<string, string>>;
  export const DARK_POOL_ADDRESS: string;
  export const DARK_POOL_V2_ADDRESS: string;
  export const SAIKO_TOKEN_ADDRESS: string;

  // ── DarkPool Crypto ─────────────────────────────────────────────────────────
  export function generateSecret(): Uint8Array;
  export function generateNullifier(): Uint8Array;
  export function poseidonHash(inputs: bigint[]): Promise<bigint>;
  export function computeCommitment(secret: Uint8Array, nullifier: Uint8Array): Promise<string>;
  export function deriveViewingKey(secret: Uint8Array): Promise<Uint8Array>;

  // ── DarkPool Fees ───────────────────────────────────────────────────────────
  export function calculateAmountAfterFee(tierAmount: bigint): bigint;
  export function formatDarkPoolFeeBreakdown(tier: bigint): {
    tier: bigint;
    fee: bigint;
    amountAfterFee: bigint;
  };

  // ── DarkPool Note Store ─────────────────────────────────────────────────────
  export function saveNote(note: DarkPoolNote, password: string): Promise<void>;
  export function markNoteSpent(commitment: string, password: string): Promise<void>;

  // ── DarkPool Merkle Tree ────────────────────────────────────────────────────
  export class IncrementalMerkleTree {
    static create(levels?: number): Promise<IncrementalMerkleTree>;
    insert(leaf: bigint): void;
    getRoot(): bigint;
    getProof(index: number): {
      pathElements: bigint[];
      pathIndices: number[];
      root: bigint;
    };
  }

  // ── DarkPool Proofs ─────────────────────────────────────────────────────────
  export function formatProofForContract(proof: unknown): {
    pA: [bigint, bigint];
    pB: [[bigint, bigint], [bigint, bigint]];
    pC: [bigint, bigint];
  };

  // ── Swap ────────────────────────────────────────────────────────────────────
  export interface SwapToken {
    readonly address: string;
    readonly symbol: string;
    readonly name: string;
    readonly decimals: number;
    readonly logoUrl: string;
    readonly featured: boolean;
  }

  export interface SwapQuote {
    readonly inputToken: SwapToken;
    readonly outputToken: SwapToken;
    readonly inputAmount: string;
    readonly feeAmount: string;
    readonly feeRate: string;
    readonly amountSwapped: string;
    readonly outputAmount: string;
    readonly priceImpact: number;
    readonly minimumReceived: string;
    readonly route: readonly string[];
    readonly gasEstimate: string;
    readonly expiresAt: number;
    readonly isLiveQuote: boolean;
    readonly quoteTimestamp: number;
  }

  export function getSwapTokens(): readonly SwapToken[];
  export function fetchSwapQuote(params: {
    inputToken: SwapToken;
    outputToken: SwapToken;
    inputAmount: string;
    slippageTolerance: number;
    rpcUrl?: string;
  }): Promise<SwapQuote>;
  export function buildSwapTransaction(
    quote: SwapQuote,
    walletAddress: string,
  ): { to: string; data: string; value?: string };

  export const UNISWAP_V2_ROUTER: string;

  // ── Encryption (used by service worker migration) ───────────────────────────
  export function decryptPayload(keystore: unknown, passphrase: string): Promise<Uint8Array>;
}
