import { importSPKI, jwtVerify } from 'jose';
import Elysia from 'elysia';
import { CodingNodeJwtClaimsSchema } from '@uaip/types';
import type { CodingNodeJwtClaims } from '@uaip/types';

const ISSUER = 'uaip-coding-gateway' as const;
const AUDIENCE = 'uaip-coding-node' as const;
const ALG = 'RS256' as const;
const MAX_TOKEN_BYTES = 16 * 1024;

type VerifyKey = Awaited<ReturnType<typeof importSPKI>>;

let _verifyKey: VerifyKey | null = null;

export async function initJwtVerifyKey(publicPem: string): Promise<void> {
  _verifyKey = await importSPKI(publicPem.trim(), ALG);
}

function getVerifyKey(): VerifyKey {
  if (!_verifyKey) throw new Error('CodingNode JWT public key not initialized');
  return _verifyKey;
}

export async function verifyNodeJwt(token: string): Promise<CodingNodeJwtClaims> {
  if (token.length > MAX_TOKEN_BYTES) throw new Error('Bearer token exceeds maximum allowed length');
  const key = getVerifyKey();
  const { payload } = await jwtVerify(token, key, {
    algorithms: [ALG],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const result = CodingNodeJwtClaimsSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`JWT claims invalid: ${result.error.message}`);
  }
  const d = result.data;
  if (
    typeof d.iss !== 'string' ||
    typeof d.aud !== 'string' ||
    typeof d.jti !== 'string' ||
    typeof d.iat !== 'number' ||
    typeof d.exp !== 'number' ||
    typeof d.sessionId !== 'string' ||
    typeof d.workspaceId !== 'string' ||
    typeof d.projectId !== 'string' ||
    typeof d.tenantId !== 'string' ||
    typeof d.userId !== 'string' ||
    typeof d.repositoryId !== 'string'
  ) {
    throw new Error('JWT claims missing required fields');
  }
  const claims: CodingNodeJwtClaims = {
    iss: d.iss,
    aud: d.aud,
    jti: d.jti,
    iat: d.iat,
    exp: d.exp,
    sessionId: d.sessionId,
    workspaceId: d.workspaceId,
    projectId: d.projectId,
    tenantId: d.tenantId,
    userId: d.userId,
    repositoryId: d.repositoryId,
  };
  return claims;
}

export function extractBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') return undefined;
  return parts[1];
}

export function createJwtAuth() {
  return new Elysia({ name: 'exec-node-coding-jwt-auth' })
    .guard({
      async beforeHandle({ request, set }) {
        const authorization = request.headers.get('authorization') ?? undefined;
        const token = extractBearerToken(authorization);
        if (!token) {
          set.status = 401;
          return { error: 'Missing Authorization: Bearer token' };
        }
        try {
          await verifyNodeJwt(token);
        } catch {
          set.status = 401;
          return { error: 'Invalid or expired JWT' };
        }
      },
    });
}

export async function requireJwtClaims(request: Request): Promise<CodingNodeJwtClaims> {
  const authorization = request.headers.get('authorization') ?? undefined;
  const token = extractBearerToken(authorization);
  if (!token) throw new Error('Missing Bearer token');
  return verifyNodeJwt(token);
}
