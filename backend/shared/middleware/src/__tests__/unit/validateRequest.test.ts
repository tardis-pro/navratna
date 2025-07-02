// Jest globals are available automatically

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { 
  validateRequest, 
  validateID, 
  validateUUID, 
  validatePagination,
  validateJSON,
  requireContentType,
  validateRequestSize,
  createCustomValidator
} from '../../validateRequest.js';

// Mock dependencies
jest.mock('@uaip/utils');

// Mock Express objects
const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  body: {},
  query: {},
  params: {},
  headers: {},
  method: 'GET',
  url: '/test',
  ...overrides
} as Request);

const createMockResponse = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
} as any);

const createMockNext = (): NextFunction => jest.fn();

describe('validateRequest', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
    jest.clearAllMocks();
  });

  describe('body validation', () => {
    it('should validate request body successfully', () => {
      const bodySchema = z.object({
        name: z.string(),
        age: z.number()
      });

      req.body = { name: 'John', age: 30 };
      const middleware = validateRequest({ body: bodySchema });

      middleware(req, res, next);

      expect(req.body).toEqual({ name: 'John', age: 30 });
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject invalid request body', () => {
      const bodySchema = z.object({
        name: z.string(),
        age: z.number()
      });

      req.body = { name: 'John', age: 'invalid' };
      const middleware = validateRequest({ body: bodySchema });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'age',
            message: expect.any(String),
            code: expect.any(String)
          })
        ])
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('query validation', () => {
    it('should validate query parameters successfully', () => {
      const querySchema = z.object({
        search: z.string(),
        limit: z.coerce.number()
      });

      req.query = { search: 'test', limit: '10' };
      const middleware = validateRequest({ query: querySchema });

      middleware(req, res, next);

      expect((req as any).validatedQuery).toEqual({ search: 'test', limit: 10 });
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject invalid query parameters', () => {
      const querySchema = z.object({
        limit: z.coerce.number().positive()
      });

      req.query = { limit: '-1' };
      const middleware = validateRequest({ query: querySchema });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('params validation', () => {
    it('should validate route parameters successfully', () => {
      const paramsSchema = z.object({
        id: z.string()
      });

      req.params = { id: '123' };
      const middleware = validateRequest({ params: paramsSchema });

      middleware(req, res, next);

      expect(req.params).toEqual({ id: '123' });
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject invalid route parameters', () => {
      const paramsSchema = z.object({
        id: z.string().uuid()
      });

      req.params = { id: 'invalid-uuid' };
      const middleware = validateRequest({ params: paramsSchema });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('headers validation', () => {
    it('should validate headers successfully', () => {
      const headersSchema = z.object({
        'x-api-key': z.string()
      });

      req.headers = { 'x-api-key': 'test-key' };
      const middleware = validateRequest({ headers: headersSchema });

      middleware(req, res, next);

      expect(req.headers).toEqual({ 'x-api-key': 'test-key' });
      expect(next).toHaveBeenCalledWith();
    });
  });

  it('should handle unexpected validation errors', () => {
    const bodySchema = z.object({
      name: z.string()
    });

    // Mock schema.parse to throw a non-ZodError
    const originalParse = bodySchema.parse;
    bodySchema.parse = jest.fn(() => {
      throw new Error('Unexpected error');
    });

    req.body = { name: 'John' };
    const middleware = validateRequest({ body: bodySchema });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error during validation'
    });

    // Restore original method
    bodySchema.parse = originalParse;
  });
});

describe('validateID', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should validate numeric ID successfully', () => {
    req.params = { id: '123' };
    const middleware = validateID();

    middleware(req, res, next);

    expect(req.params.id).toBe(123);
    expect(next).toHaveBeenCalledWith();
  });

  it('should reject invalid ID', () => {
    req.params = { id: 'invalid' };
    const middleware = validateID();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should validate custom parameter name', () => {
    req.params = { userId: '456' };
    const middleware = validateID('userId');

    middleware(req, res, next);

    expect(req.params.userId).toBe(456);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('validateUUID', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should validate UUID successfully', () => {
    const validUUID = '123e4567-e89b-12d3-a456-426614174000';
    req.params = { id: validUUID };
    const middleware = validateUUID();

    middleware(req, res, next);

    expect(req.params.id).toBe(validUUID);
    expect(next).toHaveBeenCalledWith();
  });

  it('should reject invalid UUID', () => {
    req.params = { id: 'invalid-uuid' };
    const middleware = validateUUID();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('validatePagination', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should validate pagination parameters with defaults', () => {
    req.query = {};

    validatePagination(req, res, next);

    expect((req as any).validatedQuery).toEqual({
      page: 1,
      limit: 10,
      sortOrder: 'desc'
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('should validate custom pagination parameters', () => {
    req.query = {
      page: '2',
      limit: '20',
      sortBy: 'name',
      sortOrder: 'asc'
    };

    validatePagination(req, res, next);

    expect((req as any).validatedQuery).toEqual({
      page: 2,
      limit: 20,
      sortBy: 'name',
      sortOrder: 'asc'
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('should reject invalid pagination parameters', () => {
    req.query = { limit: '200' }; // Exceeds max of 100

    validatePagination(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('validateJSON', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should allow GET requests without content-type check', () => {
    req.method = 'GET';

    validateJSON(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should allow POST requests with JSON content-type', () => {
    req.method = 'POST';
    req.headers['content-type'] = 'application/json';

    validateJSON(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should reject POST requests without JSON content-type', () => {
    req.method = 'POST';
    req.headers['content-type'] = 'text/plain';

    validateJSON(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Content-Type must be application/json'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject POST requests without content-type header', () => {
    req.method = 'POST';

    validateJSON(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireContentType', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should allow requests with correct content-type', () => {
    req.headers['content-type'] = 'application/xml';
    const middleware = requireContentType('application/xml');

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should reject requests with incorrect content-type', () => {
    req.headers['content-type'] = 'application/json';
    const middleware = requireContentType('application/xml');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Content-Type must be application/xml'
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('validateRequestSize', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should allow requests within size limit', () => {
    req.headers['content-length'] = '1000';
    const middleware = validateRequestSize(2000);

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should reject requests exceeding size limit', () => {
    req.headers['content-length'] = '3000';
    const middleware = validateRequestSize(2000);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Request too large. Maximum size: 2000 bytes'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow requests without content-length header', () => {
    const middleware = validateRequestSize(2000);

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe('createCustomValidator', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should create a custom validator with given schema', () => {
    const customSchema = z.object({
      email: z.string().email(),
      age: z.number().min(18)
    });

    req.body = { email: 'test@example.com', age: 25 };
    const middleware = createCustomValidator(customSchema);

    middleware(req, res, next);

    expect(req.body).toEqual({ email: 'test@example.com', age: 25 });
    expect(next).toHaveBeenCalledWith();
  });

  it('should reject invalid data with custom validator', () => {
    const customSchema = z.object({
      email: z.string().email()
    });

    req.body = { email: 'invalid-email' };
    const middleware = createCustomValidator(customSchema);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});