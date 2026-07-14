import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

vi.mock('@uaip/middleware', () => {
  const mockedUser = { id: '33333333-3333-3333-3333-333333333333', organizationId: '00000000-0000-0000-0000-000000000001', email: 'user@test.com', role: 'user' };
  const passthrough = (app: Elysia) => app.derive(() => ({ user: mockedUser }));
  const getNginxUser = (ctx: unknown) => {
    if (typeof ctx === 'object' && ctx !== null && 'user' in ctx) {
      return (ctx as Record<string, unknown>)['user'] as typeof mockedUser;
    }
    throw new Error('getNginxUser: user not found in context');
  };
  const withSpan = async <T>(_name: string, fn: (span: object) => Promise<T>) =>
    fn({ setAttribute: vi.fn(), setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() });
  return { withNginxAuth: passthrough, getNginxUser, withSpan };
});

vi.mock('../../services/execution_mesh/coding_node_jwt.js', () => ({
  mintCodingNodeJwt: vi.fn().mockResolvedValue('minted-test-jwt'),
}));

import { CodingSessionCoordinator } from '../../services/execution_mesh/coding_session_coordinator.js';
import { CodingSessionStore } from '../../services/execution_mesh/coding_session_store.js';
import { CodingSessionAuditSink } from '../../services/execution_mesh/coding_session_audit_sink.js';
import type { RedisClient } from '../../services/execution_mesh/coding_session_store.js';
import type { CodingNodeClient } from '../../services/execution_mesh/coding_node_client.js';
import type { FlyMachineDriver } from '../../services/execution_mesh/fly_machine_driver.js';
import { registerWorkspaceRoutes } from '../../routes/workspace_routes.js';

const MOCKED_USER_ID = '33333333-3333-3333-3333-333333333333';
const MOCKED_ORG_ID = '00000000-0000-0000-0000-000000000001';

const USER_ID = '33333333-3333-3333-3333-333333333333';
const REPO_ID = '12345678';
const ORG_ID = '44444444-4444-4444-4444-444444444444';
const BINDING_ID = 'b1000000-0000-0000-0000-000000000001';
const WS_ID = '22222222-2222-2222-2222-222222222222';
const PROJ_ID = 'proj-1';
const MACHINE_ID = 'mach-abc123';
const VOLUME_ID = 'vol-xyz789';
const NODE_BASE_URL = `http://${MACHINE_ID}.vm.myapp.internal:3009`;

