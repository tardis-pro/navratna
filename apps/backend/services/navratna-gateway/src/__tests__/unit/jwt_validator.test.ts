import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, msg: string, public code?: string) { super(msg); }
  },
}));

vi.mock('@uaip/config', () => ({
  config: {
    jwt: {
      secret: 'test-secret-that-is-at-least-32-characters-long',
      refreshSecret: 'test-refresh-secret-at-least-32-chars',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
    },
  },
}));

vi.mock('./jwks.js', () => ({
  signJWT: vi.fn().mockResolvedValue('rs256-token'),
  verifyJWT: vi.fn().mockResolvedValue({ userId: 'u1', email: 'test@example.com', role: 'admin' }),
}));

import jwt from 'jsonwebtoken';
import { JWTValidator } from '../../../../../shared/middleware/src/j_w_t_validator.js';

const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';
const JWT_OPTS = { algorithm: 'HS256' as const, issuer: 'uaip', audience: 'uaip-services' };

function signTestToken(payload: Record<string, unknown>, expiresIn = '15m') {
  return jwt.sign(payload, TEST_SECRET, { ...JWT_OPTS, expiresIn } as never);
}

describe('JWTValidator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verify', () => {
    it('returns decoded payload for a valid token', () => {
      const token = signTestToken({ userId: 'u1', email: 'test@example.com', role: 'admin' });
      const decoded = JWTValidator.verify(token);
      expect(decoded.userId).toBe('u1');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('admin');
    });

    it('throws ApiError for expired token', () => {
      const expired = signTestToken(
        { userId: 'u1', email: 'test@example.com', role: 'admin' },
        '-1s'
      );
      expect(() => JWTValidator.verify(expired)).toThrow();
    });

    it('throws ApiError for malformed token', () => {
      expect(() => JWTValidator.verify('not.a.valid.token')).toThrow();
    });

    it('throws ApiError for missing token', () => {
      expect(() => JWTValidator.verify('')).toThrow();
    });

    it('throws ApiError when payload missing required fields', () => {
      const incomplete = jwt.sign({ sub: 'u1' }, TEST_SECRET, JWT_OPTS as never);
      expect(() => JWTValidator.verify(incomplete)).toThrow();
    });

    it('throws ApiError for wrong algorithm token', () => {
      const wrongAlg = jwt.sign(
        { userId: 'u1', email: 'e@e.com', role: 'user' },
        TEST_SECRET,
        { algorithm: 'HS512' as never, issuer: 'uaip', audience: 'uaip-services' }
      );
      expect(() => JWTValidator.verify(wrongAlg)).toThrow();
    });
  });

  describe('sign', () => {
    it('produces a verifiable token', () => {
      const token = JWTValidator.sign({ userId: 'u2', email: 'user@example.com', role: 'user' });
      expect(typeof token).toBe('string');
      const decoded = JWTValidator.verify(token);
      expect(decoded.userId).toBe('u2');
    });
  });
});
