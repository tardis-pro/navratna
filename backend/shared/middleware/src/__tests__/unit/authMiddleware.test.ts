// Jest globals are available automatically
// Jest globals are available automatically
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, requireAdmin, requireOperator, optionalAuth } from '../../authMiddleware.js';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('@uaip/utils');
jest.mock('@uaip/config');

const mockJwt = jwt as jest.Mocked<typeof jwt>;
(mockJwt.verify as jest.Mock) = jest.fn();

// Mock Express objects
const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  headers: {},
  path: '/test',
  method: 'GET',
  ip: '127.0.0.1',
  ...overrides
} as Request);

const createMockResponse = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis()
} as any);

const createMockNext = (): NextFunction => jest.fn();

describe('authMiddleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('successful authentication', () => {
    it('should authenticate valid JWT token', async () => {
      const mockPayload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      req.headers.authorization = 'Bearer valid-token';
      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      await authMiddleware(req, res, next);

      expect(req.user).toEqual({
        id: 'user123',
        email: 'test@example.com',
        role: 'user',
        sessionId: expect.any(String)
      });
      expect(req.id).toEqual(expect.any(String));
      expect(req.startTime).toEqual(expect.any(Number));
      expect(next).toHaveBeenCalledWith();
    });

    it('should preserve existing sessionId from token', async () => {
      const mockPayload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'user',
        sessionId: 'existing-session-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      req.headers.authorization = 'Bearer valid-token';
      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      await authMiddleware(req, res, next);

      expect(req.user?.sessionId).toBe('existing-session-123');
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('authentication failures', () => {
    it('should reject request without authorization header', async () => {
      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should reject request with invalid authorization header format', async () => {
      req.headers.authorization = 'InvalidFormat token';

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should reject expired token', async () => {
      const expiredPayload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      };

      req.headers.authorization = 'Bearer expired-token';
      (mockJwt.verify as jest.Mock).mockReturnValue(expiredPayload);

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should reject token with invalid payload', async () => {
      const invalidPayload = {
        // Missing required fields
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      req.headers.authorization = 'Bearer invalid-payload-token';
      (mockJwt.verify as jest.Mock).mockReturnValue(invalidPayload);

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle JWT verification errors', async () => {
      req.headers.authorization = 'Bearer invalid-token';
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid signature');
      });

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle malformed JWT tokens', async () => {
      req.headers.authorization = 'Bearer malformed-token';
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('jwt malformed');
      });

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });
  });
});

describe('requireAdmin', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should allow admin users', () => {
    req.user = {
      id: 'admin123',
      email: 'admin@example.com',
      role: 'admin'
    };

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should reject non-admin users', () => {
    req.user = {
      id: 'user123',
      email: 'user@example.com',
      role: 'user'
    };

    requireAdmin(req, res, next);

    // Verify next was called with an error (even if mock properties aren't perfect)
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should reject unauthenticated requests', () => {
    // req.user is undefined

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Object));
  });
});

describe('requireOperator', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should allow admin users', () => {
    req.user = {
      id: 'admin123',
      email: 'admin@example.com',
      role: 'admin'
    };

    requireOperator(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should allow operator users', () => {
    req.user = {
      id: 'operator123',
      email: 'operator@example.com',
      role: 'operator'
    };

    requireOperator(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should reject regular users', () => {
    req.user = {
      id: 'user123',
      email: 'user@example.com',
      role: 'user'
    };

    requireOperator(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should reject unauthenticated requests', () => {
    requireOperator(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Object));
  });
});

describe('optionalAuth', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
  });

  it('should authenticate valid token when present', () => {
    const mockPayload = {
      userId: 'user123',
      email: 'test@example.com',
      role: 'user',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    req.headers.authorization = 'Bearer valid-token';
    (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

    optionalAuth(req, res, next);

    expect(req.user).toEqual({
      id: 'user123',
      email: 'test@example.com',
      role: 'user',
      sessionId: expect.any(String)
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('should continue without authentication when no token provided', () => {
    optionalAuth(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('should continue without authentication when invalid token provided', () => {
    req.headers.authorization = 'Bearer invalid-token';
    (mockJwt.verify as jest.Mock).mockImplementation(() => {
      throw new jwt.JsonWebTokenError('invalid signature');
    });

    optionalAuth(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('should handle unexpected errors gracefully', () => {
    req.headers.authorization = 'Bearer token';
    (mockJwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    optionalAuth(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});