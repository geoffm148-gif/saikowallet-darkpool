/**
 * BIP-39 mnemonic phrase generation.
 *
 * WHY: Mnemonics must derive from true cryptographic randomness (CSPRNG),
 * never Math.random(). We use ethers.Mnemonic which implements BIP-39
 * correctly and is a battle-tested library. The entropy array is returned
 * so the caller can zero it out immediately after deriving keys.
 *
 * Standard: BIP-39 (https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
 */

import { Mnemonic } from 'ethers';
import type { MnemonicResult, MnemonicWordCount } from '../types/index.js';
import { secureRandom } from '../crypto/secure-random.js';
import { InvalidSeedError } from '../errors.js';

/** Map from word count to required entropy bytes (BIP-39 spec: ENT = wordCount * 11 - CS). */
const WORD_COUNT_TO_ENTROPY_BYTES: Record<MnemonicWordCount, number> = {
  12: 16, // 128 bits
  24: 32, // 256 bits
};

/**
 * Generate a cryptographically secure BIP-39 mnemonic.
 *
 * WHY we return entropy: callers can zero the buffer once they've derived
 * the HD node, preventing sensitive data lingering in memory.
 *
 * @param wordCount - 12 (128-bit) or 24 (256-bit) words. 24 words is preferred
 *                   for maximum security; 12 is acceptable for usability.
 */
export function generateMnemonic(wordCount: MnemonicWordCount = 24): MnemonicResult {
  const entropyBytes = WORD_COUNT_TO_ENTROPY_BYTES[wordCount];
  const entropy = secureRandom(entropyBytes);

  // ethers.Mnemonic.fromEntropy implements BIP-39 correctly:
  // - Appends SHA-256 checksum bits to entropy
  // - Encodes into 11-bit groups mapped to BIP-39 English wordlist
  let mnemonicObj: Mnemonic;
  try {
    mnemonicObj = Mnemonic.fromEntropy(entropy);
  } catch (err) {
    throw new InvalidSeedError('Failed to generate mnemonic from entropy', err);
  }

  return {
    mnemonic: mnemonicObj.phrase,
    entropy,
  };
}
