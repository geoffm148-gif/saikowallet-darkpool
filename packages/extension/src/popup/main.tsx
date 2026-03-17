/**
 * Saiko Wallet Extension — React entry point.
 */
import './polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('[Saiko Wallet] Root element #root not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
