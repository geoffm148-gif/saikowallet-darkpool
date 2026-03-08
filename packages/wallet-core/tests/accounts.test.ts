/**
 * AccountManager tests — multi-account (sub-wallet) system.
 *
 * Verifies: create, get, rename, remove, switch active, signer derivation,
 * private key export, max accounts limit, and state restore.
 */

import { describe, it, expect } from 'vitest';
import { getAddress, Wallet } from 'ethers';
import { AccountManager } from '../src/accounts/account-manager.js';
import { MAX_ACCOUNTS, DEFAULT_ACCOUNT_NAME } from '../src/accounts/constants.js';
import { DerivationError } from '../src/errors.js';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Known address for m/44'/60'/0'/0/0 with the above mnemonic
const KNOWN_ADDRESS_INDEX0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

describe('AccountManager', () => {
  // ─── Constructor ─────────────────────────────────────────────────────────────

  it('initializes with account 0 as default', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const accounts = mgr.getAllAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].index).toBe(0);
    expect(accounts[0].name).toBe(`${DEFAULT_ACCOUNT_NAME} 1`);
    expect(accounts[0].isDefault).toBe(true);
    expect(accounts[0].address).toBe(getAddress(KNOWN_ADDRESS_INDEX0));
    expect(accounts[0].derivationPath).toBe("m/44'/60'/0'/0/0");
    expect(accounts[0].createdAt).toBeGreaterThan(0);
  });

  it('restores from initialState', () => {
    const mgr1 = new AccountManager(TEST_MNEMONIC);
    mgr1.createAccount('Second');
    mgr1.setActiveAccount(1);
    const state = mgr1.getState();

    const mgr2 = new AccountManager(TEST_MNEMONIC, state);
    expect(mgr2.getAllAccounts()).toHaveLength(2);
    expect(mgr2.getActiveAccount().index).toBe(1);
    expect(mgr2.getState().nextIndex).toBe(2);
  });

  // ─── createAccount ──────────────────────────────────────────────────────────

  it('creates account with auto name', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const acct = mgr.createAccount();
    expect(acct.index).toBe(1);
    expect(acct.name).toBe(`${DEFAULT_ACCOUNT_NAME} 2`);
    expect(acct.isDefault).toBe(false);
    expect(mgr.getState().nextIndex).toBe(2);
  });

  it('creates account with custom name', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const acct = mgr.createAccount('Trading');
    expect(acct.name).toBe('Trading');
  });

  it('trims whitespace from custom name', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const acct = mgr.createAccount('  Savings  ');
    expect(acct.name).toBe('Savings');
  });

  it('falls back to auto name when custom name is empty/whitespace', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const acct = mgr.createAccount('   ');
    expect(acct.name).toBe(`${DEFAULT_ACCOUNT_NAME} 2`);
  });

  it('increments nextIndex on each creation', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    mgr.createAccount();
    mgr.createAccount();
    mgr.createAccount();
    expect(mgr.getState().nextIndex).toBe(4);
    expect(mgr.getAllAccounts()).toHaveLength(4);
  });

  it('derives unique addresses per index', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const a1 = mgr.createAccount();
    const a2 = mgr.createAccount();
    const addresses = mgr.getAllAccounts().map(w => w.address);
    expect(new Set(addresses).size).toBe(3);
    expect(a1.address).not.toBe(a2.address);
  });

  // ─── getAccount ─────────────────────────────────────────────────────────────

  it('returns correct account by index', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    mgr.createAccount('Second');
    const acct = mgr.getAccount(1);
    expect(acct.name).toBe('Second');
    expect(acct.index).toBe(1);
  });

  it('throws for missing index', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    expect(() => mgr.getAccount(99)).toThrow(DerivationError);
  });

  // ─── getAllAccounts ─────────────────────────────────────────────────────────

  it('returns a copy (not a reference)', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const accounts = mgr.getAllAccounts();
    accounts.push({} as never);
    expect(mgr.getAllAccounts()).toHaveLength(1);
  });

  // ─── setActiveAccount ───────────────────────────────────────────────────────

  it('switches active account', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    mgr.createAccount();
    mgr.setActiveAccount(1);
    expect(mgr.getActiveAccount().index).toBe(1);
  });

  it('throws when switching to missing index', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    expect(() => mgr.setActiveAccount(5)).toThrow(DerivationError);
  });

  // ─── renameAccount ──────────────────────────────────────────────────────────

  it('renames an account', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    mgr.renameAccount(0, 'Main');
    expect(mgr.getAccount(0).name).toBe('Main');
  });

  it('trims whitespace when renaming', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    mgr.renameAccount(0, '  Savings  ');
    expect(mgr.getAccount(0).name).toBe('Savings');
  });

  it('rejects empty name', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    expect(() => mgr.renameAccount(0, '   ')).toThrow(DerivationError);
  });

  // ─── removeAccount ──────────────────────────────────────────────────────────

  it('removes a non-default account', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    mgr.createAccount();
    mgr.removeAccount(1);
    expect(mgr.getAllAccounts()).toHaveLength(1);
  });

  it('throws when removing default account (index 0)', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    expect(() => mgr.removeAccount(0)).toThrow(DerivationError);
    expect(() => mgr.removeAccount(0)).toThrow(/default account/);
  });

  it('throws when removing non-existent account', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    expect(() => mgr.removeAccount(99)).toThrow(DerivationError);
  });

  it('switches active to 0 if active account was removed', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    mgr.createAccount();
    mgr.setActiveAccount(1);
    expect(mgr.getActiveAccount().index).toBe(1);
    mgr.removeAccount(1);
    expect(mgr.getActiveAccount().index).toBe(0);
  });

  it('keeps active unchanged if removed account was not active', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    mgr.createAccount();
    mgr.createAccount();
    mgr.setActiveAccount(2);
    mgr.removeAccount(1);
    expect(mgr.getActiveAccount().index).toBe(2);
  });

  // ─── getSignerForAccount ────────────────────────────────────────────────────

  it('returns a Wallet with correct address', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const signer = mgr.getSignerForAccount(0);
    expect(signer).toBeInstanceOf(Wallet);
    expect(getAddress(signer.address)).toBe(mgr.getAccount(0).address);
  });

  it('returns signer for non-default account', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const acct = mgr.createAccount();
    const signer = mgr.getSignerForAccount(1);
    expect(getAddress(signer.address)).toBe(acct.address);
  });

  it('throws for missing account in getSignerForAccount', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    expect(() => mgr.getSignerForAccount(99)).toThrow(DerivationError);
  });

  // ─── exportPrivateKey ───────────────────────────────────────────────────────

  it('exports private key that derives correct address', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const pk = mgr.exportPrivateKey(0);
    expect(pk).toMatch(/^0x[0-9a-f]{64}$/);
    const wallet = new Wallet(pk);
    expect(getAddress(wallet.address)).toBe(mgr.getAccount(0).address);
  });

  it('throws for missing account in exportPrivateKey', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    expect(() => mgr.exportPrivateKey(99)).toThrow(DerivationError);
  });

  // ─── Max accounts limit ─────────────────────────────────────────────────────

  it('throws when exceeding MAX_ACCOUNTS', () => {
    // Create a state that's at the limit
    const mgr = new AccountManager(TEST_MNEMONIC, {
      wallets: [{ index: 0, name: 'Account 1', address: KNOWN_ADDRESS_INDEX0, derivationPath: "m/44'/60'/0'/0/0", createdAt: Date.now(), isDefault: true }],
      activeIndex: 0,
      nextIndex: MAX_ACCOUNTS,
    });
    expect(() => mgr.createAccount()).toThrow(DerivationError);
    expect(() => mgr.createAccount()).toThrow(/Maximum account limit/);
  });

  // ─── getState ───────────────────────────────────────────────────────────────

  it('returns a copy of state', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    const state1 = mgr.getState();
    mgr.createAccount();
    const state2 = mgr.getState();
    expect(state1.wallets).toHaveLength(1);
    expect(state2.wallets).toHaveLength(2);
  });

  // ─── EIP-55 checksummed addresses ──────────────────────────────────────────

  it('all derived addresses are EIP-55 checksummed', () => {
    const mgr = new AccountManager(TEST_MNEMONIC);
    mgr.createAccount();
    mgr.createAccount();
    for (const acct of mgr.getAllAccounts()) {
      expect(acct.address).toBe(getAddress(acct.address));
    }
  });
});
