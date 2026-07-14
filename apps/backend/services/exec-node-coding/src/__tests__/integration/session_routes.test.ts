import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Elysia from 'elysia';
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT, importPKCS8 } from 'jose';
import { initJwtVerifyKey } from '../../auth/jwt_auth.js';
import { createJwtAuth } from '../../auth/jwt_auth.js';
import { createSessionRoutes } from '../../routes/session_routes.js';
import { createEventsRoutes } from '../../routes/events_routes.js';
import { createHealthRoutes } from '../../routes/health_routes.js';
import { SessionRegistry } from '../../session/session_registry.js';
import type { PiLoader, PiSessionPair } from '../../session/pi_loader.js';
import type { CodingNodeConfig } from '../../config.js';
import type { AgentSessionEventListener } from '@mariozechner/pi-coding-agent';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}));

vi.mock('../../session/secure_git_clone.js', () => ({
  secureGitClone: vi.fn().mockResolvedValue(undefined),
}));

const ALG = 'RS256';
const ISSUER = 'uaip-coding-gateway';
const AUDIENCE = 'uaip-coding-node';

const SESSION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WORKSPACE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROJECT_ID = 'proj-abc';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TENANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const REPO_ID = '12345678';

let privatePem: string;
let otherPrivatePem: string;
let publicPem: string;

beforeAll(async () => {
  const pair = await generateKeyPair(ALG, { modulusLength: 2048 });
  privatePem = await exportPKCS8(pair.privateKey);
  publicPem = await exportSPKI(pair.publicKey);

  const otherPair = await generateKeyPair(ALG, { modulusLength: 2048 });
  otherPrivatePem = await exportPKCS8(otherPair.privateKey);

  await initJwtVerifyKey(publicPem);
});

async function mint(overrides: {
  sessionId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  tenantId?: string;
  repositoryId?: string;
  expOffset?: number;
  iatOffset?: number;
  useOtherKey?: boolean;
  omitJti?: boolean;
} = {}): Promise<string> {
  const key = await importPKCS8(overrides.useOtherKey ? otherPrivatePem : privatePem, ALG);
  const now = Math.floor(Date.now() / 1000);
  const iat = now + (overrides.iatOffset ?? 0);
  const expOffset = overrides.expOffset ?? 299;
  const exp = iat + expOffset;

  let builder = new SignJWT({
    sessionId: overrides.sessionId ?? SESSION_ID,
    workspaceId: overrides.workspaceId ?? WORKSPACE_ID,
    projectId: overrides.projectId ?? PROJECT_ID,
    userId: overrides.userId ?? USER_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    repositoryId: overrides.repositoryId ?? REPO_ID,
    iat,
    exp,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE);

  if (!overrides.omitJti) builder = builder.setJti(crypto.randomUUID());

  return builder.sign(key);
}

function asAgentEvent(raw: Record<string, unknown>) {
  return raw as unknown as Parameters<AgentSessionEventListener>[0];
}

function buildFakeLoader(): { loader: PiLoader; emitPiEvent: (raw: Record<string, unknown>) => void } {
  let capturedListener: AgentSessionEventListener | undefined;

  const fakeSession = {
    prompt: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    abortBash: vi.fn(),
    subscribe: vi.fn().mockImplementation((listener: AgentSessionEventListener) => {
      capturedListener = listener;
      return () => { capturedListener = undefined; };
    }),
  };

  const fakePair: PiSessionPair = {
    session: fakeSession,
    getSessionFile: () => '/tmp/fake.jsonl',
  };

  const loader: PiLoader = vi.fn().mockResolvedValue(fakePair);

  const emitPiEvent = (raw: Record<string, unknown>) => {
    capturedListener?.(asAgentEvent(raw));
  };

  return { loader, emitPiEvent };
}

const CONFIG: CodingNodeConfig = {
  codingNodeJwtPublicKeyPem: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest==\n-----END PUBLIC KEY-----',
  port: 3009,
  host: '127.0.0.1',
  sessionDir: '/tmp/exec-node-coding-test',
  replayBufferSize: 200,
  nodeId: 'test-node',
  workspaceRoot: '/workspace',
  completedKeyTtlMs: 600_000,
};

function buildApp(registry: SessionRegistry, loader: PiLoader) {
  const protectedRoutes = createJwtAuth()
    .use(createSessionRoutes(registry, CONFIG, loader))
    .use(createEventsRoutes(registry));

  return new Elysia()
    .use(createHealthRoutes('test-node', () => registry.count()))
    .use(protectedRoutes);
}

const CREATE_BODY = {
  sessionId: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  userId: USER_ID,
  tenantId: TENANT_ID,
  repositoryId: REPO_ID,
  workspacePath: '/workspace',
  llmCredentials: [],
};

async function getAUTH(sessionId = SESSION_ID) {
  const token = await mint({ sessionId });
  return { Authorization: `Bearer ${token}` };
}

async function createAndAwaitReady(
  app: ReturnType<typeof buildApp>,
  body = CREATE_BODY
): Promise<void> {
  const auth = await getAUTH(body.sessionId);
  await app.handle(new Request('http://localhost/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  }));
  await new Promise((r) => setTimeout(r, 20));
}

describe('GET /healthz', () => {
  it('returns 200 without auth', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const res = await app.handle(new Request('http://localhost/healthz'));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

describe('Auth enforcement', () => {
  it('rejects missing token with 401', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
    }));
    expect(res.status).toBe(401);
  });

  it('rejects token signed by wrong key with 401', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ useOtherKey: true });
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(401);
  });

  it('rejects expired JWT with 401', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ expOffset: -10 });
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(401);
  });

  it('rejects token with lifetime >300s with 401', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ expOffset: 301 });
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(401);
  });

  it('rejects token exceeding 16KiB with 401', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const oversized = 'a'.repeat(17 * 1024);
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${oversized}` },
    }));
    expect(res.status).toBe(401);
  });
});

describe('POST /sessions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a session and returns 202, transitions to READY', async () => {
    const registry = new SessionRegistry();
    const { loader, emitPiEvent } = buildFakeLoader();
    const app = buildApp(registry, loader);

    const auth = await getAUTH();
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(CREATE_BODY),
    }));
    expect(res.status).toBe(202);
    const body = await res.json() as { sessionId: string; state: string };
    expect(body.sessionId).toBe(SESSION_ID);
    expect(body.state).toBe('CREATING');

    emitPiEvent({ type: 'ready', sessionId: SESSION_ID });
    await new Promise((r) => setTimeout(r, 20));
    expect(registry.get(SESSION_ID)?.state).toBe('READY');
  });

  it('rejects duplicate sessionId with 409', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);

    await createAndAwaitReady(app);

    const auth = await getAUTH();
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(CREATE_BODY),
    }));
    expect(res.status).toBe(409);
  });

  it('returns 422 on missing required fields', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const auth = await getAUTH();
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ sessionId: '', workspaceId: 'w' }),
    }));
    expect([400, 422]).toContain(res.status);
  });

  it('rejects unsafe sessionId with 400', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const auth = await getAUTH();
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ ...CREATE_BODY, sessionId: '../traversal' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects repositoryId of 0 with 4xx', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const auth = await getAUTH();
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ ...CREATE_BODY, repositoryId: '0' }),
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects repositoryId with leading zeros with 4xx', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const auth = await getAUTH();
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ ...CREATE_BODY, repositoryId: '007' }),
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects workspacePath outside workspaceRoot', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const auth = await getAUTH();
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ ...CREATE_BODY, workspacePath: '/etc' }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when JWT sessionId does not match body sessionId', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const otherId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const token = await mint({ sessionId: otherId });
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(CREATE_BODY),
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when JWT workspaceId does not match body workspaceId', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ workspaceId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' });
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(CREATE_BODY),
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when JWT repositoryId does not match body repositoryId', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ repositoryId: '99999999' });
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(CREATE_BODY),
    }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when same tenant but different workspace', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ workspaceId: '11111111-2222-3333-4444-555555555555' });
    const res = await app.handle(new Request('http://localhost/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(CREATE_BODY),
    }));
    expect(res.status).toBe(403);
  });
});

describe('POST /sessions/:id/prompt', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends prompt to ready session', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createAndAwaitReady(app);

    const auth = await getAUTH();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ message: 'hello', idempotencyKey: 'key-1' }),
    }));
    expect(res.status).toBe(200);
  });

  it('returns 403 when JWT sessionId does not match path', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' });
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'hi', idempotencyKey: 'k1' }),
    }));
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown session', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const otherId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const auth = await getAUTH(otherId);
    const res = await app.handle(new Request(`http://localhost/sessions/${otherId}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ message: 'hi', idempotencyKey: 'k1' }),
    }));
    expect(res.status).toBe(404);
  });
});

