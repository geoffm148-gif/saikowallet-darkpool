import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDNodeWallet, Wallet } from 'ethers';

export function generateMnemonic(): string {
  return bip39.generateMnemonic(wordlist, 128); // 12 words
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

export function deriveWallet(mnemonic: string, index = 0): { address: string; privateKey: string } {
  const root = HDNodeWallet.fromPhrase(mnemonic.trim());
  const child = root.derivePath(`m/44'/60'/0'/0/${index}`);
  return { address: child.address, privateKey: child.privateKey };
}

export function walletFromPrivateKey(privateKey: string): { address: string; privateKey: string } {
  const wallet = new Wallet(privateKey);
  return { address: wallet.address, privateKey: wallet.privateKey };
}
