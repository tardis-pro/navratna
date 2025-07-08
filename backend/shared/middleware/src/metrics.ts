import { Request, Response, NextFunction } from 'express';
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

// Metrics middleware
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.monitoring.metricsEnabled) {
    return next();
  }

  const startTime = Date.now();
  
  // Increment active connections
  activeConnections.inc();

  // Override res.end to capture metrics
  const originalEnd = res.end.bind(res);
  res.end = function(this: Response, chunk?: any, encoding?: BufferEncoding, cb?: (() => void) | undefined): Response {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route?.path || req.path;
    
    // Record metrics
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode
    });
    
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode
      },
      duration
    );
    
    // Decrement active connections
    activeConnections.dec();
    
    // Call original end and return this for chaining
    if (typeof encoding === 'function') {
      cb = encoding;
      encoding = undefined;
    }
    
    return originalEnd.call(this, chunk, encoding as BufferEncoding, cb);
  } as any; // Type assertion to handle Express's complex overloads

  next();
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
  
  // Extract meaningful parts of stack trace (remove line numbers for grouping)
  const cleanStack = stackTrace
    .split('\n')
    .slice(0, 5) // Take first 5 lines
    .map(line => line.replace(/:\d+:\d+/g, '')) // Remove line:col numbers
    .join('\n');
    
  return crypto.createHash('md5').update(cleanStack).digest('hex').substring(0, 12);
}

function generateMessageHash(message: string): string {
  // Extract error message pattern (remove dynamic values)
  const pattern = message
    .replace(/\d+/g, 'N') // Replace numbers with N
    .replace(/[0-9a-f]{8,}/g, 'ID') // Replace IDs/hashes with ID
    .replace(/\s+/g, ' ') // Normalize whitespace
    .substring(0, 100);
    
  return crypto.createHash('md5').update(pattern).digest('hex').substring(0, 8);
}

// Enhanced error logging function
export function recordError(error: Error, context: ErrorContext): void {
  const errorType = error.constructor.name;
  const stackTraceHash = generateStackTraceHash(error.stack || '');
  const messageHash = generateMessageHash(error.message);
  const errorId = generateErrorId(error, context);
  const severity = context.severity || 'error';

  // Track error occurrence
  errorLogsTotal.inc({
    service: context.service,
    error_type: errorType,
    severity,
    endpoint: context.endpoint || 'unknown',
    user_id: context.userId || 'anonymous'
  });

  // Track error patterns for grouping
  errorPatternFrequency.inc({
    service: context.service,
    stack_trace_hash: stackTraceHash,
    error_type: errorType
  });

  // Store error context for debugging (will be cleaned up automatically by Prometheus)
  errorContextInfo.set({
    service: context.service,
    error_id: errorId,
    error_type: errorType,
    message_hash: messageHash,
    endpoint: context.endpoint || 'unknown'
  }, 1);

  // Log to console for development (in addition to metrics)
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

// Error middleware for Express
export function errorTrackingMiddleware(serviceName: string) {
  return (error: Error, req: Request, res: Response, next: NextFunction): void => {
    const context: ErrorContext = {
      service: serviceName,
      endpoint: req.route?.path || req.path,
      userId: req.user?.id || req.headers['x-user-id'] as string,
      requestId: req.id || req.headers['x-request-id'] as string,
      severity: res.statusCode >= 500 ? 'critical' : 'error',
      metadata: {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    };

    recordError(error, context);
    next(error);
  };
}

// Setup global error handlers
export function setupGlobalErrorHandlers(serviceName: string): void {
  process.on('uncaughtException', (error) => {
    recordUnhandledError(error, 'uncaughtException', serviceName);
    console.error('Uncaught Exception:', error);
    // Don't exit in development, but log it
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

// Metrics endpoint
export const metricsEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end('Error generating metrics');
  }
}; 