describe('POST /sessions/:id/verify', () => {
  it('returns state for existing session', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createAndAwaitReady(app);

    const auth = await getAUTH();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
      headers: auth,
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { alive: boolean; state: string };
    expect(body.alive).toBe(true);
    expect(body.state).toBe('READY');
  });

  it('returns alive:false for unknown session', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const auth = await getAUTH();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
      headers: auth,
    }));
    const body = await res.json() as { alive: boolean };
    expect(body.alive).toBe(false);
  });

  it('returns 403 when JWT sessionId does not match path', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' });
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(403);
  });
});

describe('DELETE /sessions/:id', () => {
  it('deletes an existing session', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createAndAwaitReady(app);

    const auth = await getAUTH();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}`, {
      method: 'DELETE',
      headers: auth,
    }));
    expect(res.status).toBe(204);
    expect(registry.get(SESSION_ID)).toBeUndefined();
  });

  it('returns 404 for unknown session', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const otherId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const auth = await getAUTH(otherId);
    const res = await app.handle(new Request(`http://localhost/sessions/${otherId}`, {
      method: 'DELETE',
      headers: auth,
    }));
    expect(res.status).toBe(404);
  });

  it('returns 403 when JWT sessionId does not match path', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' });
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(403);
  });
});

describe('POST /sessions/:id/abort', () => {
  it('aborts a PROMPTING session and returns READY', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createAndAwaitReady(app);

    const auth = await getAUTH();
    await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ message: 'do a thing', idempotencyKey: 'k-abort-1' }),
    }));

    const abortAuth = await getAUTH();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/abort`, {
      method: 'POST',
      headers: abortAuth,
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { state: string };
    expect(body.state).toBe('READY');
  });

  it('returns 403 when JWT sessionId does not match path', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' });
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/abort`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(403);
  });
});

describe('Idempotency', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects second prompt with same pending idempotency key with 409', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createAndAwaitReady(app);

    const session = registry.get(SESSION_ID);
    expect(session).toBeDefined();
    session!.transition('PROMPTING');
    (session as unknown as { _activeIdempotencyKey: string })._activeIdempotencyKey = 'dup-key';

    const auth = await getAUTH();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ message: 'again', idempotencyKey: 'dup-key' }),
    }));
    expect(res.status).toBe(409);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('returns alreadyCompleted for a completed idempotency key', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createAndAwaitReady(app);

    const session = registry.get(SESSION_ID)!;
    (session as unknown as { _markKeyCompleted(k: string): void })._markKeyCompleted('done-key');

    const auth = await getAUTH();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ message: 'again', idempotencyKey: 'done-key' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { alreadyCompleted: boolean };
    expect(body.alreadyCompleted).toBe(true);
  });
});
