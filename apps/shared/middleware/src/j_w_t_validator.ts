import jwt from 'jsonwebtoken';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { config } from '@uaip/config';
import { signJWT as jwksSignJWT, verifyJWT as jwksVerifyJWT } from './jwks.js';

const DEFAULT_DEV_SECRET = 'uaip_dev_jwt_secret_key_change_in_production';
const MIN_SECRET_LENGTH = 32;
const SAFE_ENVS_FOR_DEV_SECRET = new Set(['development', 'test']);
const JWT_ISSUER = 'uaip';
const JWT_AUDIENCE = 'uaip-services';

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  orgId?: string;
  sessionId?: string;
  jti?: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

type JtiBlocklistClient = {
  exists(key: string): Promise<number>;
};

// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- static utility class pattern
export class JWTValidator {
  /**
   * Read lazily on each call so that vi.mock('@uaip/config') in tests takes effect.
   * Static eager initialization would capture the real config before mocks are applied.
   */
  private static getJWTSecret(): string {
    const jwtSecret = config.jwt.secret;
    const nodeEnv = process.env.NODE_ENV ?? '';
    const isDevOrTest = SAFE_ENVS_FOR_DEV_SECRET.has(nodeEnv);

    if (!jwtSecret) {
      throw new Error(
        'FATAL: JWT secret is not configured. Set JWT_SECRET environment variable.'
      );
    }

    if (jwtSecret === DEFAULT_DEV_SECRET && !isDevOrTest) {
      throw new Error(
        `FATAL: Default JWT secret detected in "${nodeEnv || 'unset'}" environment. ` +
          'The default secret is only allowed in development/test. ' +
          'Set a strong, unique JWT_SECRET environment variable before deploying.'
      );
    }

    if (jwtSecret === DEFAULT_DEV_SECRET && isDevOrTest) {
      logger.warn('Using default JWT secret — acceptable only in development/test');
    }

    if (jwtSecret.length < MIN_SECRET_LENGTH && !isDevOrTest) {
      throw new Error(
        `FATAL: JWT secret must be at least ${MIN_SECRET_LENGTH} characters (current: ${jwtSecret.length}). ` +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"'
      );
    }

    if (jwtSecret.length < MIN_SECRET_LENGTH && isDevOrTest) {
      logger.warn(`JWT secret is shorter than recommended ${MIN_SECRET_LENGTH} characters`);
    }

    return jwtSecret;
  }

  public static async verify(
    token: string,
    blocklist?: JtiBlocklistClient
  ): Promise<JWTPayload> {
    try {
      const rawDecoded = jwt.verify(token, this.getJWTSecret(), {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      if (typeof rawDecoded === 'string') {
        throw new ApiError(401, 'Invalid token format', 'INVALID_TOKEN');
      }

      const userId = rawDecoded['userId'];
      const email = rawDecoded['email'];
      const role = rawDecoded['role'];
      const orgId = rawDecoded['orgId'];
      const sessionId = rawDecoded['sessionId'];
      const jti = rawDecoded['jti'];

      if (typeof userId !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
        throw new ApiError(401, 'Invalid token payload', 'INVALID_TOKEN');
      }

      const decoded: JWTPayload = {
        userId,
        email,
        role,
        orgId: typeof orgId === 'string' ? orgId : undefined,
        sessionId: typeof sessionId === 'string' ? sessionId : undefined,
        jti: typeof jti === 'string' ? jti : undefined,
        iat: typeof rawDecoded.iat === 'number' ? rawDecoded.iat : 0,
        exp: typeof rawDecoded.exp === 'number' ? rawDecoded.exp : 0,
        iss: typeof rawDecoded.iss === 'string' ? rawDecoded.iss : undefined,
        aud: typeof rawDecoded.aud === 'string' ? rawDecoded.aud : undefined,
      };

      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        throw new ApiError(401, 'Token expired', 'TOKEN_EXPIRED');
      }

      if (blocklist && decoded.jti) {
        const revoked = await blocklist.exists(`revoked:${decoded.jti}`);
        if (revoked) {
          throw Object.assign(new Error('Token has been revoked'), { code: 'TOKEN_REVOKED', status: 401 });
        }
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, 'Invalid token', 'INVALID_TOKEN');
      }
      throw error;
    }
  }

  /**
   * Sign an HS256 token (existing behavior, backward compatible).
   */
  public static sign(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.getJWTSecret(), {
      expiresIn: config.jwt.accessTokenExpiry || '15m',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  /**
   * Sign a JWT using RS256 with the JWKS private key.
   * Enables external subdomain token verification without shared secrets.
   */
  public static async signRS256(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
    return jwksSignJWT(payload as Record<string, unknown>);
  }

  /**
   * Verify an RS256 token using the JWKS public key.
   * Returns a validated JWTPayload with the same shape as HS256 verify().
   */
  public static async verifyRS256(token: string): Promise<JWTPayload> {
    const josePayload = await jwksVerifyJWT(token);

    const userId = josePayload['userId'];
    const email = josePayload['email'];
    const role = josePayload['role'];
    const orgId = josePayload['orgId'];
    const sessionId = josePayload['sessionId'];

    if (typeof userId !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
      throw new ApiError(401, 'Invalid token payload', 'INVALID_TOKEN');
    }

    return {
      userId,
      email,
      role,
      orgId: typeof orgId === 'string' ? orgId : undefined,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
      iat: typeof josePayload.iat === 'number' ? josePayload.iat : 0,
      exp: typeof josePayload.exp === 'number' ? josePayload.exp : 0,
      iss: typeof josePayload.iss === 'string' ? josePayload.iss : undefined,
      aud: typeof josePayload.aud === 'string' ? josePayload.aud : undefined,
    };
  }

  /**
   * Verify a token using the algorithm declared in its header.
   * Checks the alg field BEFORE attempting verification to prevent
   * algorithm confusion / downgrade attacks.
   */
  public static async verifyAny(token: string): Promise<JWTPayload> {
    const header = jwt.decode(token, { complete: true })?.header;
    if (!header || !header.alg) {
      throw new ApiError(401, 'Invalid token: missing algorithm header', 'INVALID_TOKEN');
    }

    switch (header.alg) {
      case 'RS256':
        return this.verifyRS256(token);
      case 'HS256':
        return await this.verify(token);
      default:
        throw new ApiError(401, `Unsupported token algorithm: ${header.alg}`, 'INVALID_TOKEN');
    }
  }
}
