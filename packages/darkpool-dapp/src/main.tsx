import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import './index.css';
import { App } from './App';
import { wagmiConfig } from './wagmi.config';

const queryClient = new QueryClient();

const brandTheme = darkTheme({
  accentColor: '#E31B23',
  accentColorForeground: '#FFFFFF',
  borderRadius: 'none',
  fontStack: 'system',
  overlayBlur: 'none',
});

const rootEl = document.getElementById('root')!;

function renderError(msg: string) {
  rootEl.innerHTML = `<div style="color:#E31B23;font-family:monospace;padding:40px;background:#0A0A0A;min-height:100vh;white-space:pre-wrap">${msg}</div>`;
}

window.addEventListener('error', (e) => renderError('JS ERROR:\n' + e.message + '\n' + (e.error?.stack || '')));
window.addEventListener('unhandledrejection', (e) => renderError('PROMISE REJECTION:\n' + String(e.reason)));

createRoot(rootEl).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={brandTheme}>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
