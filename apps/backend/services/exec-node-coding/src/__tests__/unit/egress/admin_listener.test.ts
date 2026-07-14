// Integration tests for the admin /phase listener.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT, importPKCS8 } from 'jose';
import http from 'node:http';
import { loadAdminVerifyKey, createAdminListener } from '../../../egress/admin_listener.js';
import { PhaseStore } from '../../../egress/phase_store.js';

const ALG = 'RS256';
const ISSUER = 'uaip-coding-gateway';
const AUDIENCE = 'uaip-coding-node';

const SESSION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WORKSPACE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROJECT_ID = 'proj-1';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TENANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const REPO_ID = '12345678';

let privatePem: string;
let publicPem: string;
let otherPrivatePem: string;
let phase: PhaseStore;
let listener: ReturnType<typeof createAdminListener> | null = null;
let port = 0;

async function start(): Promise<void> {
  const pair = await generateKeyPair(ALG, { modulusLength: 2048 });
  privatePem = await exportPKCS8(pair.privateKey);
  publicPem = await exportSPKI(pair.publicKey);

  const otherPair = await generateKeyPair(ALG, { modulusLength: 2048 });
  otherPrivatePem = await exportPKCS8(otherPair.privateKey);

  await loadAdminVerifyKey(publicPem);
  phase = new PhaseStore();
  listener = createAdminListener({
    phaseStore: phase,
    getCurrentSessionId: () => SESSION_ID,
  });

  const server = listener.server();
  port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr) resolve(addr.port);
    });
  });
}

afterAll(async () => {
  if (listener) await listener.close();
});

async function mint(overrides: Partial<{
  sessionId: string; workspaceId: string; projectId: string;
  userId: string; tenantId: string; repositoryId: string;
  useOtherKey?: boolean; expired?: boolean; omitJti?: boolean;
}> = {}): Promise<string> {
  const key = await importPKCS8(overrides.useOtherKey ? otherPrivatePem : privatePem, ALG);
  const now = Math.floor(Date.now() / 1000);
  const iat = overrides.expired ? now - 600 : now;
  const exp = overrides.expired ? now - 60 : now + 60;
  let builder = new SignJWT({
    sessionId: overrides.sessionId ?? SESSION_ID,
    workspaceId: overrides.workspaceId ?? WORKSPACE_ID,
    projectId: overrides.projectId ?? PROJECT_ID,
    userId: overrides.userId ?? USER_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    repositoryId: overrides.repositoryId ?? REPO_ID,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(exp);
  if (!overrides.omitJti) builder = builder.setJti('11111111-1111-1111-1111-111111111111');
  return builder.sign(key);
}

function postJson(path: string, body: unknown, token?: string): Promise<{ status: number; body: unknown }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'POST',
      host: '127.0.0.1',
      port,
      path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let buf = Buffer.alloc(0);
      res.on('data', (c: Buffer) => { buf = Buffer.concat([buf, c]); });
      res.on('end', () => {
        let parsed: unknown = null;
        try { parsed = JSON.parse(buf.toString()); } catch { /* swallow */ }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function requestMethod(method: string, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ method, host: '127.0.0.1', port, path }, (res) => {
      let buf = Buffer.alloc(0);
      res.on('data', (c: Buffer) => { buf = Buffer.concat([buf, c]); });
      res.on('end', () => {
        let parsed: unknown = null;
        try { parsed = JSON.parse(buf.toString()); } catch { /* swallow */ }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('admin listener /phase', () => {
  beforeAll(start);

  it('rejects missing bearer with 401', async () => {
    const r = await postJson('/phase', {
      sessionId: SESSION_ID, workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID, userId: USER_ID, tenantId: TENANT_ID,
      repositoryId: REPO_ID, phase: 'setup',
    });
    expect(r.status).toBe(401);
  });

  it('rejects token signed by wrong key with 401', async () => {
    const t = await mint({ useOtherKey: true });
    const r = await postJson('/phase', {
      sessionId: SESSION_ID, workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID, userId: USER_ID, tenantId: TENANT_ID,
      repositoryId: REPO_ID, phase: 'setup',
    }, t);
    expect(r.status).toBe(401);
  });

  it('rejects expired token with 401', async () => {
    const t = await mint({ expired: true });
    const r = await postJson('/phase', {
      sessionId: SESSION_ID, workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID, userId: USER_ID, tenantId: TENANT_ID,
      repositoryId: REPO_ID, phase: 'setup',
    }, t);
    expect(r.status).toBe(401);
  });

  it('rejects when body sessionId != token sessionId (403)', async () => {
    const t = await mint();
    const r = await postJson('/phase', {
      sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID, userId: USER_ID, tenantId: TENANT_ID,
      repositoryId: REPO_ID, phase: 'setup',
    }, t);
    expect(r.status).toBe(403);
  });

  it('rejects when body workspaceId != token workspaceId (403)', async () => {
    const t = await mint();
    const r = await postJson('/phase', {
      sessionId: SESSION_ID,
      workspaceId: '11111111-2222-3333-4444-555555555555',
      projectId: PROJECT_ID, userId: USER_ID, tenantId: TENANT_ID,
      repositoryId: REPO_ID, phase: 'setup',
    }, t);
    expect(r.status).toBe(403);
  });

  it('rejects when body phase enum is invalid (400)', async () => {
    const t = await mint();
    const r = await postJson('/phase', {
      sessionId: SESSION_ID, workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID, userId: USER_ID, tenantId: TENANT_ID,
      repositoryId: REPO_ID, phase: 'unknown',
    }, t);
    expect(r.status).toBe(400);
  });

  it('accepts a valid setup transition and stores phase', async () => {
    const t = await mint();
    const r = await postJson('/phase', {
      sessionId: SESSION_ID, workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID, userId: USER_ID, tenantId: TENANT_ID,
      repositoryId: REPO_ID, phase: 'setup',
    }, t);
    expect(r.status).toBe(200);
    const body = r.body as { ok: boolean; phase: string };
    expect(body.ok).toBe(true);
    expect(body.phase).toBe('setup');
    expect(phase.get()).toBe('setup');
  });

  it('accepts an agent transition', async () => {
    const t = await mint();
    const r = await postJson('/phase', {
      sessionId: SESSION_ID, workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID, userId: USER_ID, tenantId: TENANT_ID,
      repositoryId: REPO_ID, phase: 'agent',
    }, t);
    expect(r.status).toBe(200);
    expect(phase.get()).toBe('agent');
  });

  it('rejects any non-POST method with 405 on /phase', async () => {
    const r = await requestMethod('GET', '/phase');
    expect([405]).toContain(r.status);
  });

  it('returns 404 for unknown paths', async () => {
    const r = await requestMethod('GET', '/some-random-path');
    expect(r.status).toBe(404);
  });

  it('rejects body larger than 4 KiB with 413', async () => {
    const t = await mint();
    const huge = 'x'.repeat(8000);
    const r = await postJson('/phase', {
      sessionId: SESSION_ID, workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID, userId: USER_ID, tenantId: TENANT_ID,
      repositoryId: REPO_ID, phase: 'setup',
      padding: huge,
    }, t);
    expect(r.status).toBe(413);
  });
});