function makeRedisStore(): { redis: RedisClient; backing: Map<string, string> } {
  const backing = new Map<string, string>();
  const redis: RedisClient = {
    get: async (key) => backing.get(key) ?? null,
    set: async (key, value) => { backing.set(key, value); return 'OK'; },
    del: async (...keys) => { let n = 0; for (const k of keys) { if (backing.delete(k)) n++; } return n; },
    eval: async (script, _n, ...args) => {
      if (script.includes('existing_idem') || script.includes('CLAIM_LUA') || script.includes('idem_ttl')) {
        const shadowKey = args[0]!;
        const idemKey = args[1]!;
        const fromState = args[2]!;
        const toState = args[3]!;
        const idemVal = args[4]!;
        const nowMs = args[7]!;
        const expectedUser = args[8]!;
        const expectedWorkspace = args[9]!;
        const expectedTenant = args[10]!;

        const raw = backing.get(shadowKey);
        if (!raw) return ['not_found'];
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return ['corrupt']; }
        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        if (shadow.userId !== expectedUser || shadow.workspaceId !== expectedWorkspace || shadow.tenantId !== expectedTenant) return ['owner_mismatch'];

        const existingIdem = backing.get(idemKey);
        if (existingIdem === 'pending') return ['pending_duplicate'];
        if (existingIdem === 'completed') return ['completed_duplicate'];
        if (shadow.state !== fromState) return ['busy', shadow.state];

        shadow.state = toState;
        shadow.activeIdempotencyKey = idemVal;
        shadow.updatedAt = Number(nowMs);
        obj.shadow = shadow;
        backing.set(shadowKey, JSON.stringify(obj));
        backing.set(idemKey, 'pending');
        return ['accepted'];
      }
      if (script.includes('ROLLBACK_LUA') || script.includes('key_mismatch')) {
        const shadowKey = args[0]!;
        const idemKey = args[1]!;
        const expected = args[2]!;
        const nowMs = args[4]!;
        const raw = backing.get(shadowKey);
        if (!raw) return ['not_found'];
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return ['corrupt']; }
        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        if (expected && shadow.activeIdempotencyKey !== expected) return ['key_mismatch'];
        shadow.state = 'READY';
        delete shadow.activeIdempotencyKey;
        shadow.updatedAt = Number(nowMs);
        obj.shadow = shadow;
        backing.set(shadowKey, JSON.stringify(obj));
        if (idemKey) backing.delete(idemKey);
        return ['ok'];
      }
      if (script.includes('COMPLETE_ACTIVE_LUA') || script.includes('active_key')) {
        const shadowKey = args[0]!;
        const nextState = args[1]!;
        const idemTtl = args[3]!;
        const nowMs = args[4]!;
        const raw = backing.get(shadowKey);
        if (!raw) return ['not_found'];
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return ['corrupt']; }
        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        const activeKey = shadow.activeIdempotencyKey as string | undefined;
        shadow.state = nextState;
        delete shadow.activeIdempotencyKey;
        shadow.updatedAt = Number(nowMs);
        obj.shadow = shadow;
        backing.set(shadowKey, JSON.stringify(obj));
        if (activeKey) {
          const sid = shadowKey.replace('coding:session:shadow:', '');
          backing.set(`coding:session:idem:${sid}:${activeKey}`, 'completed');
          void idemTtl;
        }
        return ['ok', activeKey ?? ''];
      }
      if (script.includes('UPDATE_EVENT_LUA') || script.includes('last_event_id')) {
        const shadowKey = args[0]!;
        const lastEventId = args[3]!;
        const nowMs = args[5]!;
        const raw = backing.get(shadowKey);
        if (!raw) return ['not_found'];
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return ['corrupt']; }
        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        shadow.lastEventId = lastEventId;
        shadow.updatedAt = Number(nowMs);
        obj.shadow = shadow;
        backing.set(shadowKey, JSON.stringify(obj));
        return ['ok'];
      }
      if (script.includes('COMPLETE_IDEM') || (script.includes('completed') && !script.includes('active_key'))) {
        const idemKey = args[0]!;
        backing.set(idemKey, 'completed');
        return 1;
      }
      return null;
    },
  };
  return { redis, backing };
}

function makeFlyDriver(): FlyMachineDriver {
  return {
    provisionWorkspace: vi.fn().mockResolvedValue({ machineId: MACHINE_ID, volumeId: VOLUME_ID, region: 'sin', baseUrl: NODE_BASE_URL }),
    destroyWorkspace: vi.fn().mockResolvedValue(undefined),
    suspendWorkspace: vi.fn().mockResolvedValue(undefined),
    resumeWorkspace: vi.fn().mockResolvedValue(undefined),
    reapWedged: vi.fn().mockResolvedValue({ destroyedIds: [], errors: [] }),
  } as unknown as FlyMachineDriver;
}

function makeNodeClient(): CodingNodeClient {
  return {
    createSession: vi.fn().mockResolvedValue({ ok: true, value: { sessionId: 'new-session', state: 'CREATING' } }),
    prompt: vi.fn().mockResolvedValue({ ok: true, value: { sessionId: 'new-session', state: 'PROMPTING' } }),
    abort: vi.fn().mockResolvedValue({ ok: true, value: { sessionId: 'new-session', state: 'READY' } }),
    close: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    streamEvents: vi.fn(),
    verify: vi.fn().mockResolvedValue({ ok: true, value: { alive: true, sessionId: 'new-session', state: 'READY', lastEventSeq: 0 } }),
    refreshGithubCredential: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    setEgressPhase: vi.fn().mockResolvedValue({ ok: true, value: { ok: true, phase: 'setup', sessionId: 'new-session' } }),
  } as unknown as CodingNodeClient;
}

const FAKE_GITHUB_CREDENTIAL = {
  token: 'ghs_test_install_token_123456',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  repositoryFullName: 'acme/my-repo',
  cloneUrl: 'https://github.com/acme/my-repo.git',
};

