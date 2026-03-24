import jwt from 'jsonwebtoken';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { config } from '@uaip/config';

const DEFAULT_DEV_SECRET = 'uaip_dev_jwt_secret_key_change_in_production';
const MIN_SECRET_LENGTH = 32;
const JWT_ISSUER = 'uaip';
const JWT_AUDIENCE = 'uaip-services';

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- static utility class pattern
export class JWTValidator {
  private static readonly JWT_SECRET = JWTValidator.validateJWTSecret();

  private static validateJWTSecret(): string {
    const jwtSecret = config.jwt.secret;
    const isProduction = process.env.NODE_ENV === 'production';

    if (!jwtSecret) {
      logger.error('JWT secret is not configured in shared config');
      throw new Error('JWT secret is required in configuration');
    }

    if (jwtSecret === DEFAULT_DEV_SECRET) {
      if (isProduction) {
        throw new Error(
          'FATAL: Default JWT secret detected in production. ' +
            'Set a strong, unique JWT_SECRET environment variable before deploying.'
        );
      }
      logger.warn('Using default JWT secret - this MUST be changed before production deployment');
    }

    if (jwtSecret.length < MIN_SECRET_LENGTH) {
      if (isProduction) {
        throw new Error(
          `FATAL: JWT secret must be at least ${MIN_SECRET_LENGTH} characters in production (current: ${jwtSecret.length})`
        );
      }
      logger.warn(`JWT secret is shorter than recommended ${MIN_SECRET_LENGTH} characters`);
    }

    return jwtSecret;
  }

  public static verify(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as JWTPayload;

      if (!decoded.userId || !decoded.email || !decoded.role) {
        throw new ApiError(401, 'Invalid token payload', 'INVALID_TOKEN');
      }

      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        throw new ApiError(401, 'Token expired', 'TOKEN_EXPIRED');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, 'Invalid token', 'INVALID_TOKEN');
      }
      throw error;
    }
  }

  public static sign(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: config.jwt.accessTokenExpiry || '15m',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }
}
