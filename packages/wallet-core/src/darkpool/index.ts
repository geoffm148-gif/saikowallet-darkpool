/**
 * Saiko DarkPool — Public API
 *
 * Re-exports all DarkPool privacy pool functionality.
 */

// Types
export type {
  ZKProof,
  DarkPoolNote,
  DarkPoolDeposit,
  DarkPoolWithdrawal,
  ComplianceProof,
  DarkPoolInfo,
  StakingInfo,
  StakingGlobalInfo,
  StakingClaimResult,
} from './types.js';

export { StakingError } from './types.js';

// Constants
export {
  DARKPOOL_TIERS,
  TIER_LABELS,
  DARKPOOL_FEE_BPS,
  DARKPOOL_FEE_DENOMINATOR,
  MERKLE_TREE_DEPTH,
  TREASURY_ADDRESS,
  PRIVACY_THRESHOLD_LOW,
  PRIVACY_THRESHOLD_MODERATE,
  REWARD_SHARE_BPS,
  REWARD_DENOMINATOR,
  REWARD_PRECISION,
  DARK_POOL_ADDRESS,
  DARK_POOL_V1_ADDRESS,
  DARK_POOL_STAKING_ADDRESS,
  SAIKO_TOKEN_ADDRESS,
} from './constants.js';

// Crypto
export {
  generateSecret,
  generateNullifier,
  poseidonHash,
  computeCommitment,
  deriveViewingKey,
  encryptNote,
  decryptNote,
} from './crypto.js';

// Fee
export {
  calculateDarkPoolFee,
  calculateAmountAfterFee,
  formatDarkPoolFeeBreakdown,
} from './fee.js';

// Note Store
export {
  saveNote,
  loadNotes,
  markNoteSpent,
  markNoteUnspent,
  exportNoteAsJson,
} from './note-store.js';

// Proof
export {
  generateWithdrawalProof,
  generateComplianceProof,
  verifyWithdrawalProof,
  formatProofForContract,
} from './proof.js';

// Merkle Tree
export { IncrementalMerkleTree } from './merkle-tree.js';

// Pool
export {
  getPoolInfo,
  getAllPoolInfo,
  getPrivacyLevel,
} from './pool.js';

// Staking Fee
export {
  splitDarkPoolFee,
  estimateAPY,
} from './staking-fee.js';

// Staking Accumulator
export { RewardAccumulator } from './staking-accumulator.js';

// Staking Pool
export { StakingPoolService, stakingPool, getOnChainStakingGlobalInfo } from './staking-pool.js';
