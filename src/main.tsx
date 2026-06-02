import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safe event listeners to avoid annoying HMR/WebSocket popups and logs in sandboxed iFrames
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (
      reason.includes('WebSocket') || 
      reason.includes('failed to connect to websocket') ||
      reason.includes('closed without opened') ||
      reason.includes('vite')
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    const message = event.message || '';
    if (
      message.includes('WebSocket') || 
      message.includes('failed to connect to websocket') || 
      message.includes('closed without opened') ||
      message.includes('vite')
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

