import { JWTValidator } from './JWTValidator.js';
import { config } from '@uaip/config';
import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
  userType?: string;
  securityLevel?: number;
  agentCapabilities?: string[];
}

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
    sessionId: payload.sessionId,
  });

  // Generate refresh token with longer expiry (7d default)
  const refreshPayload = {
    ...payload,
    type: 'refresh',
  };

  const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret as string, {
    expiresIn: config.jwt.refreshTokenExpiry || '7d',
  });

  return { accessToken, refreshToken };
}
