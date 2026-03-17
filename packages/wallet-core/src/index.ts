/**
 * Saiko Wallet — wallet-core public API.
 *
 * WHY re-export from index: Consumers import from '@saiko-wallet/wallet-core'
 * without caring about internal file structure. This gives us freedom to
 * reorganize internals without breaking consumers.
 *
 * SECURITY: Do NOT export internal helpers that expose raw private key
 * material or bypass validation. Every export here is a public API.
 */

// Types
export type {
  NetworkConfig,
  ProviderConfig,
  WalletAccount,
  DerivedAccounts,
  MnemonicWordCount,
  MnemonicResult,
  EncryptedKeystore,
  TransactionType,
  LegacyTransactionRequest,
  Eip1559TransactionRequest,
  TransactionRequest,
  SignedTransaction,
  GasSpeed,
  GasEstimate,
  GasPrice,
  NonceState,
  TokenInfo,
  TokenBalance,
  RpcRequest,
  RpcResponse,
  RpcClientConfig,
  Argon2Params,
} from './types/index.js';

// Errors
export {
  InvalidSeedError,
  DerivationError,
  EncryptionError,
  DecryptionError,
  InsufficientFundsError,
  InvalidAddressError,
  GasEstimationError,
  NonceError,
  SigningError,
  TransactionBuildError,
  RPCTimeoutError,
  RPCError,
  AllProvidersFailedError,
  ChainIdMismatchError,
  TokenNotFoundError,
  InvalidTokenAmountError,
} from './errors.js';

// Keychain
export { generateMnemonic } from './keychain/mnemonic-generator.js';
export {
  validateMnemonic,
  assertValidMnemonic,
  isValidWordCount,
} from './keychain/seed-validator.js';
export {
  deriveAccount,
  deriveAccounts,
  buildDerivationPath,
  DEFAULT_DERIVATION_PATH,
  MAX_ACCOUNTS_PER_BATCH,
} from './keychain/hd-derivation.js';

// Crypto
export { secureRandom, secureRandomHex } from './crypto/secure-random.js';
export {
  deriveKey,
  deriveKeyWithSalt,
  ARGON2_PARAMS,
} from './crypto/argon2-kdf.js';
export {
  encryptPayload,
  decryptPayload,
  encryptPayloadFast,
  decryptPayloadFast,
} from './crypto/encryption.js';
export {
  wipeBytes,
  wipeBuffer,
  wipeAll,
  withWipe,
  withWipeSync,
} from './crypto/memory-wipe.js';

// Transactions
export {
  buildEthTransferEip1559,
  buildEthTransferLegacy,
  buildErc20TransferEip1559,
  buildErc20TransferLegacy,
  calculateMaxCost,
  ETH_TRANSFER_GAS_LIMIT,
  ERC20_TRANSFER_GAS_LIMIT,
} from './tx/transaction-builder.js';
export {
  estimateFeesFromHistory,
  parseFeeHistory,
  FEE_HISTORY_BLOCK_COUNT,
} from './tx/gas-estimator.js';
export { signTransaction, signMessage } from './tx/signer.js';
export {
  initNonceState,
  getNextNonce,
  detectGaps,
  confirmNonce,
  getReplacementNonce,
  clearNonceState,
  getNonceState,
} from './tx/nonce-manager.js';
export {
  encodeTransfer,
  encodeApprove,
  encodeBalanceOf,
  encodeAllowance,
  decodeUint256,
  decodeAddress,
  decodeString,
  decodeUint8,
  ERC20_SELECTORS,
} from './tx/erc20.js';

// RPC
export { createRpcClient } from './rpc/rpc-client.js';
export type { RpcClient } from './rpc/rpc-client.js';
export {
  validateChainId,
  parseChainId,
  isTestnet,
} from './rpc/chain-validator.js';
export {
  MAINNET_CONFIG,
  SEPOLIA_CONFIG,
  BUILTIN_NETWORKS,
  MAINNET_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  withCustomRpc,
  createCustomNetwork,
} from './rpc/network-config.js';
export {
  DEFAULT_MAINNET_PROVIDERS,
  DEFAULT_SEPOLIA_PROVIDERS,
  createProviderConfig,
  TIMEOUT_STANDARD_MS,
  TIMEOUT_CALL_MS,
  TIMEOUT_SEND_TX_MS,
} from './rpc/provider-config.js';

// Tokens
export {
  SAIKO_TOKEN,
  SAIKO_CONTRACT_ADDRESS,
  SAIKO_ETHERSCAN_URL,
  SAIKO_UNISWAP_URL,
  SAIKO_COMMUNITY,
} from './tokens/saiko-token.js';
export {
  getTokensForChain,
  getTokenByAddress,
  getTokenBySymbol,
  requireToken,
  isVerifiedToken,
  getFeaturedTokens,
} from './tokens/token-registry.js';

// ─── Phase 2: Security ────────────────────────────────────────────────────────

// Transaction simulation
export {
  simulateTransaction,
  decodeErc20Calldata,
} from './security/transaction-simulator.js';
export type {
  DecodedAction,
  DecodedActionType,
  SimulationResult,
} from './security/transaction-simulator.js';