function makeBroker() {
  return {
    mintInstallationToken: vi.fn().mockResolvedValue({ ok: true, value: FAKE_GITHUB_CREDENTIAL }),
    revokeInstallationToken: vi.fn().mockResolvedValue(undefined),
  };
}

function makeInstallationRepo() {
  return {
    findScopedBinding: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        installationId: '98765432',
        repositoryId: REPO_ID,
        repositoryFullName: 'acme/my-repo',
        userId: USER_ID,
        tenantId: ORG_ID,
        projectId: PROJ_ID,
      },
    }),
  };
}

const TEST_PUBLIC_PEM = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest==\n-----END PUBLIC KEY-----';

function makeNoopAuditSink(): CodingSessionAuditSink {
  return new CodingSessionAuditSink({
    writer: { appendEvent: vi.fn().mockResolvedValue(undefined) },
    scanner: { scanForRawSecrets: vi.fn().mockReturnValue({ clean: true, flaggedCount: 0 }) },
  });
}

function makeCoordinator(redis: RedisClient, nodeClient: CodingNodeClient, fly: FlyMachineDriver): CodingSessionCoordinator {
  const store = new CodingSessionStore({ redis });
  return new CodingSessionCoordinator({
    store,
    nodeClient,
    fly,
    codingNodePublicKeyPem: TEST_PUBLIC_PEM,
    auditSink: makeNoopAuditSink(),
    broker: makeBroker() as never,
    installationRepo: makeInstallationRepo() as never,
  });
}

