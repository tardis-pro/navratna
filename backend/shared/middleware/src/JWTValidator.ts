import jwt from 'jsonwebtoken';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { config } from '@uaip/config';

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

export class JWTValidator {
  private static readonly JWT_SECRET = JWTValidator.validateJWTSecret();

  private static validateJWTSecret(): string {
    const jwtSecret = config.jwt.secret;

    if (!jwtSecret) {
      logger.error('JWT secret is not configured in shared config');
      throw new Error('JWT secret is required in configuration');
    }

    if (jwtSecret === 'uaip_dev_jwt_secret_key_change_in_production') {
      logger.warn('Using default JWT secret - this should be changed in production');
    }

    if (jwtSecret.length < 32) {
      logger.warn('JWT secret is shorter than recommended 32 characters');
    }

    return jwtSecret;
  }

  public static verify(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as JWTPayload;

      if (!decoded.userId || !decoded.email || !decoded.role) {
        throw new ApiError(401, 'Invalid token payload', 'INVALID_TOKEN');
      }

      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        throw new ApiError(401, 'Token expired', 'TOKEN_EXPIRED');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, `Invalid token: ${error.message}`, 'INVALID_TOKEN');
      }
      throw error;
    }
  }

  public static sign(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.JWT_SECRET, { expiresIn: config.jwt.accessTokenExpiry || '15m' });
  }
}
