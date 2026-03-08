import '@walletconnect/react-native-compat';
import { Web3Wallet, type IWeb3Wallet } from '@walletconnect/web3wallet';
import { Core } from '@walletconnect/core';

// TODO: Replace with your WalletConnect Project ID from cloud.walletconnect.com
const WC_PROJECT_ID = '06dcb80a9fcec7460c168fd8d6718cb5';

let client: IWeb3Wallet | null = null;

export async function getWalletConnectClient(): Promise<IWeb3Wallet> {
  if (client) return client;
  const core = new Core({ projectId: WC_PROJECT_ID });
  client = await Web3Wallet.init({
    core,
    metadata: {
      name: 'Saiko Wallet',
      description: 'Non-custodial wallet for Saiko Inu',
      url: 'https://saikoinu.com',
      icons: ['https://saikoinu.com/logo.png'],
    },
  });
  return client;
}

export function resetClient(): void {
  client = null;
}
