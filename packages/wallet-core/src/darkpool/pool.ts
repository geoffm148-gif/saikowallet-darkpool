/**
 * Saiko DarkPool — Pool Info (Live Contract Reads)
 *
 * Reads on-chain pool state from the deployed SaikoDarkPoolV2 contract.
 */

import { ethers } from 'ethers';
import type { DarkPoolInfo } from './types.js';
import {
  DARKPOOL_TIERS,
  DARK_POOL_ADDRESS,
  PRIVACY_THRESHOLD_LOW,
  PRIVACY_THRESHOLD_MODERATE,
} from './constants.js';

const DARK_POOL_V2_ABI = [
  'function nextIndex() view returns (uint32)',
  'function tierBalance(uint256) view returns (uint256)',
  'function paused() view returns (bool)',
  'function getLastRoot() view returns (bytes32)',
];

/**
 * Derive privacy level from deposit count.
 */
export function getPrivacyLevel(depositCount: number): 'low' | 'moderate' | 'strong' {
  if (depositCount < PRIVACY_THRESHOLD_LOW) return 'low';
  if (depositCount < PRIVACY_THRESHOLD_MODERATE) return 'moderate';
  return 'strong';
}

/**
 * Get pool info for a single tier from the live SaikoDarkPoolV2 contract.
 */
export async function getPoolInfo(tier: bigint, rpcUrl?: string): Promise<DarkPoolInfo> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl ?? 'https://eth.llamarpc.com');
    const pool = new ethers.Contract(DARK_POOL_ADDRESS, DARK_POOL_V2_ABI, provider);

    const [nextIndex, tierBalance] = await Promise.all([
      pool.nextIndex!() as Promise<bigint>,
      pool.tierBalance!(tier * 10n ** 18n) as Promise<bigint>,
    ]);

    const tierAmountWei = tier * 10n ** 18n;
    const effectivePerDeposit = tierAmountWei * 9950n / 10000n;
    const depositCount = effectivePerDeposit > 0n
      ? Math.floor(Number(tierBalance) / Number(effectivePerDeposit))
      : 0;

    return {
      tier,
      address: DARK_POOL_ADDRESS,
      depositCount,
      privacyLevel: getPrivacyLevel(depositCount),
    };
  } catch {
    return {
      tier,
      address: DARK_POOL_ADDRESS,
      depositCount: 0,
      privacyLevel: 'low',
    };
  }
}

/**
 * Get pool info for all 4 tiers from the live contract.
 */
export async function getAllPoolInfo(rpcUrl?: string): Promise<DarkPoolInfo[]> {
  const results = await Promise.all(
    DARKPOOL_TIERS.map((tier) => getPoolInfo(tier, rpcUrl)),
  );
  return results;
}
