import { JWTValidator } from './j_w_t_validator.js';
import { signJWT } from './jwks.js';
import { config } from '@uaip/config';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { TokenPayload } from '@uaip/types';

/**
 * Scopes granted to a user access token, derived from role. Present so the
 * access token is federation-ready (aud + scp): downstream subdomains/services
 * can authorize on scope without a shared secret. Kept coarse for now; tighten
 * per-service later.
 */
function scopesForRole(role: string): string[] {
  const scopes = ['platform:access'];
  if (role === 'admin' || role === 'security_admin' || role === 'security-admin') {
    scopes.push('admin');
  }
  return scopes;
}

/**
 * Mint the access + refresh token pair.
 *
 * Access token is RS256 by default (asymmetric → the Cloudflare edge and any
 * federated subdomain can verify it via the published JWKS without sharing a
 * secret). Set AUTH_ACCESS_TOKEN_ALG=HS256 to fall back to the legacy symmetric
 * token for rollback. The refresh token stays HS256 — it never leaves the
 * gateway (verified server-side against JWT_REFRESH_SECRET + DB), so it needs no
 * asymmetric verification.
 *
 * Claims: userId/email/role/sessionId/jti as before, plus `orgId` (tenant — read
 * back into UserContext.organizationId and propagated by the edge as X-User-Org)
 * and `scp` (scopes). iss='uaip', aud='uaip-services' are set by the signer.
 */
export async function generateAuthTokens(payload: TokenPayload): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const jti = randomUUID();
  const claims = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    orgId: payload.organizationId,
    scp: scopesForRole(payload.role),
    sessionId: payload.sessionId,
    jti,
  };

  const useHs256 = process.env.AUTH_ACCESS_TOKEN_ALG === 'HS256';
  const accessToken = useHs256
    ? JWTValidator.sign(claims)
    : await signJWT(claims, { expiresIn: config.jwt.accessTokenExpiry || '15m' });

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
