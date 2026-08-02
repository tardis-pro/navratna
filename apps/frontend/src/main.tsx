import { createRoot } from 'react-dom/client';
import DesktopApp from './DesktopApp.tsx';
import './globals.css';
import { initSentry, SentryErrorBoundary } from '@/utils/sentry';
import { registerStaleChunkRecovery } from '@/utils/stale_chunk_recovery';

initSentry();
registerStaleChunkRecovery();

createRoot(document.getElementById('root')!).render(
  <SentryErrorBoundary fallback={<div>An error occurred. Please refresh the page.</div>}>
    <DesktopApp />
  </SentryErrorBoundary>,
);
