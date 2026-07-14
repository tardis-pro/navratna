import { randomUUID } from 'node:crypto';
import { importPKCS8, importSPKI, SignJWT, jwtVerify } from 'jose';
import { CodingNodeJwtClaimsSchema } from '@uaip/types';
import type { CodingNodeJwtClaims } from '@uaip/types';

const ISSUER = 'uaip-coding-gateway' as const;
const AUDIENCE = 'uaip-coding-node' as const;
const ALG = 'RS256' as const;
const MAX_TTL_S = 300;

let _signingKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;

export async function importSigningKey(privatePem: string): Promise<void> {
  _signingKey = await importPKCS8(privatePem.trim(), ALG);
}

function getSigningKey(): NonNullable<typeof _signingKey> {
  if (!_signingKey) throw new Error('CodingNode JWT signing key not initialized');
  return _signingKey;
}

export type JwtScope = {
  sessionId: string;
  workspaceId: string;
  projectId: string;
  tenantId: string;
  userId: string;
  repositoryId: string;
};

export async function mintCodingNodeJwt(scope: JwtScope): Promise<string> {
  const key = getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sessionId: scope.sessionId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    tenantId: scope.tenantId,
    userId: scope.userId,
    repositoryId: scope.repositoryId,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + MAX_TTL_S)
    .sign(key);
}

let _verifyKey: Awaited<ReturnType<typeof importSPKI>> | null = null;

export async function importVerifyKey(publicPem: string): Promise<void> {
  _verifyKey = await importSPKI(publicPem.trim(), ALG);
}

function getVerifyKey(): NonNullable<typeof _verifyKey> {
  if (!_verifyKey) throw new Error('CodingNode JWT verify key not initialized');
  return _verifyKey;
}

export async function verifyCodingNodeJwt(token: string): Promise<CodingNodeJwtClaims> {
  const key = getVerifyKey();
  const { payload } = await jwtVerify(token, key, {
    algorithms: [ALG],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const raw: unknown = payload;
  const result = CodingNodeJwtClaimsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`JWT claims invalid: ${result.error.message}`);
  }
  const claims = result.data;
  if (
    typeof claims.iss !== 'string' ||
    typeof claims.aud !== 'string' ||
    typeof claims.jti !== 'string' ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number' ||
    typeof claims.sessionId !== 'string' ||
    typeof claims.workspaceId !== 'string' ||
    typeof claims.projectId !== 'string' ||
    typeof claims.tenantId !== 'string' ||
    typeof claims.userId !== 'string' ||
    typeof claims.repositoryId !== 'string'
  ) {
    throw new Error('JWT claims missing required fields');
  }
  return {
    iss: claims.iss,
    aud: claims.aud,
    jti: claims.jti,
    iat: claims.iat,
    exp: claims.exp,
    sessionId: claims.sessionId,
    workspaceId: claims.workspaceId,
    projectId: claims.projectId,
    tenantId: claims.tenantId,
    userId: claims.userId,
    repositoryId: claims.repositoryId,
  };
}

export async function probeKeyPair(privatePem: string, publicPem: string): Promise<void> {
  const privKey = await importPKCS8(privatePem.trim(), ALG);
  const pubKey = await importSPKI(publicPem.trim(), ALG);
  const probe = await new SignJWT({ probe: true })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(privKey);
  await jwtVerify(probe, pubKey, { algorithms: [ALG], issuer: ISSUER, audience: AUDIENCE });
}
