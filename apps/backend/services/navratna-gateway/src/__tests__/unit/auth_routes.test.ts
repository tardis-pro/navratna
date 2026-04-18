import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, msg: string, public code?: string) { super(msg); }
  },
}));

vi.mock('@uaip/config', () => ({
  config: {
    jwt: {
      secret: 'test-secret-at-least-32-chars-long',
      refreshSecret: 'test-refresh-secret-at-least-32-chars',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
    },
    security: { saltRounds: 10 },
  },
}));

vi.mock('@uaip/middleware', () => {
  const mockUser = { id: 'user-uuid-1234', email: 'test@example.com', role: 'user' };
  const passthrough = (app: Elysia) => app.derive(() => ({ user: mockUser }));
  return {
    withRequiredAuth: passthrough,
    withOptionalAuth: passthrough,
    attachAuth: passthrough,
    requireAuth: (app: Elysia) => app,
    validateJWTToken: vi.fn().mockResolvedValue({ valid: false }),
    generateAuthTokens: vi.fn().mockReturnValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    }),
    JWTValidator: {
      verify: vi.fn().mockReturnValue({ userId: 'user-uuid-1234', email: 'test@example.com', role: 'admin' }),
      sign: vi.fn().mockReturnValue('mock-signed-token'),
    },
    csrfProtection: { generateToken: vi.fn().mockReturnValue('csrf-token-abc') },
    apiKeyAuth: { validateAPIKey: vi.fn().mockResolvedValue(null) },
    createRateLimiter: vi.fn(() => ({
      use: (app: Elysia) => app,
    })),
    withAdminGuard: passthrough,
    withOperatorGuard: passthrough,
    signJWT: vi.fn().mockResolvedValue('signed-subdomain-token'),
  };
});

vi.mock('@uaip/shared-services', () => ({
  UserService: {
    getInstance: vi.fn().mockReturnValue({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      findUserById: vi.fn().mockResolvedValue(null),
      createRefreshToken: vi.fn().mockResolvedValue({}),
      revokeRefreshToken: vi.fn().mockResolvedValue({}),
      revokeAllRefreshTokens: vi.fn().mockResolvedValue({}),
      getRefreshTokenWithUser: vi.fn().mockResolvedValue(null),
      updateLoginTracking: vi.fn().mockResolvedValue({}),
      resetLoginAttempts: vi.fn().mockResolvedValue({}),
      updatePassword: vi.fn().mockResolvedValue({}),
    }),
  },
}));

