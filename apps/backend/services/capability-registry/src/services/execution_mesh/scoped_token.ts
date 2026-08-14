// Execution Mesh — per-call scoped token minting (spec §4, §7 / D6).
// Replaces the Phase 2+ `ctx.scopedToken: 'system'` stub for remote dispatch.
//
// Tokens are RS256, signed with the platform JWKS key (@uaip/middleware jwks),
// so any producer that trusts the fleet issuer can verify them offline via
// `/.well-known/jwks.json` — no shared secrets shipped to producers. Each token
// is scoped to ONE tool call: audience `tardis-federation`, the tool id and
// correlation id as claims, and a 60-second lifetime. A leaked token therefore
// authorises nothing beyond the single call it was minted for, briefly.

import { signJWT } from '@uaip/middleware';
import { logger } from '@uaip/utils';

/** Audience federated producers must require when verifying scoped call tokens. */
export const FEDERATION_TOKEN_AUDIENCE = 'tardis-federation';

/** Token lifetime — long enough for one tool call, nothing more. */
const SCOPED_TOKEN_TTL = '60s';

export interface ScopedTokenClaims {
  /** The authenticated caller the execution runs as (`sub`). */
  userId: string;
  /** The exact tool id this token authorises. */
  toolId: string;
  /** Correlates the token to one scheduler dispatch. */
  correlationId: string;
  /** Optional tenant scope. */
  tenant?: string;
}

/**
 * Mint a short-lived RS256 token scoped to a single federated tool call.
 * Throws when the signing key is unavailable — the caller decides whether that
 * degrades (worker tier, shared-secret transport) or fails closed (federation).
 */
export async function mintScopedToken(claims: ScopedTokenClaims): Promise<string> {
  return signJWT(
    {
      sub: claims.userId,
      toolId: claims.toolId,
      correlationId: claims.correlationId,
      ...(claims.tenant ? { tenant: claims.tenant } : {}),
    },
    {
      audience: FEDERATION_TOKEN_AUDIENCE,
      expiresIn: SCOPED_TOKEN_TTL,
    }
  );
}

/**
 * Best-effort variant for non-federation runtimes: returns null instead of
 * throwing so the legacy paths keep their existing degradation behaviour.
 */
export async function tryMintScopedToken(claims: ScopedTokenClaims): Promise<string | null> {
  try {
    return await mintScopedToken(claims);
  } catch (error) {
    logger.warn('Scoped token minting failed; dispatch continues without one', {
      toolId: claims.toolId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
