// Jest globals are available automatically

import { Request, Response, NextFunction } from 'express';
import { createRateLimiter, rateLimiter } from '../../rateLimiter.js';

// Mock dependencies
jest.mock('@uaip/config');
jest.mock('@uaip/utils');

// Mock Express objects
const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  ip: '127.0.0.1',
  path: '/test',
  url: '/test',
  method: 'GET',
  headers: { 'user-agent': 'test-agent' },
  ...overrides
} as Request);

const createMockResponse = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
} as any);

const createMockNext = (): NextFunction => jest.fn();

describe('createRateLimiter', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
    jest.clearAllMocks();
  });

  it('should create a rate limiter middleware', () => {
    const limiter = createRateLimiter();
    
    expect(typeof limiter).toBe('function');
  });

  it('should allow requests through (mock implementation)', () => {
    const limiter = createRateLimiter();
    
    limiter(req, res, next);
    
    expect(next).toHaveBeenCalledWith();
  });

  it('should create rate limiter with custom options', () => {
    const customOptions = {
      windowMs: 60000,
      max: 50,
      keyGenerator: (req: Request) => req.ip + req.headers['user-agent']
    };
    
    const limiter = createRateLimiter(customOptions);
    
    expect(typeof limiter).toBe('function');
  });

  it('should handle custom message option', () => {
    const customMessage = {
      error: 'Custom rate limit message'
    };
    
    const limiter = createRateLimiter({
      message: customMessage
    });
    
    expect(typeof limiter).toBe('function');
  });

  it('should handle custom handler option', () => {
    const customHandler = jest.fn();
    
    const limiter = createRateLimiter({
      handler: customHandler
    });
    
    expect(typeof limiter).toBe('function');
  });

  it('should handle custom skip function', () => {
    const customSkip = jest.fn(() => true);
    
    const limiter = createRateLimiter({
      skip: customSkip
    });
    
    expect(typeof limiter).toBe('function');
  });
});

describe('rateLimiter', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
    jest.clearAllMocks();
  });

  it('should be a function', () => {
    expect(typeof rateLimiter).toBe('function');
  });

  it('should allow requests through (default mock implementation)', () => {
    rateLimiter(req, res, next);
    
    expect(next).toHaveBeenCalledWith();
  });
});

describe('rate limiter behavior', () => {
  it('should handle missing IP address', () => {
    const req = createMockRequest({ ip: undefined });
    const res = createMockResponse();
    const next = createMockNext();
    
    const limiter = createRateLimiter();
    limiter(req, res, next);
    
    expect(next).toHaveBeenCalledWith();
  });

  it('should handle health check path', () => {
    const req = createMockRequest({ path: '/health' });
    const res = createMockResponse();
    const next = createMockNext();
    
    const limiter = createRateLimiter();
    limiter(req, res, next);
    
    expect(next).toHaveBeenCalledWith();
  });
});