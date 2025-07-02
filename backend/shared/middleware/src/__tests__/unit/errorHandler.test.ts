// Jest globals are available automatically

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { errorHandler, AppError } from '../../errorHandler.js';

// Mock dependencies
jest.mock('@uaip/utils');
jest.mock('@uaip/config');

// Mock Express objects
const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  path: '/test',
  method: 'GET',
  headers: { 'user-agent': 'test-agent' },
  ip: '127.0.0.1',
  id: 'req-123',
  user: { id: 'user-123' },
  ...overrides
} as Request);

const createMockResponse = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
} as any);

const createMockNext = (): NextFunction => jest.fn();

describe('AppError', () => {
  it('should create an AppError with default values', () => {
    const error = new AppError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
    expect(error.code).toBeUndefined();
    expect(error.details).toBeUndefined();
  });

  it('should create an AppError with all parameters', () => {
    const details = { field: 'value' };
    const error = new AppError('Custom error', 400, 'CUSTOM_ERROR', details);

    expect(error.message).toBe('Custom error');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('CUSTOM_ERROR');
    expect(error.details).toBe(details);
    expect(error.isOperational).toBe(true);
  });
});

describe('errorHandler', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
    jest.clearAllMocks();
  });

  it('should handle AppError correctly', () => {
    const error = new AppError('Custom app error', 400, 'CUSTOM_ERROR', { field: 'value' });

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'CUSTOM_ERROR',
        message: 'Custom app error',
        details: { field: 'value' }
      },
      meta: {
        timestamp: expect.any(Date),
        requestId: undefined,
        version: undefined
      }
    });
  });

  it('should handle ApiError correctly', () => {
    // Create error with ApiError properties to test the name-based check
    const error = {
      name: 'ApiError',
      message: 'Access denied',
      statusCode: 401,
      code: 'UNAUTHORIZED',
      details: { reason: 'invalid token' }
    };

    errorHandler(error as any, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Access denied',
        details: { reason: 'invalid token' }
      },
      meta: {
        timestamp: expect.any(Date),
        requestId: undefined,
        version: undefined
      }
    });
  });

  it('should handle ZodError correctly', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number'
      },
      {
        code: 'too_small',
        minimum: 5,
        type: 'string',
        inclusive: true,
        path: ['email', 'domain'],
        message: 'String must contain at least 5 character(s)'
      }
    ]);

    errorHandler(zodError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          validationErrors: [
            {
              path: 'name',
              message: 'Expected string, received number',
              code: 'invalid_type'
            },
            {
              path: 'email.domain',
              message: 'String must contain at least 5 character(s)',
              code: 'too_small'
            }
          ]
        }
      },
      meta: {
        timestamp: expect.any(Date),
        requestId: undefined,
        version: undefined
      }
    });
  });

  it('should handle generic Error correctly', () => {
    const error = new Error('Generic error message');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      },
      meta: {
        timestamp: expect.any(Date),
        requestId: undefined,
        version: undefined
      }
    });
  });

  it('should include request ID when available in headers', () => {
    req.headers['x-request-id'] = 'req-header-123';
    const error = new AppError('Test error');

    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          requestId: 'req-header-123'
        })
      })
    );
  });

  it('should handle request without user', () => {
    req.user = undefined;
    const error = new AppError('Test error');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });

  it('should handle AppError without code', () => {
    const error = new AppError('Test error', 400);

    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'APPLICATION_ERROR'
        })
      })
    );
  });
});