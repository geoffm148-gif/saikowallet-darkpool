import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet } from 'wagmi/chains';
import { http } from 'wagmi';
import { RPC_URLS } from './constants';

export const wagmiConfig = getDefaultConfig({
  appName: 'Saiko Dark Pools',
  projectId: 'dcf41bc4edf0bf77f9c811c1e2299c9b',
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(RPC_URLS[0]),
  },
  ssr: false,
});
