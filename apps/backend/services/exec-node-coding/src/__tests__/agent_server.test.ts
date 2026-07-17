import { describe, expect, it, beforeAll } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT } from 'jose';
import { buildAgentServer } from '../agent_server.js';
import { initJwtVerifyKey } from '../auth/jwt_auth.js';
import type { CodingNodeConfig } from '../config.js';
import { SessionRegistry } from '../session/session_registry.js';

const ALG = 'RS256';
const ISSUER = 'uaip-coding-gateway';
const AUDIENCE = 'uaip-coding-node';

let validJwt: string;
let publicPem: string;

const SESSION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeAll(async () => {
  const pair = await generateKeyPair(ALG, { modulusLength: 2048 });
  const _privatePem = await exportPKCS8(pair.privateKey);
  publicPem = await exportSPKI(pair.publicKey);

  await initJwtVerifyKey(publicPem);

  const now = Math.floor(Date.now() / 1000);
  validJwt = await new SignJWT({
    sessionId: SESSION_ID,
    workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    projectId: 'proj-1',
    tenantId: 'tenant-1',
    userId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    repositoryId: '12345678',
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti('11111111-1111-1111-1111-111111111111')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(pair.privateKey);
});

const config: CodingNodeConfig = {
  codingNodeJwtPublicKeyPem: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest==\n-----END PUBLIC KEY-----',
  port: 3009,
  host: '127.0.0.1',
  sessionDir: '/tmp/exec-node-coding-tests/sessions',
  replayBufferSize: 200,
  nodeId: 'coding-node-test',
  workspaceRoot: '/tmp/exec-node-coding-tests/workspace',
  completedKeyTtlMs: 600_000,
};

describe('buildAgentServer', () => {
  it('serves unauthenticated health and maps unknown routes to 404', async () => {
    const app = buildAgentServer(config, new SessionRegistry());
    const health = await app.handle(new Request('http://localhost/healthz'));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, nodeId: 'coding-node-test' });

    const missing = await app.handle(new Request('http://localhost/not-a-route'));
    expect(missing.status).toBe(404);
  });

  it('protects session routes and serves authenticated verification', async () => {
    const app = buildAgentServer(config, new SessionRegistry());
    const unauthorized = await app.handle(new Request('http://localhost/sessions/missing/verify', {
      method: 'POST',
    }));
    expect(unauthorized.status).toBe(401);

    const authorized = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validJwt}` },
    }));
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toMatchObject({ alive: false, sessionId: SESSION_ID });
  });

  it('requires a valid JWT not a plain bearer token', async () => {
    const app = buildAgentServer(config, new SessionRegistry());
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
      headers: { Authorization: 'Bearer not-a-jwt' },
    }));
    expect(res.status).toBe(401);
  });
});
