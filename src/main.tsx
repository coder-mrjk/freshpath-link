import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n/config';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initPerformance } from './lib/performance';
import { initGlobalCrashHandlers } from './lib/crashReporting';

// Initialize zero-cost Firebase Performance Monitoring & Crash Telemetry
initPerformance();
initGlobalCrashHandlers();

// Ensure service workers immediately update to latest deployed bundles
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.update();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

