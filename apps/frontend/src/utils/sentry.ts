import * as Sentry from '@sentry/react';

type SentryExtra = Record<string, unknown>;

const isSentryEnabled = (): boolean =>
  Boolean(import.meta.env.VITE_SENTRY_DSN) &&
  (import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLE === 'true');

export const initSentry = (): void => {
  if (!isSentryEnabled()) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || '1.0.0',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
};

export const captureFrontendException = (
  error: unknown,
  tags?: Record<string, string>,
  extra?: SentryExtra,
): void => {
  if (!isSentryEnabled()) return;

  Sentry.withScope((scope) => {
    if (tags) {
      for (const [key, value] of Object.entries(tags)) {
        scope.setTag(key, value);
      }
    }
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
};

export const SentryErrorBoundary = Sentry.ErrorBoundary;
