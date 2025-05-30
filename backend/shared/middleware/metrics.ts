import { Request, Response, NextFunction } from 'express';
import { register, Counter, Histogram, Gauge } from 'prom-client';
import { config } from '@uaip/config';

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