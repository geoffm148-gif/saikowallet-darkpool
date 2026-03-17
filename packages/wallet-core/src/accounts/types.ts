export interface SubWallet {
  index: number;
  name: string;
  address: string;          // EIP-55 checksummed
  derivationPath: string;   // e.g. m/44'/60'/0'/0/3
  createdAt: number;        // unix timestamp ms
  isDefault: boolean;       // true only for index 0
}

export interface AccountsState {
  wallets: SubWallet[];
  activeIndex: number;
  nextIndex: number;        // next index to use when creating
}
