import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI, jwtVerify, importSPKI } from 'jose';
import {
  importSigningKey,
  importVerifyKey,
  mintCodingNodeJwt,
  verifyCodingNodeJwt,
  probeKeyPair,
} from '../../services/execution_mesh/coding_node_jwt.js';

const ALG = 'RS256';
const ISSUER = 'uaip-coding-gateway';
const AUDIENCE = 'uaip-coding-node';

let privatePem: string;
let publicPem: string;
let otherPrivatePem: string;
let otherPublicPem: string;

const SCOPE = {
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
  otherPublicPem = await exportSPKI(otherPair.publicKey);

  await importSigningKey(privatePem);
  await importVerifyKey(publicPem);
});

describe('mintCodingNodeJwt', () => {
  it('produces a JWT with correct issuer and audience', async () => {
    const token = await mintCodingNodeJwt(SCOPE);
    const pubKey = await importSPKI(publicPem, ALG);
    const { payload } = await jwtVerify(token, pubKey, { algorithms: [ALG], issuer: ISSUER, audience: AUDIENCE });
    expect(payload.iss).toBe(ISSUER);
    expect(payload.aud).toBe(AUDIENCE);
  });

  it('produces a JWT with all scope claims', async () => {
    const token = await mintCodingNodeJwt(SCOPE);
    const claims = await verifyCodingNodeJwt(token);
    expect(claims.sessionId).toBe(SCOPE.sessionId);
    expect(claims.workspaceId).toBe(SCOPE.workspaceId);
    expect(claims.projectId).toBe(SCOPE.projectId);
    expect(claims.tenantId).toBe(SCOPE.tenantId);
    expect(claims.userId).toBe(SCOPE.userId);
    expect(claims.repositoryId).toBe(SCOPE.repositoryId);
  });

  it('expiry is at most 5 minutes in the future', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await mintCodingNodeJwt(SCOPE);
    const pubKey = await importSPKI(publicPem, ALG);
    const { payload } = await jwtVerify(token, pubKey, { algorithms: [ALG], issuer: ISSUER, audience: AUDIENCE });
    const exp = payload.exp as number;
    expect(exp - before).toBeLessThanOrEqual(300);
    expect(exp - before).toBeGreaterThan(0);
  });

  it('includes a jti (unique per call)', async () => {
    const t1 = await mintCodingNodeJwt(SCOPE);
    const t2 = await mintCodingNodeJwt(SCOPE);
    const pubKey = await importSPKI(publicPem, ALG);
    const { payload: p1 } = await jwtVerify(t1, pubKey, { algorithms: [ALG], issuer: ISSUER, audience: AUDIENCE });
    const { payload: p2 } = await jwtVerify(t2, pubKey, { algorithms: [ALG], issuer: ISSUER, audience: AUDIENCE });
    expect(typeof p1.jti).toBe('string');
    expect(typeof p2.jti).toBe('string');
    expect(p1.jti).not.toBe(p2.jti);
  });

  it('token is NOT stored — each call mints a fresh token', async () => {
    const t1 = await mintCodingNodeJwt(SCOPE);
    const t2 = await mintCodingNodeJwt(SCOPE);
    expect(t1).not.toBe(t2);
  });
});

describe('probeKeyPair', () => {
  it('succeeds with a matching private/public key pair', async () => {
    await expect(probeKeyPair(privatePem, publicPem)).resolves.toBeUndefined();
  });

  it('fails when private and public keys are from different pairs', async () => {
    await expect(probeKeyPair(privatePem, otherPublicPem)).rejects.toThrow();
  });

  it('fails when given another private PEM as the public key', async () => {
    await expect(probeKeyPair(privatePem, otherPrivatePem)).rejects.toThrow();
  });
});

describe('verifyCodingNodeJwt — adversarial', () => {
  it('rejects a token signed by a different private key', async () => {
    await importSigningKey(otherPrivatePem);
    const token = await mintCodingNodeJwt(SCOPE);
    await importSigningKey(privatePem);
    await expect(verifyCodingNodeJwt(token)).rejects.toThrow();
  });

  it('Redis envelope contains only shadow (no signed JWT stored)', () => {
    const envelope = { shadow: { sessionId: SCOPE.sessionId } };
    expect(Object.keys(envelope)).toEqual(['shadow']);
    expect('token' in envelope).toBe(false);
    expect('nodeToken' in envelope).toBe(false);
  });

  it('machine env has public key but no CODING_NODE_TOKEN or private key', () => {
    const machineEnv = { CODING_NODE_JWT_PUBLIC_KEY_PEM: publicPem };
    expect(machineEnv).not.toHaveProperty('CODING_NODE_TOKEN');
    expect(machineEnv).not.toHaveProperty('CODING_NODE_JWT_PRIVATE_KEY_PEM');
    expect(machineEnv['CODING_NODE_JWT_PUBLIC_KEY_PEM']).toContain('-----BEGIN PUBLIC KEY-----');
    expect(machineEnv['CODING_NODE_JWT_PUBLIC_KEY_PEM']).not.toContain('PRIVATE');
  });

  it('same-tenant different-workspace JWT is rejected for scope check', async () => {
    const token = await mintCodingNodeJwt({ ...SCOPE, workspaceId: 'dddddddd-dddd-dddd-dddd-dddddddddddd' });
    const claims = await verifyCodingNodeJwt(token);
    expect(claims.workspaceId).not.toBe(SCOPE.workspaceId);
    expect(claims.sessionId).toBe(SCOPE.sessionId);
  });
});
