import { Elysia } from 'elysia';
import { register, Counter, Histogram, Gauge } from 'prom-client';
import { config } from '@uaip/config';
import * as crypto from 'crypto';
import type { ErrorContext } from '@uaip/types';
import { captureException as sentryCaptureException } from './sentry.js';

// Helper to get-or-create metrics — prevents duplicate registration on hot-reload / multiple imports
function getOrCreateCounter(opts: ConstructorParameters<typeof Counter>[0]): Counter {
  const existing = register.getSingleMetric(opts.name);
  if (existing instanceof Counter) return existing;
  return new Counter(opts);
}

function getOrCreateHistogram(opts: ConstructorParameters<typeof Histogram>[0]): Histogram {
  const existing = register.getSingleMetric(opts.name);
  if (existing instanceof Histogram) return existing;
  return new Histogram(opts);
}

function getOrCreateGauge(opts: ConstructorParameters<typeof Gauge>[0]): Gauge {
  const existing = register.getSingleMetric(opts.name);
  if (existing instanceof Gauge) return existing;
  return new Gauge(opts);
}

// Create metrics
const httpRequestsTotal = getOrCreateCounter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = getOrCreateHistogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

const activeConnections = getOrCreateGauge({
  name: 'active_connections',
  help: 'Number of active connections',
});

const agentAnalysisTotal = getOrCreateCounter({
  name: 'agent_analysis_total',
  help: 'Total number of agent analyses performed',
  labelNames: ['agent_id', 'analysis_type', 'status'],
});

