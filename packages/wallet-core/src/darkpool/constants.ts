/**
 * Saiko DarkPool — Constants
 *
 * Fixed deposit tiers, fee parameters, and pool configuration.
 * All values are compile-time constants — never fetched from remote config.
 */

// ─── Deposit Tiers ────────────────────────────────────────────────────────────

/**
 * Fixed deposit increment amounts in SAIKO base units (18 decimals).
 * Uniform sizes are critical — they define the anonymity set.
 * NEVER allow custom amounts.
 */
export const DARKPOOL_TIERS: readonly bigint[] = [
  10_000_000n,       // Tier 1 — 10M SAIKO  (0.001% of supply)
  100_000_000n,      // Tier 2 — 100M SAIKO (0.01% of supply)
  1_000_000_000n,    // Tier 3 — 1B SAIKO   (0.1% of supply)
  10_000_000_000n,   // Tier 4 — 10B SAIKO  (1% of supply)
] as const;

/**
 * Human-readable labels keyed by tier amount (as string for Map compatibility).
 */
export const TIER_LABELS: Readonly<Record<string, string>> = {
  '10000000':    '10M SAIKO',
  '100000000':   '100M SAIKO',
  '1000000000':  '1B SAIKO',
  '10000000000': '10B SAIKO',
} as const;

// ─── Fee Parameters ───────────────────────────────────────────────────────────

/** 0.5% service fee expressed as basis points. Immutable. */
export const DARKPOOL_FEE_BPS = 50n;

/** BPS denominator. */
export const DARKPOOL_FEE_DENOMINATOR = 10_000n;

// ─── Cryptographic Parameters ─────────────────────────────────────────────────

/**
 * Merkle tree depth — supports up to 2^20 (~1M) deposits per pool.
 * Increasing this after deployment requires redeployment.
 */
export const MERKLE_TREE_DEPTH = 20;

// ─── Addresses ────────────────────────────────────────────────────────────────

/**
 * Saiko Treasury address — EIP-55 checksummed.
 * Fee recipient for all DarkPool deposits.
 * Override via SAIKO_TREASURY_ADDRESS env var for deployment flexibility.
 * MUST NOT be changed at runtime or via remote config.
 */
export const TREASURY_ADDRESS = process.env.SAIKO_TREASURY_ADDRESS || '0xbB54d3350e256D3660Ec35dc87FF52c18f541d6A';

if (!TREASURY_ADDRESS.match(/^0x[0-9a-fA-F]{40}$/)) {
  throw new Error('Invalid TREASURY_ADDRESS');
}

// ─── Anonymity Set Thresholds ─────────────────────────────────────────────────

// ─── Staking Reward Parameters ───────────────────────────────────────────────

/** 10% of all fees → staking reward pool (1000 BPS). */
export const REWARD_SHARE_BPS = 1000n;

/** BPS denominator for reward split. */
export const REWARD_DENOMINATOR = 10_000n;

/** 1e18 precision multiplier for reward-per-token accumulator. */
export const REWARD_PRECISION = 1_000_000_000_000_000_000n;

// ─── Deployed Contract Addresses (Mainnet) ───────────────────────────────────

/** SaikoDarkPoolV3 mainnet contract address (redeployed 2026-03-09, signal ordering + privacy + amount validation fix). */
export const DARK_POOL_ADDRESS = '0x3Da6De018866b0f4c2b1D9Ef5D70be25597FDF53';

/** SaikoDarkPoolV2 mainnet contract address (paused, kept for existing note withdrawals). */
export const DARK_POOL_V2_ADDRESS = '0x6d985d3b7d57c3b6acd5c275f761be62b425915b';

/** SaikoDarkPool V1 — kept for reference only. */
export const DARK_POOL_V1_ADDRESS = '0x7A0eF376323aCD960B49639DcdA5f87AE4743D82';

/** SaikoDarkPool V2 original — superseded. */
export const DARK_POOL_V2_OLD_ADDRESS = '0x8B97f03e4302988AaCa36a0c92A3Ac964da9B4Da';

/** SaikoDarkPoolV4 mainnet — active pool (deployed 2026-03-16). */
export const DARK_POOL_V4_ADDRESS = '0x45aD0D2850BB4f44F6d59f0d16E1E13922f9e14C';

/** SaikoDarkPoolStaking V2 mainnet — dual SAIKO+ETH rewards (deployed 2026-03-16). */
export const DARK_POOL_STAKING_ADDRESS = '0x67D3439e7AAC39B3c96b6eC38b3C06a39b4F98cC';

/** SaikoFeeConfig mainnet (deployed 2026-03-16). */
export const FEE_CONFIG_ADDRESS = '0x571411670ABA6DD0cd663C3e6D3655f50e10695A';

/** SaikoSwapRouterV2 mainnet (deployed 2026-03-16). */
export const SWAP_ROUTER_V2_ADDRESS = '0x4A1EAa497e2A083e54D3bab0EbB44466970fC73D';

/** SaikoPoolFactory mainnet (deployed 2026-03-16). */
export const POOL_FACTORY_ADDRESS = '0x59CE8aDaAF9b92B39d23F17BFb74D353271A1CbD';

/** SaikoSwapRouter V1 mainnet — kept for reference only. */
export const SWAP_ROUTER_ADDRESS = '0x5fb62a972aa9cfac642f117c00b2a48ea56fb82d';

/** SAIKO Token mainnet contract address (deployed 2026-03-06). */
export const SAIKO_TOKEN_ADDRESS = '0x4c89364F18Ecc562165820989549022e64eC2eD2';

// ─── Anonymity Set Thresholds ─────────────────────────────────────────────────

/** Deposit count below which privacy is considered low. */
export const PRIVACY_THRESHOLD_LOW = 10;

/** Deposit count below which privacy is considered moderate (inclusive lower bound). */
export const PRIVACY_THRESHOLD_MODERATE = 100;
