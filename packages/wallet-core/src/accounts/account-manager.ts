import { HDNodeWallet, Mnemonic, getAddress, Wallet } from 'ethers';
import { buildDerivationPath } from '../keychain/hd-derivation.js';
import { DerivationError } from '../errors.js';
import { MAX_ACCOUNTS, DEFAULT_ACCOUNT_NAME } from './constants.js';
import type { SubWallet, AccountsState } from './types.js';

export class AccountManager {
  private mnemonic: string;
  private state: AccountsState;

  constructor(mnemonic: string, initialState?: AccountsState) {
    this.mnemonic = mnemonic;
    if (initialState) {
      this.state = initialState;
    } else {
      const account0 = this.deriveSubWallet(0, `${DEFAULT_ACCOUNT_NAME} 1`);
      this.state = {
        wallets: [account0],
        activeIndex: 0,
        nextIndex: 1,
      };
    }
  }

  private deriveSubWallet(index: number, name: string): SubWallet {
    const path = buildDerivationPath(index);
    const wallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(this.mnemonic), path);
    return {
      index,
      name,
      address: getAddress(wallet.address),
      derivationPath: path,
      createdAt: Date.now(),
      isDefault: index === 0,
    };
  }

  createAccount(name?: string): SubWallet {
    if (this.state.nextIndex >= MAX_ACCOUNTS) {
      throw new DerivationError(`Maximum account limit of ${MAX_ACCOUNTS} reached`);
    }
    const index = this.state.nextIndex;
    const accountName = name?.trim() || `${DEFAULT_ACCOUNT_NAME} ${index + 1}`;
    const subWallet = this.deriveSubWallet(index, accountName);
    this.state = {
      ...this.state,
      wallets: [...this.state.wallets, subWallet],
      nextIndex: index + 1,
    };
    return subWallet;
  }

  getAccount(index: number): SubWallet {
    const wallet = this.state.wallets.find(w => w.index === index);
    if (!wallet) throw new DerivationError(`No account at index ${index}`);
    return wallet;
  }

  getAllAccounts(): SubWallet[] {
    return [...this.state.wallets];
  }

  getActiveAccount(): SubWallet {
    return this.getAccount(this.state.activeIndex);
  }

  setActiveAccount(index: number): void {
    this.getAccount(index); // validates it exists
    this.state = { ...this.state, activeIndex: index };
  }

  renameAccount(index: number, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new DerivationError('Account name cannot be empty');
    this.state = {
      ...this.state,
      wallets: this.state.wallets.map(w =>
        w.index === index ? { ...w, name: trimmed } : w
      ),
    };
  }

  removeAccount(index: number): void {
    if (index === 0) throw new DerivationError('Cannot remove the default account (index 0)');
    this.getAccount(index); // validates it exists
    const wasActive = this.state.activeIndex === index;
    this.state = {
      ...this.state,
      wallets: this.state.wallets.filter(w => w.index !== index),
      activeIndex: wasActive ? 0 : this.state.activeIndex,
    };
  }

  /** Returns a signer Wallet — caller must not store this; use ephemerally for signing only */
  getSignerForAccount(index: number): Wallet {
    this.getAccount(index); // validates it exists
    const path = buildDerivationPath(index);
    const hdWallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(this.mnemonic), path);
    return new Wallet(hdWallet.privateKey);
  }

  /** Export private key — caller must show security warning in UI */
  exportPrivateKey(index: number): string {
    this.getAccount(index);
    const path = buildDerivationPath(index);
    const hdWallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(this.mnemonic), path);
    return hdWallet.privateKey;
  }

  getState(): AccountsState {
    return { ...this.state };
  }
}
