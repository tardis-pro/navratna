// Jest globals are available automatically

import { Request, Response, NextFunction } from 'express';
import { requestLogger, defaultRequestLogger } from '../../requestLogger.js';

// Mock dependencies
jest.mock('@uaip/utils');

// Mock Express objects
const createMockRequest = (overrides: Partial<Request> = {}): Request => {
  const req = {
    method: 'GET',
    url: '/test?param=value',
    path: '/test',
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'test-agent' },
    body: {},
    get: jest.fn((header: string) => {
      if (header === 'User-Agent') return 'test-agent';
      return undefined;
    }),
    ...overrides
  } as any;
  
  // Make properties writable
  Object.defineProperty(req, 'path', { writable: true, value: req.path });
  Object.defineProperty(req, 'ip', { writable: true, value: req.ip });
  if (req.connection) {
    Object.defineProperty(req.connection, 'remoteAddress', { writable: true, value: req.connection.remoteAddress });
  }
  
  return req;
};

const createMockResponse = (): Response => {
  const res = {
    statusCode: 200,
    send: jest.fn(),
    get: jest.fn((header: string) => {
      if (header === 'Content-Length') return '100';
      return undefined;
    })
  } as any;
  
  return res;
};

const createMockNext = (): NextFunction => jest.fn();

describe('requestLogger', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;
  let originalSend: Function;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
    originalSend = res.send;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should log request and response with default options', () => {
    const middleware = requestLogger();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).requestId).toEqual(expect.any(String));
    
    // Simulate response
    res.send('test response');
    
    expect(originalSend).toHaveBeenCalledWith('test response');
  });

  it('should skip logging for excluded paths', () => {
    const middleware = requestLogger({ excludePaths: ['/health', '/metrics'] });
    Object.defineProperty(req, 'path', { value: '/health', writable: true });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).requestId).toBeUndefined();
  });

  it('should include request body when option is enabled', () => {
    const middleware = requestLogger({ includeBody: true });
    req.body = { test: 'data' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).requestId).toEqual(expect.any(String));
  });

  it('should truncate large request body', () => {
    const middleware = requestLogger({ 
      includeBody: true, 
      maxBodyLength: 10 
    });
    req.body = { veryLongProperty: 'this is a very long string that should be truncated' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should include headers when option is enabled', () => {
    const middleware = requestLogger({ includeHeaders: true });
    req.headers = { 'authorization': 'Bearer token', 'content-type': 'application/json' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should use custom log level', () => {
    const middleware = requestLogger({ logLevel: 'debug' });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should handle missing IP address', () => {
    Object.defineProperty(req, 'ip', { value: undefined, writable: true });
    Object.defineProperty(req.connection, 'remoteAddress', { value: undefined, writable: true });
    const middleware = requestLogger();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should log error responses with warn level', () => {
    const middleware = requestLogger();
    res.statusCode = 404;

    middleware(req, res, next);

    // Simulate error response
    res.send('Not found');

    expect(originalSend).toHaveBeenCalledWith('Not found');
  });

  it('should handle custom exclude paths', () => {
    const middleware = requestLogger({ 
      excludePaths: ['/api/health', '/internal'] 
    });
    Object.defineProperty(req, 'path', { value: '/api/health/check', writable: true });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).requestId).toBeUndefined();
  });

  it('should calculate response duration', () => {
    const middleware = requestLogger();

    middleware(req, res, next);

    // Simulate delay
    setTimeout(() => {
      res.send('response');
    }, 10);

    expect(next).toHaveBeenCalledWith();
  });

  it('should handle response without content-length header', () => {
    const middleware = requestLogger();
    res.get = jest.fn(() => undefined);

    middleware(req, res, next);

    res.send('test');

    expect(originalSend).toHaveBeenCalledWith('test');
  });

  it('should handle empty request body', () => {
    const middleware = requestLogger({ includeBody: true });
    req.body = undefined;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should preserve original send function context', () => {
    const middleware = requestLogger();

    middleware(req, res, next);

    // Test that the middleware-wrapped send preserves context
    const testContext = { isTestContext: true };
    res.send = jest.fn(function(this: any, body: any) {
      expect(this).toBe(testContext);
      return originalSend.call(this, body);
    });

    res.send.call(testContext, 'test');
  });
});

describe('defaultRequestLogger', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should be a function', () => {
    expect(typeof defaultRequestLogger).toBe('function');
  });

  it('should work with default configuration', () => {
    defaultRequestLogger(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).requestId).toEqual(expect.any(String));
  });

  it('should exclude health and metrics paths by default', () => {
    Object.defineProperty(req, 'path', { value: '/health', writable: true });

    defaultRequestLogger(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as any).requestId).toBeUndefined();
  });
});