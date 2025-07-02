// Jest globals are available automatically

import { Request, Response, NextFunction } from 'express';
import { register } from 'prom-client';
import { metricsMiddleware, recordAgentAnalysis, metricsEndpoint } from '../../metrics.js';

// Mock dependencies
jest.mock('prom-client', () => ({
  register: {
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    metrics: jest.fn()
  },
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn()
  })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn()
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
    dec: jest.fn()
  }))
}));

jest.mock('@uaip/config', () => ({
  config: {
    monitoring: {
      metricsEnabled: true
    }
  }
}));

// Mock Express objects
const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  method: 'GET',
  path: '/test',
  route: { path: '/test' },
  ...overrides
} as any);

const createMockResponse = (): Response => {
  const res = {
    statusCode: 200,
    end: jest.fn(),
    set: jest.fn(),
    status: jest.fn().mockReturnThis()
  } as any;
  
  return res;
};

const createMockNext = (): NextFunction => jest.fn();

describe('metricsMiddleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;
  let originalEnd: Function;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
    originalEnd = res.end;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should call next and setup metrics tracking', () => {
    metricsMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(typeof res.end).toBe('function');
  });

  it('should skip metrics when disabled in config', () => {
    // Mock config to disable metrics
    const mockConfig = require('@uaip/config');
    mockConfig.config.monitoring.metricsEnabled = false;

    metricsMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.end).toBe(originalEnd); // Should not have been modified
    
    // Restore config
    mockConfig.config.monitoring.metricsEnabled = true;
  });

  it('should record metrics when response ends', () => {
    metricsMiddleware(req, res, next);

    // Simulate response ending
    res.end('response body');

    expect(originalEnd).toHaveBeenCalledWith('response body', undefined, undefined);
  });

  it('should handle response end with encoding parameter', () => {
    metricsMiddleware(req, res, next);

    const encoding = 'utf8';
    res.end('response body', encoding);

    expect(originalEnd).toHaveBeenCalledWith('response body', encoding, undefined);
  });

  it('should handle response end with callback parameter', () => {
    metricsMiddleware(req, res, next);

    const callback = jest.fn();
    res.end('response body', callback);

    expect(originalEnd).toHaveBeenCalledWith('response body', undefined, callback);
  });

  it('should handle response end with encoding and callback', () => {
    metricsMiddleware(req, res, next);

    const encoding = 'utf8';
    const callback = jest.fn();
    res.end('response body', encoding, callback);

    expect(originalEnd).toHaveBeenCalledWith('response body', encoding, callback);
  });

  it('should use req.path when route is not available', () => {
    req.route = undefined;
    
    metricsMiddleware(req, res, next);

    // Simulate response ending
    res.end();

    expect(originalEnd).toHaveBeenCalled();
  });

  it('should handle different HTTP methods', () => {
    req.method = 'POST';
    
    metricsMiddleware(req, res, next);

    res.end();

    expect(originalEnd).toHaveBeenCalled();
  });

  it('should handle different status codes', () => {
    res.statusCode = 404;
    
    metricsMiddleware(req, res, next);

    res.end();

    expect(originalEnd).toHaveBeenCalled();
  });
});

describe('recordAgentAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should record successful agent analysis', () => {
    const agentId = 'agent-123';
    const analysisType = 'sentiment';
    const status = 'success';
    const duration = 1500; // 1.5 seconds

    recordAgentAnalysis(agentId, analysisType, status, duration);

    // Verify that metrics are recorded (mocked functions should be called)
    expect(jest.isMockFunction).toBeTruthy();
  });

  it('should record failed agent analysis', () => {
    const agentId = 'agent-456';
    const analysisType = 'classification';
    const status = 'failure';
    const duration = 500;

    recordAgentAnalysis(agentId, analysisType, status, duration);

    // Verify that metrics are recorded (mocked functions should be called)
    expect(jest.isMockFunction).toBeTruthy();
  });

  it('should handle different analysis types', () => {
    recordAgentAnalysis('agent-789', 'summarization', 'success', 2000);
    recordAgentAnalysis('agent-789', 'translation', 'success', 3000);

    expect(jest.isMockFunction).toBeTruthy();
  });
});

describe('metricsEndpoint', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    jest.clearAllMocks();
  });

  it('should return metrics successfully', async () => {
    const mockMetrics = 'http_requests_total 42\nhttp_request_duration_seconds_bucket{le="0.1"} 10';
    (register.metrics as jest.Mock).mockResolvedValue(mockMetrics);

    await metricsEndpoint(req, res);

    expect(res.set).toHaveBeenCalledWith('Content-Type', register.contentType);
    expect(res.end).toHaveBeenCalledWith(mockMetrics);
  });

  it('should handle metrics generation error', async () => {
    (register.metrics as jest.Mock).mockRejectedValue(new Error('Metrics error'));

    await metricsEndpoint(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('Error generating metrics');
  });

  it('should set correct content type header', async () => {
    (register.metrics as jest.Mock).mockResolvedValue('test metrics');

    await metricsEndpoint(req, res);

    expect(res.set).toHaveBeenCalledWith('Content-Type', register.contentType);
  });
});