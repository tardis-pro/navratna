import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Elysia from 'elysia';
import { generateKeyPair, exportPKCS8, exportSPKI, SignJWT, importPKCS8 } from 'jose';
import { initJwtVerifyKey, createJwtAuth } from '../../auth/jwt_auth.js';
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

const ALG = 'RS256';
const ISSUER = 'uaip-coding-gateway';
const AUDIENCE = 'uaip-coding-node';

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const WORKSPACE_ID = '22222222-2222-2222-2222-222222222222';
const PROJECT_ID = 'proj-abc';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const TENANT_ID = '44444444-4444-4444-4444-444444444444';
const REPO_ID = '12345678';

let privatePem: string;

beforeAll(async () => {
  const pair = await generateKeyPair(ALG, { modulusLength: 2048 });
  privatePem = await exportPKCS8(pair.privateKey);
  const publicPem = await exportSPKI(pair.publicKey);
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
} = {}): Promise<string> {
  const key = await importPKCS8(privatePem, ALG);
  const now = Math.floor(Date.now() / 1000);
  const expOffset = overrides.expOffset ?? 299;
  const exp = now + expOffset;

  return new SignJWT({
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
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(crypto.randomUUID())
    .sign(key);
}

const CONFIG: CodingNodeConfig = {
  codingNodeJwtPublicKeyPem: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest==\n-----END PUBLIC KEY-----',
  port: 3009,
  host: '127.0.0.1',
  sessionDir: '/tmp/exec-node-coding-events-test',
  replayBufferSize: 200,
  nodeId: 'events-test-node',
  workspaceRoot: '/workspace',
  completedKeyTtlMs: 600_000,
};

function buildFakeLoader(): { loader: PiLoader; emitEvent: (raw: Record<string, unknown>) => void } {
  let capturedListener: AgentSessionEventListener | undefined;
  const fakePair: PiSessionPair = {
    session: {
      prompt: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
      abortBash: vi.fn(),
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => { capturedListener = undefined; };
      }),
    },
    getSessionFile: () => '/tmp/fake-events.jsonl',
  };
  const loader: PiLoader = vi.fn().mockResolvedValue(fakePair);
  return {
    loader,
    emitEvent: (raw) => capturedListener?.(raw as ReturnType<typeof capturedListener extends (e: infer E) => unknown ? (e: E) => E : never>),
  };
}

function buildApp(registry: SessionRegistry, loader: PiLoader) {
  const protectedRoutes = createJwtAuth()
    .use(createSessionRoutes(registry, CONFIG, loader))
    .use(createEventsRoutes(registry));
  return new Elysia()
    .use(createHealthRoutes('events-test-node', () => registry.count()))
    .use(protectedRoutes);
}

async function createReadySession(
  registry: SessionRegistry,
  app: ReturnType<typeof buildApp>,
  sessionId = SESSION_ID,
): Promise<void> {
  const token = await mint({ sessionId });
  await app.handle(new Request('http://localhost/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sessionId,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      userId: USER_ID,
      tenantId: TENANT_ID,
      repositoryId: REPO_ID,
      workspacePath: '/workspace',
    }),
  }));
  await new Promise((r) => setTimeout(r, 20));
}

describe('GET /sessions/:id/events', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 without auth', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/events`));
    expect(res.status).toBe(401);
  });

  it('returns 403 when JWT sessionId does not match path', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const token = await mint({ sessionId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' });
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown session', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    const otherId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const token = await mint({ sessionId: otherId });
    const res = await app.handle(new Request(`http://localhost/sessions/${otherId}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(404);
  });

  it('returns 200 SSE stream for known session', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createReadySession(registry, app);

    const token = await mint();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    res.body?.cancel();
  });

  it('replays buffered events on reconnect with valid Last-Event-ID', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createReadySession(registry, app);

    const session = registry.get(SESSION_ID)!;
    const collected: string[] = [];
    session.subscribe((e) => collected.push(`${e.sessionId}-${e.seq}`));
    session.transition('PROMPTING');

    const token = await mint();
    const res1 = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/events`, {
      headers: { Authorization: `Bearer ${token}`, 'Last-Event-ID': `${SESSION_ID}-0` },
    }));
    expect(res1.status).toBe(200);
    const reader = res1.body!.getReader();

    const firstChunk = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((r) =>
        setTimeout(() => r({ done: true, value: undefined }), 300)
      ),
    ]);
    reader.cancel();
    const text = firstChunk.value ? new TextDecoder().decode(firstChunk.value) : '';

    expect(text).toContain('data:');
    expect(text).toContain(`id: ${SESSION_ID}-`);
  });

  it('ignores Last-Event-ID from a different session', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createReadySession(registry, app);

    const token = await mint();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/events`, {
      headers: { Authorization: `Bearer ${token}`, 'Last-Event-ID': 'other-session-99' },
    }));
    expect(res.status).toBe(200);
    res.body?.cancel();
  });

  it('ignores malformed Last-Event-ID', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createReadySession(registry, app);

    const token = await mint();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/events`, {
      headers: { Authorization: `Bearer ${token}`, 'Last-Event-ID': 'not-a-number' },
    }));
    expect(res.status).toBe(200);
    res.body?.cancel();
  });

  it('SSE response body can be opened and then cancelled without error', async () => {
    const registry = new SessionRegistry();
    const { loader } = buildFakeLoader();
    const app = buildApp(registry, loader);
    await createReadySession(registry, app);

    const token = await mint();
    const res = await app.handle(new Request(`http://localhost/sessions/${SESSION_ID}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull();
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 10));
  });
});
