import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Fix for environments where libraries might try to redefine fetch
if (typeof window !== 'undefined' && typeof globalThis !== 'undefined' && !globalThis.fetch) {
  try {
    Object.defineProperty(globalThis, 'fetch', {
      value: window.fetch.bind(window),
      configurable: true,
      writable: true
    });
  } catch (e) {
    console.warn('Could not polyfill fetch on globalThis', e);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
