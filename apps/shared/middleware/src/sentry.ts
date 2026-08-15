import * as Sentry from '@sentry/bun';
import { Elysia } from 'elysia';
import { logger } from '@uaip/utils';

export interface SentryConfig {
  dsn?: string;
  environment?: string;
  release?: string;
  serviceName: string;
  sampleRate?: number;
  tracesSampleRate?: number;
  enabled?: boolean;
}

let initialized = false;

function serviceDsnEnvKey(serviceName: string): string {
  return `SENTRY_DSN_${serviceName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`;
}

function resolveSentryDsn(config: SentryConfig): string | undefined {
  return config.dsn || process.env[serviceDsnEnvKey(config.serviceName)] || process.env.SENTRY_DSN;
}

/**
 * Initialize Sentry for backend services (Bun runtime).
 * Call once at service startup, before any request handling.
 */
export function initSentry(config: SentryConfig): void {
  const dsn = resolveSentryDsn(config);
  const enabled = config.enabled ?? (process.env.SENTRY_ENABLED !== 'false');

  if (!enabled || !dsn) {
    logger.info(`Sentry disabled for ${config.serviceName} (enabled=${enabled}, dsn=${!!dsn})`);
    return;
  }

  Sentry.init({
    dsn,
    environment: config.environment || process.env.NODE_ENV || 'development',
    release: config.release || process.env.SERVICE_VERSION || '1.0.0',
    serverName: config.serviceName,
    sampleRate: config.sampleRate ?? 1.0,
    tracesSampleRate: config.tracesSampleRate ?? (process.env.NODE_ENV === 'production' ? 0.2 : 1.0),
    initialScope: {
      tags: {
        service: config.serviceName,
      },
    },
    integrations: [
      Sentry.onUnhandledRejectionIntegration({ mode: 'warn' }),
    ],
    beforeSend(event) {
      // Scrub sensitive data
      if (event.request?.cookies) {
        delete event.request.cookies;
      }
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
        // The platform's own service credential. It authorises provisioning and
        // knowledge ingest, and it was not on this list.
        delete event.request.headers['x-navratna-service-token'];
      }
      /**
       * THE REQUEST BODY IS DROPPED WHOLESALE, and it must stay that way.
       *
       * `event.request.data` is where Sentry puts the parsed body, and the
       * request-data integration includes it by default. This scrub list named
       * cookies and three headers and never touched it, so every service — this
       * runs from BaseService, so that is all of them — could ship request
       * bodies to GlitchTip on any captured error.
       *
       * What was in reach: `POST /auth/login` and `/auth/change-password` carry
       * a plaintext `password`, and `POST /api/v1/knowledge/ingest` now carries
       * a per-project `cloneToken`. An error on any of those paths is exactly
       * when an event gets captured.
       *
       * Deleted rather than filtered by key name. A denylist of secret-ish
       * field names is a list someone has to remember to extend every time a
       * route gains a credential, and the failure is silent and retroactive —
       * the leak is already in the error tracker by the time anyone notices the
       * name was missing. The debugging value of a body does not outweigh that.
       */
      if (event.request?.data !== undefined) {
        delete event.request.data;
      }
      return event;
    },
  });

  initialized = true;
  logger.info(`Sentry initialized for ${config.serviceName}`);
}

/**
 * Capture an exception in Sentry with optional context.
 */
export function captureException(
  error: Error | unknown,
  context?: {
    userId?: string;
    requestId?: string;
    endpoint?: string;
    extra?: Record<string, unknown>;
    tags?: Record<string, string>;
  },
): void {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context?.requestId) {
      scope.setTag('requestId', context.requestId);
    }
    if (context?.endpoint) {
      scope.setTag('endpoint', context.endpoint);
    }
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture a message in Sentry.
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' | 'fatal' = 'info',
): void {
  if (!initialized) return;
  Sentry.captureMessage(message, level);
}

/**
 * Set the current user context for Sentry.
 */
export function setSentryUser(user: { id: string; email?: string; role?: string }): void {
  if (!initialized) return;
  Sentry.setUser(user);
}

/**
 * Elysia plugin that captures errors in Sentry and enriches with request context.
 */
export function sentryErrorPlugin(serviceName: string) {
  return (app: Elysia) => {
    return app.onError(({ error, request, set }) => {
      if (!initialized) return;

      const url = new URL(request.url);
      const statusCode = typeof set.status === 'number' ? set.status : 500;

      // Only capture 5xx errors and unhandled errors to avoid noise
      if (statusCode >= 500) {
        captureException(error, {
          userId: request.headers.get('x-user-id') || undefined,
          requestId: request.headers.get('x-request-id') || undefined,
          endpoint: url.pathname,
          tags: {
            service: serviceName,
            method: request.method,
            statusCode: String(statusCode),
          },
          extra: {
            url: request.url,
            userAgent: request.headers.get('user-agent'),
          },
        });
      }
    });
  };
}

/**
 * Flush Sentry events before shutdown.
 */
export async function flushSentry(timeout: number = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeout);
}

// Re-export Sentry for advanced usage
export { Sentry };