const agentAnalysisDuration = getOrCreateHistogram({
  name: 'agent_analysis_duration_seconds',
  help: 'Duration of agent analyses in seconds',
  labelNames: ['agent_id', 'analysis_type'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
});

// Error tracking metrics
const errorLogsTotal = getOrCreateCounter({
  name: 'error_logs_total',
  help: 'Total error logs by type and severity',
  labelNames: ['service', 'error_type', 'severity', 'endpoint', 'user_id'],
});

const errorContextInfo = getOrCreateGauge({
  name: 'error_context_info',
  help: 'Error context information with metadata',
  labelNames: ['service', 'error_id', 'error_type', 'message_hash', 'endpoint'],
});

const errorPatternFrequency = getOrCreateCounter({
  name: 'error_pattern_frequency_total',
  help: 'Frequency of error patterns by stack trace hash',
  labelNames: ['service', 'stack_trace_hash', 'error_type'],
});

const unhandledErrorsTotal = getOrCreateCounter({
  name: 'unhandled_errors_total',
  help: 'Total unhandled errors and exceptions',
  labelNames: ['service', 'error_type', 'source'],
});

const llmRequestsTotal = getOrCreateCounter({
  name: 'llm_requests_total',
  help: 'Total number of LLM requests',
  labelNames: ['agent_id', 'provider', 'model', 'request_type', 'status'],
});

const llmTokensUsedTotal = getOrCreateCounter({
  name: 'llm_tokens_used_total',
  help: 'Total tokens used by LLM requests',
  labelNames: ['agent_id', 'provider', 'model', 'request_type'],
});

const llmRequestLatency = getOrCreateHistogram({
  name: 'llm_request_latency_seconds',
  help: 'LLM request latency in seconds',
  labelNames: ['agent_id', 'provider', 'model', 'request_type', 'status'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10, 20, 60],
});

// ---------------------------------------------------------------------------
// Workflow Composition Metrics
// ---------------------------------------------------------------------------

const workflowExecutionsTotal = getOrCreateCounter({
  name: 'workflow_executions_total',
  help: 'Total workflow executions by workflow and status',
  labelNames: ['workflow_name', 'status'],
});

const workflowStepDuration = getOrCreateHistogram({
  name: 'workflow_step_duration_seconds',
  help: 'Duration of individual workflow steps',
  labelNames: ['workflow_name', 'step_type', 'mcp_server', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

const workflowQueueDepth = getOrCreateGauge({
  name: 'workflow_queue_depth',
  help: 'Number of workflows waiting to execute',
});

const mcpCallsTotal = getOrCreateCounter({
  name: 'mcp_calls_total',
  help: 'Total MCP server calls by server, tool, and status',
  labelNames: ['server', 'tool', 'status_code'],
});

const circuitBreakerState = getOrCreateGauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['server'],
});

// Prometheus label values must be BOUNDED. A raw pathname is not: every UUID,
// slug or numeric id mints a brand-new time series, so a handful of endpoints
// can produce millions of series and eventually take Prometheus down. Collapse
// the variable segments back into the route template they came from, so
// /api/v1/agents/2b96e509-.../chat becomes /api/v1/agents/:id/chat.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]{16,}$/i;
const NUM_RE = /^\d+$/;

export function normalizeRoute(pathname: string): string {
  const parts = pathname.split('/');
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    if (UUID_RE.test(seg) || HEX_RE.test(seg) || NUM_RE.test(seg)) {
      parts[i] = ':id';
    }
  }
  // A pathological caller can still walk deep paths; cap the depth so the
  // label set stays finite no matter what arrives.
  if (parts.length > 12) return parts.slice(0, 12).join('/') + '/*';
  return parts.join('/') || '/';
}

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
      const route = normalizeRoute(url.pathname);
      const statusCode = typeof set.status === 'number' ? set.status : 200;

      httpRequestsTotal.inc({
        method: request.method,
        route,
        status_code: statusCode,
      });

      activeConnections.dec();
    })
    .derive(({ request: _request }) => {
      const startTime = Date.now();
      return {
        metricsStartTime: startTime,
      };
    })
    .onAfterResponse(({ request, set, metricsStartTime }) => {
      if (metricsStartTime) {
        const duration = (Date.now() - metricsStartTime) / 1000;
        const url = new URL(request.url);
        const route = normalizeRoute(url.pathname);
        const statusCode = typeof set.status === 'number' ? set.status : 200;

        httpRequestDuration.observe(
          {
            method: request.method,
            route,
            status_code: statusCode,
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
    status,
  });

  if (status === 'success') {
    agentAnalysisDuration.observe(
      {
        agent_id: agentId,
        analysis_type: analysisType,
      },
      duration / 1000
    );
  }
}

export function recordLLMRequest(options: {
  agentId?: string;
  provider?: string;
  model?: string;
  requestType: 'user' | 'global' | 'agent' | 'artifact' | 'unknown';
  status: 'success' | 'failure';
  durationMs: number;
  tokensUsed?: number;
}): void {
  const agentId = options.agentId || 'unknown';
  const provider = options.provider || 'unknown';
  const model = options.model || 'unknown';

  llmRequestsTotal.inc({
    agent_id: agentId,
    provider,
    model,
    request_type: options.requestType,
    status: options.status,
  });

  llmRequestLatency.observe(
    {
      agent_id: agentId,
      provider,
      model,
      request_type: options.requestType,
      status: options.status,
    },
    options.durationMs / 1000
  );

  if (options.tokensUsed !== undefined) {
    llmTokensUsedTotal.inc(
      {
        agent_id: agentId,
        provider,
        model,
        request_type: options.requestType,
      },
      options.tokensUsed
    );
  }
}

// Error logging and tracking interface - ErrorContext is imported from @uaip/types

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
    .map((line) => line.replace(/:\d+:\d+/g, ''))
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
export function recordError(error: Error | unknown, context: ErrorContext): void {
  const isError = error instanceof Error;
  const errorType = isError ? error.constructor.name : 'UnknownError';
  const stack = isError ? (error.stack ?? '') : '';
  const message = isError ? error.message : String(error ?? 'Unknown error');

  const stackTraceHash = generateStackTraceHash(stack);
  const messageHash = generateMessageHash(message);
  const safeError: Error = isError ? error : Object.assign(new Error(message), { name: errorType });
  const errorId = generateErrorId(safeError, context);
  const severity = context.severity || 'error';

  errorLogsTotal.inc({
    service: context.service,
    error_type: errorType,
    severity,
    endpoint: context.endpoint || 'unknown',
    user_id: context.userId || 'anonymous',
  });

  errorPatternFrequency.inc({
    service: context.service,
    stack_trace_hash: stackTraceHash,
    error_type: errorType,
  });

  errorContextInfo.set(
    {
      service: context.service,
      error_id: errorId,
      error_type: errorType,
      message_hash: messageHash,
      endpoint: context.endpoint || 'unknown',
    },
    1
  );

  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context.service}] ${errorType}: ${message}`, {
      errorId,
      stackTraceHash,
      endpoint: context.endpoint,
      metadata: context.metadata,
    });
  }
}

// Track unhandled errors
export function recordUnhandledError(
  error: Error,
  source: 'uncaughtException' | 'unhandledRejection',
  serviceName: string
): void {
  unhandledErrorsTotal.inc({
    service: serviceName,
    error_type: error.constructor.name,
    source,
  });

  recordError(error, {
    service: serviceName,
    severity: 'critical',
    endpoint: 'unhandled',
    metadata: { source },
  });

  // Forward to Sentry for unhandled errors
  sentryCaptureException(error, {
    tags: { service: serviceName, source },
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
        severity: typeof set.status === 'number' && set.status >= 500 ? 'critical' : 'error',
        metadata: {
          method: request.method,
          url: request.url,
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      };

      recordError(error, context);
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

// ---------------------------------------------------------------------------
// Workflow & MCP metric helpers
// ---------------------------------------------------------------------------

export function recordWorkflowExecution(
  workflowName: string,
  status: 'completed' | 'failed' | 'cancelled',
): void {
  workflowExecutionsTotal.inc({ workflow_name: workflowName, status });
}

export function recordWorkflowStep(
  workflowName: string,
  stepType: string,
  mcpServer: string,
  status: string,
  durationMs: number,
): void {
  workflowStepDuration.observe(
    {
      workflow_name: workflowName,
      step_type: stepType,
      mcp_server: mcpServer,
      status,
    },
    durationMs / 1000,
  );
}

export function recordMCPCall(
  server: string,
  tool: string,
  statusCode: number,
): void {
  mcpCallsTotal.inc({ server, tool, status_code: statusCode });
}

export function setWorkflowQueueDepth(depth: number): void {
  workflowQueueDepth.set(depth);
}

const CIRCUIT_STATE_VALUE: Record<string, number> = {
  closed: 0,
  'half-open': 1,
  open: 2,
};

export function setCircuitBreakerState(
  server: string,
  state: 'closed' | 'half-open' | 'open',
): void {
  circuitBreakerState.set({ server }, CIRCUIT_STATE_VALUE[state] ?? 0);
}

// Metrics endpoint handler for Elysia
export async function metricsEndpoint(): Promise<Response> {
  try {
    const metrics = await register.metrics();
    return new Response(metrics, {
      headers: { 'Content-Type': register.contentType },
    });
  } catch {
    return new Response('Error generating metrics', { status: 500 });
  }
}
