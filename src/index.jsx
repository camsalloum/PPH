import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Theme effects CSS
import './styles/themes/base-variables.css';
import './styles/effects/animations.css';
import './styles/effects/glassmorphism.css';
import './styles/effects/neumorphism.css';
import './styles/effects/hover-effects.css';

import App from './App';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).catch(() => {});
  }

  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        caches.delete(key);
      });
    }).catch(() => {});
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