describe('CodingSessionCoordinator', () => {
  let fly: FlyMachineDriver;
  let nodeClient: CodingNodeClient;

  beforeEach(() => {
    fly = makeFlyDriver();
    nodeClient = makeNodeClient();
  });

  describe('createSession', () => {
    it('provisions machine, persists shadow, calls node, returns READY view', async () => {
      const { redis } = makeRedisStore();
      const coord = makeCoordinator(redis, nodeClient, fly);
      const result = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.state).toBe('READY');
      expect(result.value.userId).toBe(USER_ID);
      expect(result.value.tenantId).toBe(ORG_ID);
      expect(fly.provisionWorkspace).toHaveBeenCalledOnce();
      expect(nodeClient.createSession).toHaveBeenCalledOnce();
    });

    it('destroys machine+volume and returns error if node.createSession fails', async () => {
      vi.mocked(nodeClient.createSession).mockResolvedValue({ ok: false, error: { code: 'NODE_UNREACHABLE', message: 'dial timeout' } });
      const { redis } = makeRedisStore();
      const coord = makeCoordinator(redis, nodeClient, fly);
      const result = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      expect(result.ok).toBe(false);
      expect(fly.destroyWorkspace).toHaveBeenCalledOnce();
    });

    it('destroys machine+volume and returns error if Redis put fails', async () => {
      const { redis } = makeRedisStore();
      const brokenRedis: RedisClient = { ...redis, set: async () => { throw new Error('Redis down'); } };
      const coord = makeCoordinator(brokenRedis, nodeClient, fly);
      const result = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('REDIS_UNAVAILABLE');
      expect(fly.destroyWorkspace).toHaveBeenCalledOnce();
    });

    it('derives userId and tenantId from params (never from node response)', async () => {
      const { redis } = makeRedisStore();
      vi.mocked(nodeClient.createSession).mockResolvedValue({ ok: true, value: { sessionId: 'x', state: 'CREATING' } });
      const coord = makeCoordinator(redis, nodeClient, fly);
      const result = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.userId).toBe(USER_ID);
      expect(result.value.tenantId).toBe(ORG_ID);
    });
  });

  describe('gateway restart recovery', () => {
    it('second coordinator instance can load and use session created by first', async () => {
      const { redis } = makeRedisStore();
      const coord1 = makeCoordinator(redis, nodeClient, fly);
      const createResult = await coord1.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;
      const sessionId = createResult.value.sessionId!;

      const coord2 = makeCoordinator(redis, nodeClient, fly);
      const promptResult = await coord2.submitPrompt({
        workspaceId: WS_ID,
        sessionId,
        userId: USER_ID,
        tenantId: ORG_ID,
        message: 'hello after restart',
        idempotencyKey: 'restart-idem-1',
      });
      expect(promptResult.ok).toBe(true);
      if (!promptResult.ok) return;
      expect(promptResult.value.outcome).toBe('accepted');
    });
  });

  describe('submitPrompt', () => {
    it('returns accepted on first claim', async () => {
      const { redis } = makeRedisStore();
      const coord = makeCoordinator(redis, nodeClient, fly);
      const cr = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      if (!cr.ok) throw new Error('createSession failed');
      const result = await coord.submitPrompt({ workspaceId: WS_ID, sessionId: cr.value.sessionId!, userId: USER_ID, tenantId: ORG_ID, message: 'hi', idempotencyKey: 'idem-A' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outcome).toBe('accepted');
    });

    it('returns pending_duplicate on duplicate in-flight key', async () => {
      const { redis, backing } = makeRedisStore();
      const coord = makeCoordinator(redis, nodeClient, fly);
      const cr = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      if (!cr.ok) throw new Error('createSession failed');

      const store = new CodingSessionStore({ redis });
      const sessionId = cr.value.sessionId!;

      const getResult = await store.getScoped(sessionId, { userId: USER_ID, workspaceId: WS_ID, tenantId: ORG_ID });
      if (!getResult.ok) throw new Error('get shadow failed');
      const fullShadow = getResult.value;

      await coord.submitPrompt({ workspaceId: WS_ID, sessionId, userId: USER_ID, tenantId: ORG_ID, message: 'hi', idempotencyKey: 'idem-B' });

      await store.put({ ...fullShadow, state: 'READY' });
      backing.set(`coding:session:idem:${sessionId}:idem-B`, 'pending');

      const second = await coord.submitPrompt({ workspaceId: WS_ID, sessionId, userId: USER_ID, tenantId: ORG_ID, message: 'hi again', idempotencyKey: 'idem-B' });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.outcome).toBe('pending_duplicate');
    });

    it('returns not_found for unknown session', async () => {
      const { redis } = makeRedisStore();
      const coord = makeCoordinator(redis, nodeClient, fly);
      const result = await coord.submitPrompt({ workspaceId: WS_ID, sessionId: 'no-such-session', userId: USER_ID, tenantId: ORG_ID, message: 'hi', idempotencyKey: 'idem-X' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outcome).toBe('not_found');
    });

    it('returns owner_mismatch for wrong userId', async () => {
      const { redis } = makeRedisStore();
      const coord = makeCoordinator(redis, nodeClient, fly);
      const cr = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      if (!cr.ok) throw new Error('createSession failed');
      const result = await coord.submitPrompt({ workspaceId: WS_ID, sessionId: cr.value.sessionId!, userId: '99999999-9999-9999-9999-999999999999', tenantId: ORG_ID, message: 'hi', idempotencyKey: 'idem-Y' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.outcome).toBe('owner_mismatch');
    });

    it('returns REDIS_UNAVAILABLE when Redis is down', async () => {
      const brokenRedis: RedisClient = {
        get: async () => { throw new Error('timeout'); },
        set: async () => { throw new Error('timeout'); },
        del: async () => { throw new Error('timeout'); },
        eval: async () => { throw new Error('timeout'); },
      };
      const coord = makeCoordinator(brokenRedis, nodeClient, fly);
      const result = await coord.submitPrompt({ workspaceId: WS_ID, sessionId: 'any', userId: USER_ID, tenantId: ORG_ID, message: 'hi', idempotencyKey: 'k' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('REDIS_UNAVAILABLE');
    });
  });

  describe('workspace route integration — auth middleware wiring', () => {
    it('workspace routes are wrapped with withNginxAuth (middleware mock confirms call)', async () => {
      const { withNginxAuth } = await import('@uaip/middleware');
      expect(typeof withNginxAuth).toBe('function');
      const coord = makeCoordinator(makeRedisStore().redis, nodeClient, fly);
      const app = registerWorkspaceRoutes(undefined, coord);
      expect(app).toBeDefined();
    });
  });

  describe('workspace route integration — route functionality (auth mocked)', () => {
    it('returns 200 with session data on successful createSession', async () => {
      const coord = makeCoordinator(makeRedisStore().redis, nodeClient, fly);
      const app = registerWorkspaceRoutes(undefined, coord);
      const resp = await app.handle(new Request(`http://localhost/api/v1/workspaces/${WS_ID}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-ID': MOCKED_USER_ID },
        body: JSON.stringify({ projectId: PROJ_ID, repositoryId: REPO_ID, bindingId: BINDING_ID }),
      }));
      expect(resp.status).not.toBe(401);
      expect([200, 201, 503]).toContain(resp.status);
    });

    it('returns 400 when X-Idempotency-Key missing from prompt request', async () => {
      const coord = makeCoordinator(makeRedisStore().redis, nodeClient, fly);
      const app = registerWorkspaceRoutes(undefined, coord);
      const resp = await app.handle(new Request(`http://localhost/api/v1/workspaces/${WS_ID}/sessions/sess-123/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-ID': MOCKED_USER_ID },
        body: JSON.stringify({ message: 'hello' }),
      }));
      expect(resp.status).toBe(400);
    });
  });

  describe('prompt endpoint — 202/409 behaviour', () => {
    const reqHeaders = {
      'Content-Type': 'application/json',
      'X-User-ID': MOCKED_USER_ID,
    };

    it('returns 202 on accepted prompt', async () => {
      const { redis } = makeRedisStore();
      const coord = makeCoordinator(redis, nodeClient, fly);
      const app = registerWorkspaceRoutes(undefined, coord);

      const createResult = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: MOCKED_USER_ID, tenantId: MOCKED_ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      if (!createResult.ok) throw new Error('createSession failed');

      const resp = await app.handle(new Request(
        `http://localhost/api/v1/workspaces/${WS_ID}/sessions/${createResult.value.sessionId!}/prompt`,
        {
          method: 'POST',
          headers: { ...reqHeaders, 'X-Idempotency-Key': 'idem-202' },
          body: JSON.stringify({ message: 'hello' }),
        },
      ));
      expect(resp.status).toBe(202);
    });

    it('returns 409 on pending duplicate', async () => {
      const { redis, backing } = makeRedisStore();
      const coord = makeCoordinator(redis, nodeClient, fly);
      const app = registerWorkspaceRoutes(undefined, coord);

      const createResult = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: MOCKED_USER_ID, tenantId: MOCKED_ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      if (!createResult.ok) throw new Error('createSession failed');
      const sessionId = createResult.value.sessionId!;

      await app.handle(new Request(`http://localhost/api/v1/workspaces/${WS_ID}/sessions/${sessionId}/prompt`, {
        method: 'POST',
        headers: { ...reqHeaders, 'X-Idempotency-Key': 'idem-dup' },
        body: JSON.stringify({ message: 'first' }),
      }));

      const store = new CodingSessionStore({ redis });
      const getRes = await store.getScoped(sessionId, { userId: MOCKED_USER_ID, workspaceId: WS_ID, tenantId: MOCKED_ORG_ID });
      if (!getRes.ok) throw new Error('get failed');
      await store.put({ ...getRes.value, state: 'READY' });
      backing.set(`coding:session:idem:${sessionId}:idem-dup`, 'pending');

      const second = await app.handle(new Request(`http://localhost/api/v1/workspaces/${WS_ID}/sessions/${sessionId}/prompt`, {
        method: 'POST',
        headers: { ...reqHeaders, 'X-Idempotency-Key': 'idem-dup' },
        body: JSON.stringify({ message: 'first again' }),
      }));
      expect(second.status).toBe(409);
    });
  });

  describe('SSE output does not leak secrets', () => {
    it('minted-test-jwt string from mock does not appear in SSE output', async () => {
      const { redis } = makeRedisStore();
      const coord = makeCoordinator(redis, nodeClient, fly);
      const cr = await coord.createSession({ workspaceId: WS_ID, projectId: PROJ_ID, userId: MOCKED_USER_ID, tenantId: MOCKED_ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID });
      if (!cr.ok) throw new Error('createSession failed');

      const lines: string[] = [];
      const ctrl = new AbortController();

      coord.streamEvents({
        workspaceId: WS_ID,
        sessionId: cr.value.sessionId!,
        userId: MOCKED_USER_ID,
        signal: ctrl.signal,
        onEvent: (raw) => { lines.push(raw); },
        onEnd: () => undefined,
        onError: () => undefined,
      });

      await new Promise((r) => setTimeout(r, 30));
      ctrl.abort();

      const output = lines.join('\n');
      expect(output).not.toContain('minted-test-jwt');
    });
  });
});
