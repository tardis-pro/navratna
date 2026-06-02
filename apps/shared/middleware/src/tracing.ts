import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
  trace,
  context,
  SpanStatusCode,
  type Span,
  type SpanOptions,
  type Context,
} from '@opentelemetry/api';

let sdk: NodeSDK | null = null;

export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  otlpEndpoint?: string;
  enabled?: boolean;
}

/**
 * Initialize OpenTelemetry SDK. Must be called before any other imports
 * that need instrumentation (ideally at the very top of the service entry point).
 */
export function initTracing(config: TracingConfig): void {
  const enabled = config.enabled ?? (process.env.OTEL_ENABLED !== 'false');
  if (!enabled) return;

  const endpoint = config.otlpEndpoint
    || process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    || 'http://localhost:4318';

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion || process.env.SERVICE_VERSION || '1.0.0',
    'deployment.environment': config.environment || process.env.NODE_ENV || 'development',
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
  });

  sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30_000,
    }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => {
          const url = request.url || '';
          return /\/health|\/metrics/.test(url);
        },
      }),
    ],
  });

  sdk.start();
}

/**
 * Gracefully shutdown the OTel SDK (call during service shutdown).
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

// ---------------------------------------------------------------------------
// Span helpers for manual instrumentation
// ---------------------------------------------------------------------------

const TRACER_NAME = 'uaip-manual';

function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Create a span around an async operation. Automatically records errors
 * and sets span status.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions & { parentContext?: Context },
): Promise<T> {
  const tracer = getTracer();
  const ctx = options?.parentContext || context.active();

  return tracer.startActiveSpan(name, options || {}, ctx, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap a database query with a span.
 */
export async function traceDbQuery<T>(
  operation: string,
  table: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan(`db.${operation}`, async (span) => {
    span.setAttribute('db.system', 'postgresql');
    span.setAttribute('db.operation', operation);
    span.setAttribute('db.sql.table', table);
    return fn(span);
  });
}

/**
 * Wrap an event bus publish/subscribe with a span.
 */
export async function traceEventBus<T>(
  operation: 'publish' | 'subscribe' | 'rpc',
  eventType: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan(`eventbus.${operation}`, async (span) => {
    span.setAttribute('messaging.system', 'bullmq');
    span.setAttribute('messaging.operation', operation);
    span.setAttribute('messaging.destination', eventType);
    return fn(span);
  });
}

/**
 * Wrap an LLM call with a span.
 */
export async function traceLLMCall<T>(
  provider: string,
  model: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan(`llm.${provider}`, async (span) => {
    span.setAttribute('llm.provider', provider);
    span.setAttribute('llm.model', model);
    span.setAttribute('llm.system', 'openai-compatible');
    return fn(span);
  });
}

/**
 * Wrap an external HTTP call with a span.
 */
export async function traceExternalCall<T>(
  service: string,
  method: string,
  url: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan(`external.${service}`, async (span) => {
    span.setAttribute('http.method', method);
    span.setAttribute('http.url', url);
    span.setAttribute('peer.service', service);
    return fn(span);
  });
}

// Re-export OTel API for advanced usage
export { trace, context, SpanStatusCode } from '@opentelemetry/api';
export type { Span } from '@opentelemetry/api';
