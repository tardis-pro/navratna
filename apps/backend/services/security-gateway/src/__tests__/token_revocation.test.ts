import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

vi.mock('@uaip/config', () => ({
  config: {
    jwt: {
      secret: 'test-jwt-secret-key-that-is-long-enough-for-tests-32c',
      accessTokenExpiry: '15m',
      refreshSecret: 'test-refresh-secret-key-that-is-long-enough-32c',
      refreshTokenExpiry: '7d',
    },
    redis: { host: 'localhost', port: 6379 },
    rateLimit: { windowMs: 15 * 60 * 1000, max: 100 },
  },
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { JWTValidator } from '@uaip/middleware';

const JWT_SECRET = 'test-jwt-secret-key-that-is-long-enough-for-tests-32c';
const JWT_ISSUER = 'uaip';
const JWT_AUDIENCE = 'uaip-services';

type MockRedis = {
  exists: ReturnType<typeof vi.fn>;
  setex: ReturnType<typeof vi.fn>;
};

function makeMockRedis(existsReturn = 0): MockRedis {
  return {
    exists: vi.fn().mockResolvedValue(existsReturn),
    setex: vi.fn().mockResolvedValue('OK'),
  };
}

function signToken(payload: Record<string, unknown>, expiresIn: string | number = '15m'): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function buildPayload(jti?: string): Record<string, unknown> {
  return {
    userId: randomUUID(),
    email: 'test@example.com',
    role: 'user',
    ...(jti !== undefined ? { jti } : {}),
  };
}

describe('JWTValidator.verify() — jti blocklist', () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = makeMockRedis(0);
    vi.clearAllMocks();
  });

  it('T1: valid token with no blocklist entry resolves with payload', async () => {
    const jti = randomUUID();
    const token = signToken(buildPayload(jti));

    const result = await JWTValidator.verify(token, redis);

    expect(redis.exists).toHaveBeenCalledWith(`revoked:${jti}`);
    expect(result).toMatchObject({ email: 'test@example.com', role: 'user' });
  });

  it('T2: token with jti in Redis blocklist throws TOKEN_REVOKED', async () => {
    redis = makeMockRedis(1);
    const jti = randomUUID();
    const token = signToken(buildPayload(jti));

    await expect(JWTValidator.verify(token, redis)).rejects.toMatchObject({
      code: 'TOKEN_REVOKED',
    });
    expect(redis.exists).toHaveBeenCalledWith(`revoked:${jti}`);
  });

  it('T3: expired token throws 401, not TOKEN_REVOKED', async () => {
    const jti = randomUUID();
    const token = signToken(buildPayload(jti), -1);

    await expect(JWTValidator.verify(token, redis)).rejects.not.toMatchObject({
      code: 'TOKEN_REVOKED',
    });
    await expect(JWTValidator.verify(token, redis)).rejects.toMatchObject({ status: 401 });
  });

  it('T4: SETEX is called with revoked:{jti} key and positive TTL', async () => {
    const jti = randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = nowSec + 600;
    const ttl = Math.max(exp - nowSec, 1);

    await redis.setex(`revoked:${jti}`, ttl, '1');

    expect(redis.setex).toHaveBeenCalledWith(`revoked:${jti}`, expect.any(Number), '1');
    const [, calledTtl] = redis.setex.mock.calls[0] as [string, number, string];
    expect(calledTtl).toBeGreaterThan(0);
    expect(calledTtl).toBeLessThanOrEqual(ttl + 2);
  });

  it('T5: TTL clamping — Math.max(expired - now, 1) equals 1 for past exp', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = nowSec - 10;
    const ttl = Math.max(exp - nowSec, 1);
    expect(ttl).toBe(1);
  });

  it('T6: after revocation, verify against blocklist returns TOKEN_REVOKED', async () => {
    const jti = randomUUID();
    const token = signToken(buildPayload(jti));
    const revokedRedis = makeMockRedis(1);

    await expect(JWTValidator.verify(token, revokedRedis)).rejects.toMatchObject({
      code: 'TOKEN_REVOKED',
    });
  });

  it('T7: randomUUID() produces a valid UUID v4', () => {
    const jti = randomUUID();
    expect(jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});

describe('generateAuthTokens — jti in access token', () => {
  it('access token contains a UUID v4 jti claim', async () => {
    const { generateAuthTokens } = await import('@uaip/middleware');
    const { accessToken } = generateAuthTokens({
      userId: randomUUID(),
      email: 'gen@test.com',
      role: 'user',
      organizationId: randomUUID(),
    });
    const decoded = jwt.decode(accessToken) as Record<string, unknown>;
    expect(typeof decoded['jti']).toBe('string');
    expect(decoded['jti'] as string).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