vi.mock('../../services/audit_service.js', () => ({
  AuditService: vi.fn().mockImplementation(() => ({
    logSecurityEvent: vi.fn().mockResolvedValue({}),
    logEvent: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(false),
    hash: vi.fn().mockResolvedValue('hashed-password'),
  },
  compare: vi.fn().mockResolvedValue(false),
  hash: vi.fn().mockResolvedValue('hashed-password'),
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('jwt-token'),
    verify: vi.fn().mockReturnValue({ userId: 'u1', email: 'test@example.com', role: 'admin' }),
    decode: vi.fn().mockReturnValue({ header: { alg: 'HS256' } }),
    JsonWebTokenError: class JsonWebTokenError extends Error {},
  },
  sign: vi.fn().mockReturnValue('jwt-token'),
  verify: vi.fn().mockReturnValue({ userId: 'u1', email: 'test@example.com', role: 'admin' }),
  decode: vi.fn().mockReturnValue({ header: { alg: 'HS256' } }),
  JsonWebTokenError: class JsonWebTokenError extends Error {},
}));

import { registerAuthRoutes } from '../../../../security-gateway/src/http/auth_elysia.js';
import { UserService } from '@uaip/shared-services';

function buildApp() {
  return new Elysia().use(registerAuthRoutes());
}

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(UserService.getInstance).mockReturnValue({
      findUserByEmail: vi.fn().mockResolvedValue(null),
      findUserById: vi.fn().mockResolvedValue(null),
      createRefreshToken: vi.fn().mockResolvedValue({}),
      revokeRefreshToken: vi.fn().mockResolvedValue({}),
      revokeAllRefreshTokens: vi.fn().mockResolvedValue({}),
      getRefreshTokenWithUser: vi.fn().mockResolvedValue(null),
      updateLoginTracking: vi.fn().mockResolvedValue({}),
      resetLoginAttempts: vi.fn().mockResolvedValue({}),
      updatePassword: vi.fn().mockResolvedValue({}),
    } as never);
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns 400 for invalid email format', async () => {
      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'not-an-email', password: 'password123' }),
        })
      );
      expect(res.status).toBe(400);
    });

    it('returns 401 when user not found', async () => {
      vi.mocked(UserService.getInstance)().findUserByEmail = vi.fn().mockResolvedValue(null);

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'unknown@example.com', password: 'Password1!' }),
        })
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Authentication Failed');
    });

    it('returns 401 for inactive account', async () => {
      vi.mocked(UserService.getInstance)().findUserByEmail = vi.fn().mockResolvedValue({
        id: 'u1', email: 'test@example.com', isActive: false, passwordHash: 'hash',
        role: 'user', failedLoginAttempts: 0,
      });

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'Password1!' }),
        })
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.message).toBe('Account is inactive');
    });

    it('returns 401 for invalid password', async () => {
      const { compare } = await import('bcrypt');
      vi.mocked(compare).mockResolvedValue(false as never);

      vi.mocked(UserService.getInstance)().findUserByEmail = vi.fn().mockResolvedValue({
        id: 'u1', email: 'test@example.com', isActive: true, passwordHash: 'hash',
        role: 'user', failedLoginAttempts: 0,
      });

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'WrongPassword1!' }),
        })
      );
      expect(res.status).toBe(401);
    });

    it('returns 200 with tokens on valid credentials', async () => {
      const { compare } = await import('bcrypt');
      vi.mocked(compare).mockResolvedValue(true as never);

      vi.mocked(UserService.getInstance)().findUserByEmail = vi.fn().mockResolvedValue({
        id: 'u1', email: 'test@example.com', isActive: true, passwordHash: 'hash',
        role: 'user', failedLoginAttempts: 0, firstName: 'Test', lastName: 'User',
        department: 'Eng', permissions: [],
      });
      vi.mocked(UserService.getInstance)().resetLoginAttempts = vi.fn().mockResolvedValue({});
      vi.mocked(UserService.getInstance)().createRefreshToken = vi.fn().mockResolvedValue({});

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'CorrectPassword1!' }),
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe('u1');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('returns 401 when no refresh token cookie', async () => {
      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('returns 200 and clears cookies', async () => {
      vi.mocked(UserService.getInstance)().revokeAllRefreshTokens = vi.fn().mockResolvedValue({});

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/v1/auth/validate', () => {
    it('returns 401 when no Authorization header', async () => {
      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/validate')
      );
      expect(res.status).toBe(401);
    });

    it('returns 200 for valid token', async () => {
      const { JWTValidator } = await import('@uaip/middleware');
      vi.mocked(JWTValidator.verify).mockReturnValue({
        userId: 'u1', email: 'test@example.com', role: 'admin',
        iat: 0, exp: Date.now() / 1000 + 3600,
      } as never);

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/validate', {
          headers: { Authorization: 'Bearer valid-token' },
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(true);
    });

    it('returns 401 for invalid token', async () => {
      const { JWTValidator } = await import('@uaip/middleware');
      vi.mocked(JWTValidator.verify).mockImplementation(() => {
        throw new Error('invalid token');
      });

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/validate', {
          headers: { Authorization: 'Bearer bad-token' },
        })
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/csrf-token', () => {
    it('returns CSRF token', async () => {
      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/auth/csrf-token')
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.token).toBe('csrf-token-abc');
    });
  });
});
