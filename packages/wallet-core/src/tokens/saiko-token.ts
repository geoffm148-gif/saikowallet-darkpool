/**
 * Saiko Inu (SAIKO) token metadata.
 *
 * WHY we hardcode this: SAIKO is the primary featured token of Saiko Wallet.
 * Users should not need to import it manually — it's always available.
 * The contract address is checksummed (EIP-55) to prevent typos or address
 * substitution attacks in future code.
 *
 * SECURITY: This address is THE canonical SAIKO contract. Any modification
 * to this address could result in users interacting with a fraudulent token.
 * This file must be reviewed on every dependency update and release.
 */

import { getAddress } from 'ethers';
import type { TokenInfo } from '../types/index.js';
import { MAINNET_CHAIN_ID } from '../rpc/network-config.js';

/**
 * The canonical SAIKO contract address (Ethereum Mainnet).
 * EIP-55 checksummed — this is the ground truth for all SAIKO interactions.
 *
 * WHY we call getAddress() here: getAddress() validates AND normalizes to
 * EIP-55 checksum format. If this literal ever contains a typo that's still
 * a valid hex address, the checksum will catch it at module load time.
 */
export const SAIKO_CONTRACT_ADDRESS = getAddress('0x4c89364F18Ecc562165820989549022e64eC2eD2');

export const SAIKO_TOKEN: TokenInfo = {
  address: SAIKO_CONTRACT_ADDRESS,
  name: 'Saiko Inu',
  symbol: 'SAIKO',
  decimals: 18, // Standard ERC-20 decimals — verify via contract.decimals() and cache
  chainId: MAINNET_CHAIN_ID,
  isFeatured: true,
  logoUrl: 'https://saikoinu.com/logo.png', // Update with actual CDN URL
};

/** Etherscan link for SAIKO contract — displayed in token info screen */
export const SAIKO_ETHERSCAN_URL = `https://etherscan.io/token/${SAIKO_CONTRACT_ADDRESS}`;

/** Uniswap deeplink to buy SAIKO (output token pre-selected) */
export const SAIKO_UNISWAP_URL =
  `https://app.uniswap.org/#/swap?outputCurrency=${SAIKO_CONTRACT_ADDRESS}&chain=mainnet`;

/** Community links */
export const SAIKO_COMMUNITY = {
  telegram: 'https://t.me/SaikoInu',
  twitter: 'https://x.com/Saikoinu_',
  website: 'https://saikoinu.com',
} as const;
