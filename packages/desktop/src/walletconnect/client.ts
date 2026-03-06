import { Web3Wallet, type IWeb3Wallet } from '@walletconnect/web3wallet';
import { Core } from '@walletconnect/core';

let client: IWeb3Wallet | null = null;

export async function getWalletConnectClient(): Promise<IWeb3Wallet> {
  if (client) return client;
  // Validate at call time (not module load) so the app starts without WC in test/dev
  const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string;
  if (!WC_PROJECT_ID) {
    throw new Error('VITE_WALLETCONNECT_PROJECT_ID is not set — check .env.local (see .env.example)');
  }
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
