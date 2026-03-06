/**
 * Saiko Wallet Desktop — React entry point.
 *
 * WHY StrictMode: Catches side-effects, deprecated APIs, and double-renders
 * in development. Production builds strip it automatically.
 */
import './polyfills.js'; // Must be first — provides Buffer for wallet-core
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('[Saiko Wallet] Root element #root not found in DOM. Check index.html.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
