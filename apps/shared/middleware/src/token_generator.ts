import { JWTValidator } from './j_w_t_validator.js';
import { config } from '@uaip/config';
import jwt from 'jsonwebtoken';
import type { TokenPayload } from '@uaip/types';

/**
 * Generates both access and refresh tokens for authentication
 * Uses JWTValidator for access tokens and direct jwt.sign for refresh tokens
 */
export function generateAuthTokens(payload: TokenPayload): {
  accessToken: string;
  refreshToken: string;
} {
  // Generate access token using JWTValidator (15m default)
  const accessToken = JWTValidator.sign({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    orgId: payload.organizationId,
    sessionId: payload.sessionId,
  });

  // Generate refresh token with longer expiry (7d default)
  const refreshPayload = {
    ...payload,
    type: 'refresh',
  };

  const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.refreshTokenExpiry || '7d',
  });

  return { accessToken, refreshToken };
}