// Address poisoning detection
export {
  detectPoisoning,
  calculateAddressSimilarity,
  hasPrefixSuffixMatch,
} from './security/address-poisoning.js';
export type { PoisoningCheckResult } from './security/address-poisoning.js';

// Clipboard guard
export {
  verifyClipboardIntegrity,
  isClipboardIntact,
} from './security/clipboard-guard.js';
export type { ClipboardCheckResult } from './security/clipboard-guard.js';

// ─── Phase 2: Privacy ─────────────────────────────────────────────────────────

// Tor proxy
export {
  createTorProxyConfig,
  createTorProxyConfigWithAuth,
  wrapFetchWithProxy,
  TOR_DEFAULT_HOST,
  TOR_DEFAULT_PORT,
  TOR_BROWSER_PORT,
  TOR_CONNECT_TIMEOUT_MS,
} from './privacy/tor-proxy.js';
export type {
  TorProxyConfig,
  SocksVersion,
  SocksAuthMethod,
  FetchFn,
  Socks5ConnectionFactory,
  Socks5Connection,
} from './privacy/tor-proxy.js';

// Data retention
export {
  createRetentionPolicy,
  filterExpiredRecords,
  shouldPurge,
  partitionByRetention,
  countExpiredRecords,
  RETENTION_PRESETS,
} from './privacy/data-retention.js';
export type {
  RetentionPolicy,
  TimestampedRecord,
} from './privacy/data-retention.js';

// ─── Phase 2: Backup & Recovery ───────────────────────────────────────────────

// Encrypted backup
export {
  createEncryptedBackup,
  createEncryptedBackupFast,
  restoreFromBackup,
  serializeBackup,
  deserializeBackup,
  BACKUP_ARGON2_PARAMS,
} from './backup/encrypted-backup.js';
export type { EncryptedBackup } from './backup/encrypted-backup.js';

// Shamir Secret Sharing
export {
  splitSecret,
  combineShares,
  validateShareSet,
} from './backup/shamir-sss.js';
export type { ShamirShare } from './backup/shamir-sss.js';

// Recovery verifier
export {
  verifyRecoveryCapability,
  verifyMnemonicsMatch,
} from './backup/recovery-verifier.js';
export type { RecoveryVerification } from './backup/recovery-verifier.js';

// ─── Phase 2: Auth ────────────────────────────────────────────────────────────

// Auto-lock
export {
  createAutoLockManager,
  recordActivity,
  isLocked,
  setLockTimeout,
  lockNow,
  unlockWallet,
  getNextLockAt,
  assertUnlocked,
  DEFAULT_LOCK_TIMEOUT_MS,
} from './auth/auto-lock.js';
export type { AutoLockState } from './auth/auto-lock.js';

// PIN manager
export {
  hashPin,
  hashPinWithSalt,
  verifyPin,
  validatePinStrength,
  createDuressPin,
  PIN_ARGON2_PARAMS,
  PIN_ARGON2_TEST_PARAMS,
} from './auth/pin-manager.js';
export type { PinValidationResult, HashedPin } from './auth/pin-manager.js';

// Session manager
export {
  createSession,
  isSessionValid,
  refreshSession,
  requireReauth,
  elevateSession,
  assertSessionAllows,
  describeOperation,
} from './auth/session-manager.js';
export type {
  AuthMethod,
  HighValueOperation,
  Session,
  ReauthRequirement,
} from './auth/session-manager.js';

// Accounts
export type { SubWallet, AccountsState } from './accounts/types.js';
export { AccountManager } from './accounts/account-manager.js';
export { BASE_DERIVATION_PATH, MAX_ACCOUNTS, DEFAULT_ACCOUNT_NAME } from './accounts/constants.js';

// ─── DarkPool (Privacy Pool) ────────────────────────────────────────────────

export * from './darkpool/index.js';

// ─── Swap ─────────────────────────────────────────────────────────────────────

export type { SwapQuote, BuildSwapQuoteParams } from './swap/index.js';
export {
  buildSwapQuote,
  fetchSwapQuote,
  calculatePriceImpact,
  calculateMinimumReceived,
} from './swap/index.js';

export type { SwapToken } from './swap/index.js';
export {
  SWAP_TOKENS,
  getSwapTokens,
  findToken,
} from './swap/index.js';

export {
  buildSwapTransaction,
  UNISWAP_V2_ROUTER,
} from './swap/index.js';

export type { ApprovalStatus } from './swap/index.js';
export {
  checkTokenApproval,
  buildApproveTransaction,
  buildRevokeApprovalTransaction,
} from './swap/index.js';

// ─── WalletConnect ───────────────────────────────────────────────────────────

export type {
  WCSession,
  WCRequest,
  WCRequestResult,
  SupportedMethod,
  ParsedTxRequest,
} from './walletconnect/index.js';

export {
  SUPPORTED_METHODS,
  signMessage as wcSignMessage,
  signTypedData as wcSignTypedData,
  parseSendTransactionRequest,
} from './walletconnect/index.js';

// ─── Phase 2: New Errors ──────────────────────────────────────────────────────

export {
  SimulationError,
  AddressPoisoningError,
  BackupError,
  RestoreError,
  ShamirError,
  RecoveryVerificationError,
  PinError,
  SessionError,
  ReauthRequiredError,
  WalletLockedError,
} from './errors.js';
