import { JWTValidator } from './j_w_t_validator.js';
import { config } from '@uaip/config';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { TokenPayload } from '@uaip/types';

export function generateAuthTokens(payload: TokenPayload): {
  accessToken: string;
  refreshToken: string;
} {
  const jti = randomUUID();
  const accessToken = JWTValidator.sign({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    orgId: payload.organizationId,
    sessionId: payload.sessionId,
    jti,
  });

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
