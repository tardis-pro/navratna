import { Elysia } from 'elysia';
import { register, Counter, Histogram, Gauge } from 'prom-client';
import { config } from '@uaip/config';
import * as crypto from 'crypto';

// Create metrics
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

const agentAnalysisTotal = new Counter({
  name: 'agent_analysis_total',
  help: 'Total number of agent analyses performed',
  labelNames: ['agent_id', 'analysis_type', 'status']
});

const agentAnalysisDuration = new Histogram({
  name: 'agent_analysis_duration_seconds',
  help: 'Duration of agent analyses in seconds',
  labelNames: ['agent_id', 'analysis_type'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60]
});

// Error tracking metrics
const errorLogsTotal = new Counter({
  name: 'error_logs_total',
  help: 'Total error logs by type and severity',
  labelNames: ['service', 'error_type', 'severity', 'endpoint', 'user_id']
});

const errorContextInfo = new Gauge({
  name: 'error_context_info',
  help: 'Error context information with metadata',
  labelNames: ['service', 'error_id', 'error_type', 'message_hash', 'endpoint']
});

const errorPatternFrequency = new Counter({
  name: 'error_pattern_frequency_total',
  help: 'Frequency of error patterns by stack trace hash',
  labelNames: ['service', 'stack_trace_hash', 'error_type']
});

const unhandledErrorsTotal = new Counter({
  name: 'unhandled_errors_total',
  help: 'Total unhandled errors and exceptions',
  labelNames: ['service', 'error_type', 'source']
});

// Elysia metrics middleware plugin
export function metricsMiddleware(app: Elysia): Elysia {
  if (!config.monitoring.metricsEnabled) {
    return app;
  }

  return app
    .onRequest(() => {
      activeConnections.inc();
    })
    .onAfterResponse(({ request, set }) => {
      const url = new URL(request.url);
      const route = url.pathname;
      const statusCode = (set.status as number) || 200;

      httpRequestsTotal.inc({
        method: request.method,
        route,
        status_code: statusCode
      });

      activeConnections.dec();
    })
    .derive(({ request }) => {
      const startTime = Date.now();
      return {
        metricsStartTime: startTime
      };
    })
    .onAfterResponse(({ request, set, metricsStartTime }) => {
      if (metricsStartTime) {
        const duration = (Date.now() - metricsStartTime) / 1000;
        const url = new URL(request.url);
        const route = url.pathname;
        const statusCode = (set.status as number) || 200;

        httpRequestDuration.observe(
          {
            method: request.method,
            route,
            status_code: statusCode
          },
          duration
        );
      }
    });
}

// Business metrics helpers
export function recordAgentAnalysis(
  agentId: string,
  analysisType: string,
  status: 'success' | 'failure',
  duration: number
): void {
  agentAnalysisTotal.inc({
    agent_id: agentId,
    analysis_type: analysisType,
    status
  });

  if (status === 'success') {
    agentAnalysisDuration.observe(
      {
        agent_id: agentId,
        analysis_type: analysisType
      },
      duration / 1000
    );
  }
}

// Error logging and tracking interface
export interface ErrorContext {
  service: string;
  endpoint?: string;
  userId?: string;
  requestId?: string;
  severity?: 'error' | 'critical' | 'warning';
  metadata?: Record<string, any>;
}

// Utility functions for error tracking
function generateErrorId(error: Error, context: ErrorContext): string {
  const source = `${context.service}:${context.endpoint || 'unknown'}:${error.name}`;
  return crypto.createHash('md5').update(source).digest('hex').substring(0, 8);
}

function generateStackTraceHash(stackTrace: string): string {
  if (!stackTrace) return 'no-stack';

  const cleanStack = stackTrace
    .split('\n')
    .slice(0, 5)
    .map(line => line.replace(/:\d+:\d+/g, ''))
    .join('\n');

  return crypto.createHash('md5').update(cleanStack).digest('hex').substring(0, 12);
}

function generateMessageHash(message: string | undefined): string {
  const safeMessage = message || 'unknown error';

  const pattern = safeMessage
    .replace(/\d+/g, 'N')
    .replace(/[0-9a-f]{8,}/g, 'ID')
    .replace(/\s+/g, ' ')
    .substring(0, 100);

  return crypto.createHash('md5').update(pattern).digest('hex').substring(0, 8);
}

// Enhanced error logging function
export function recordError(error: Error | any, context: ErrorContext): void {
  const safeError = error || { message: 'Unknown error', constructor: { name: 'UnknownError' }, stack: '' };

  const errorType = safeError.constructor?.name || 'UnknownError';
  const stackTraceHash = generateStackTraceHash(safeError.stack || '');
  const messageHash = generateMessageHash(safeError.message);
  const errorId = generateErrorId(safeError, context);
  const severity = context.severity || 'error';

  errorLogsTotal.inc({
    service: context.service,
    error_type: errorType,
    severity,
    endpoint: context.endpoint || 'unknown',
    user_id: context.userId || 'anonymous'
  });

  errorPatternFrequency.inc({
    service: context.service,
    stack_trace_hash: stackTraceHash,
    error_type: errorType
  });

  errorContextInfo.set({
    service: context.service,
    error_id: errorId,
    error_type: errorType,
    message_hash: messageHash,
    endpoint: context.endpoint || 'unknown'
  }, 1);

  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context.service}] ${errorType}: ${error.message}`, {
      errorId,
      stackTraceHash,
      endpoint: context.endpoint,
      metadata: context.metadata
    });
  }
}

// Track unhandled errors
export function recordUnhandledError(error: Error, source: 'uncaughtException' | 'unhandledRejection', serviceName: string): void {
  unhandledErrorsTotal.inc({
    service: serviceName,
    error_type: error.constructor.name,
    source
  });

  recordError(error, {
    service: serviceName,
    severity: 'critical',
    endpoint: 'unhandled',
    metadata: { source }
  });
}

// Elysia error tracking middleware
export function errorTrackingMiddleware(serviceName: string) {
  return (app: Elysia) => {
    return app.onError(({ error, request, set }) => {
      const url = new URL(request.url);
      const context: ErrorContext = {
        service: serviceName,
        endpoint: url.pathname,
        userId: request.headers.get('x-user-id') || undefined,
        requestId: request.headers.get('x-request-id') || undefined,
        severity: ((set.status as number) >= 500) ? 'critical' : 'error',
        metadata: {
          method: request.method,
          url: request.url,
          userAgent: request.headers.get('user-agent') || 'unknown'
        }
      };

      recordError(error as Error, context);
    });
  };
}

// Setup global error handlers
export function setupGlobalErrorHandlers(serviceName: string): void {
  process.on('uncaughtException', (error) => {
    recordUnhandledError(error, 'uncaughtException', serviceName);
    console.error('Uncaught Exception:', error);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    recordUnhandledError(error, 'unhandledRejection', serviceName);
    console.error('Unhandled Rejection:', reason);
  });
}

// Metrics endpoint handler for Elysia
export async function metricsEndpoint(): Promise<Response> {
  try {
    const metrics = await register.metrics();
    return new Response(metrics, {
      headers: { 'Content-Type': register.contentType }
    });
  } catch (error) {
    return new Response('Error generating metrics', { status: 500 });
  }
}
