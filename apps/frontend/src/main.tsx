import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import DesktopApp from './DesktopApp.tsx';
import './globals.css';

// Initialize Sentry for frontend error tracking & performance
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || '1.0.0',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

const SentryErrorBoundary = Sentry.ErrorBoundary;

createRoot(document.getElementById('root')!).render(
  <SentryErrorBoundary fallback={<div>An error occurred. Please refresh the page.</div>}>
    <DesktopApp />
  </SentryErrorBoundary>,
);
