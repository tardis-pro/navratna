import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT, importPKCS8 } from 'jose';
import { initJwtVerifyKey, verifyNodeJwt, extractBearerToken } from '../../auth/jwt_auth.js';

const ALG = 'RS256';
const ISSUER = 'uaip-coding-gateway';
const AUDIENCE = 'uaip-coding-node';

let privatePem: string;
let publicPem: string;
let otherPrivatePem: string;

const VALID_CLAIMS = {
  sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  projectId: 'proj-1',
  tenantId: 'tenant-1',
  userId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  repositoryId: '12345678',
};

beforeAll(async () => {
  const pair = await generateKeyPair(ALG, { modulusLength: 2048 });
  privatePem = await exportPKCS8(pair.privateKey);
  publicPem = await exportSPKI(pair.publicKey);

  const otherPair = await generateKeyPair(ALG, { modulusLength: 2048 });
  otherPrivatePem = await exportPKCS8(otherPair.privateKey);

  await initJwtVerifyKey(publicPem);
});

async function mintToken(overrides: {
  claims?: Partial<typeof VALID_CLAIMS>;
  iss?: string;
  aud?: string | string[];
  expOffset?: number;
  alg?: string;
  useOtherKey?: boolean;
  omitJti?: boolean;
} = {}): Promise<string> {
  const key = overrides.useOtherKey
    ? await importPKCS8(otherPrivatePem, overrides.alg ?? ALG)
    : await importPKCS8(privatePem, overrides.alg ?? ALG);

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (overrides.expOffset ?? 300);

  const claims = { ...VALID_CLAIMS, ...overrides.claims };

  let builder = new SignJWT({
    sessionId: claims.sessionId,
    workspaceId: claims.workspaceId,
    projectId: claims.projectId,
    tenantId: claims.tenantId,
    userId: claims.userId,
    repositoryId: claims.repositoryId,
  })
    .setProtectedHeader({ alg: overrides.alg ?? ALG })
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp);

  if (!overrides.omitJti) {
    builder = builder.setJti('11111111-1111-1111-1111-111111111111');
  }

  return builder.sign(key);
}

describe('extractBearerToken', () => {
  it('extracts token from valid Authorization header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns undefined for missing header', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it('returns undefined for non-Bearer scheme', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeUndefined();
  });
});

describe('verifyNodeJwt — adversarial rejection', () => {
  it('accepts a valid RS256 JWT with all required claims', async () => {
    const token = await mintToken();
    const claims = await verifyNodeJwt(token);
    expect(claims.sessionId).toBe(VALID_CLAIMS.sessionId);
    expect(claims.repositoryId).toBe('12345678');
  });

  it('rejects a JWT signed by a different private key (wrong signature)', async () => {
    const token = await mintToken({ useOtherKey: true });
    await expect(verifyNodeJwt(token)).rejects.toThrow();
  });

  it('rejects an expired JWT', async () => {
    const token = await mintToken({ expOffset: -10 });
    await expect(verifyNodeJwt(token)).rejects.toThrow();
  });

  it('rejects JWT with wrong issuer', async () => {
    const token = await mintToken({ iss: 'uaip-some-other-service' });
    await expect(verifyNodeJwt(token)).rejects.toThrow();
  });

  it('rejects JWT with wrong audience', async () => {
    const token = await mintToken({ aud: 'uaip-coding-gateway' });
    await expect(verifyNodeJwt(token)).rejects.toThrow();
  });

  it('rejects JWT with missing sessionId claim', async () => {
    const key = await importPKCS8(privatePem, ALG);
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ workspaceId: 'x', projectId: 'y', tenantId: 'z', userId: 'u', repositoryId: '1' })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setJti('11111111-1111-1111-1111-111111111111')
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(key);
    await expect(verifyNodeJwt(token)).rejects.toThrow();
  });

  it('rejects JWT with non-numeric repositoryId', async () => {
    const token = await mintToken({ claims: { repositoryId: 'not-a-number' } });
    await expect(verifyNodeJwt(token)).rejects.toThrow();
  });

  it('rejects a plaintext string (not a JWT)', async () => {
    await expect(verifyNodeJwt('not-a-jwt')).rejects.toThrow();
  });

  it('rejects an empty token string', async () => {
    await expect(verifyNodeJwt('')).rejects.toThrow();
  });

  it('the public PEM initialized is SPKI (no private key material exposed)', async () => {
    expect(publicPem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(publicPem).not.toContain('PRIVATE');
    expect(privatePem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(privatePem).not.toContain(publicPem.slice(27, 60));
  });
});
