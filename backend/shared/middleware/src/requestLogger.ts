import { Elysia } from 'elysia';
import { logger } from '@uaip/utils';

export interface RequestLoggerOptions {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  includeBody?: boolean;
  includeHeaders?: boolean;
  excludePaths?: string[];
  maxBodyLength?: number;
}

const defaultOptions: RequestLoggerOptions = {
  logLevel: 'info',
  includeBody: false,
  includeHeaders: false,
  excludePaths: ['/health', '/metrics'],
  maxBodyLength: 1000
};

// Elysia request logger plugin
export function requestLogger(options: RequestLoggerOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  return (app: Elysia) => {
    return app
      .derive(({ request }) => {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        const url = new URL(request.url);

        // Skip logging for excluded paths
        const shouldLog = !opts.excludePaths?.some(path => url.pathname.startsWith(path));

        if (shouldLog) {
          const forwarded = request.headers.get('x-forwarded-for');
          const ip = forwarded?.split(',')[0]?.trim() || 'unknown';

          const requestData: Record<string, unknown> = {
            requestId,
            method: request.method,
            url: request.url,
            path: url.pathname,
            userAgent: request.headers.get('user-agent'),
            ip,
            timestamp: new Date().toISOString()
          };

          if (opts.includeHeaders) {
            const headers: Record<string, string> = {};
            request.headers.forEach((value, key) => {
              headers[key] = value;
            });
            requestData.headers = headers;
          }

          logger[opts.logLevel || 'info']('HTTP Request', requestData);
        }

        return { requestId, startTime, shouldLog };
      })
      .onAfterResponse((ctx) => {
        const { request, set, requestId, startTime, shouldLog } = ctx as {
          request: Request;
          set: { status?: number | string; headers?: Record<string, unknown> };
          requestId: string;
          startTime: number;
          shouldLog: boolean;
        };

        if (!shouldLog) {
          return;
        }

        const duration = Date.now() - startTime;
        const statusCode = typeof set.status === 'number' ? set.status : 200;

        const responseData: Record<string, unknown> = {
          requestId,
          method: request.method,
          url: request.url,
          statusCode,
          duration,
          contentLength: set.headers?.['content-length'] || 0
        };

        if (statusCode >= 400) {
          logger.warn('HTTP Response Error', responseData);
        } else {
          logger[opts.logLevel || 'info']('HTTP Response', responseData);
        }
      });
  };
}

// Default export for convenience
export const defaultRequestLogger = requestLogger();
