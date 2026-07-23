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
