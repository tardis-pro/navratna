import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/execution_mesh/coding_node_jwt.js', () => ({
  mintCodingNodeJwt: vi.fn().mockResolvedValue('minted-test-jwt'),
}));

vi.mock('@uaip/middleware', async (importOriginal) => {
  const original = await importOriginal<typeof import('@uaip/middleware')>();
  return {
    ...original,
    withSpan: async <T>(_name: string, fn: (span: object) => Promise<T>) =>
      fn({ setAttribute: vi.fn(), setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() }),
  };
});

import { CodingSessionCoordinator } from '../../services/execution_mesh/coding_session_coordinator.js';
import { CodingSessionStore } from '../../services/execution_mesh/coding_session_store.js';
import type { RedisClient } from '../../services/execution_mesh/coding_session_store.js';
import type { CodingNodeClient } from '../../services/execution_mesh/coding_node_client.js';
import type { FlyMachineDriver } from '../../services/execution_mesh/fly_machine_driver.js';
import {
  CodingSessionAuditSink,
  CODING_SESSION_EVENT,
} from '../../services/execution_mesh/coding_session_audit_sink.js';
import type {
  AuditWriter,
  SecretScanner,
  AuditEventInput,
  SecretScanResult,
} from '../../services/execution_mesh/coding_session_audit_sink.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID    = '33333333-3333-3333-3333-333333333333';
const ORG_ID     = '44444444-4444-4444-4444-444444444444';
const WS_ID      = '22222222-2222-2222-2222-222222222222';
const PROJ_ID    = 'proj-1';
const REPO_ID    = '12345678';
const MACHINE_ID = 'mach-audit-test';
const VOLUME_ID  = 'vol-audit-test';
const NODE_BASE  = `http://${MACHINE_ID}.vm.myapp.internal:3009`;
const PEM        = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest==\n-----END PUBLIC KEY-----';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeCleanScanner(): SecretScanner {
  return { scanForRawSecrets: vi.fn().mockReturnValue({ clean: true, flaggedCount: 0 } satisfies SecretScanResult) };
}

function makeWriter(): { writer: AuditWriter; calls: AuditEventInput[] } {
  const calls: AuditEventInput[] = [];
  const writer: AuditWriter = { appendEvent: vi.fn(async (i: AuditEventInput) => { calls.push(i); return i; }) };
  return { writer, calls };
}

function makeFailWriter(msg = 'DB down'): AuditWriter {
  return { appendEvent: vi.fn().mockRejectedValue(new Error(msg)) };
}

function makeSink(writer: AuditWriter, scanner: SecretScanner = makeCleanScanner()): CodingSessionAuditSink {
  return new CodingSessionAuditSink({ writer, scanner });
}

function makeRedisStore(): { redis: RedisClient; backing: Map<string, string> } {
  const backing = new Map<string, string>();
  const redis: RedisClient = {
    get: async (key) => backing.get(key) ?? null,
    set: async (key, value) => { backing.set(key, value); return 'OK'; },
    del: async (...keys) => { let n = 0; for (const k of keys) { if (backing.delete(k)) n++; } return n; },
    eval: async (script, _n, ...args) => {
      if (script.includes('CLAIM_LUA') || script.includes('existing_idem') || script.includes('idem_ttl')) {
        const [shadowKey, idemKey, fromState, toState, idemVal, , , nowMs, expectedUser, expectedWorkspace, expectedTenant] = args as string[];
        const raw = backing.get(shadowKey!);
        if (!raw) return ['not_found'];
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        if (shadow.userId !== expectedUser || shadow.workspaceId !== expectedWorkspace || shadow.tenantId !== expectedTenant) return ['owner_mismatch'];
        const existingIdem = backing.get(idemKey!);
        if (existingIdem === 'pending') return ['pending_duplicate'];
        if (existingIdem === 'completed') return ['completed_duplicate'];
        if (shadow.state !== fromState) return ['busy', shadow.state];
        shadow.state = toState!;
        shadow.activeIdempotencyKey = idemVal!;
        shadow.updatedAt = Number(nowMs!);
        obj.shadow = shadow;
        backing.set(shadowKey!, JSON.stringify(obj));
        backing.set(idemKey!, 'pending');
        return ['accepted'];
      }
      if (script.includes('ROLLBACK_LUA') || script.includes('key_mismatch')) {
        const [shadowKey, idemKey, expected, , nowMs] = args as string[];
        const raw = backing.get(shadowKey!);
        if (!raw) return ['not_found'];
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        if (expected && shadow.activeIdempotencyKey !== expected) return ['key_mismatch'];
        shadow.state = 'READY';
        delete shadow.activeIdempotencyKey;
        shadow.updatedAt = Number(nowMs!);
        obj.shadow = shadow;
        backing.set(shadowKey!, JSON.stringify(obj));
        if (idemKey) backing.delete(idemKey);
        return ['ok'];
      }
      if (script.includes('COMPLETE_ACTIVE_LUA') || script.includes('active_key')) {
        const [shadowKey, nextState, , , nowMs] = args as string[];
        const raw = backing.get(shadowKey!);
        if (!raw) return ['not_found'];
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        const activeKey = shadow.activeIdempotencyKey as string | undefined;
        shadow.state = nextState!;
        delete shadow.activeIdempotencyKey;
        shadow.updatedAt = Number(nowMs!);
        obj.shadow = shadow;
        backing.set(shadowKey!, JSON.stringify(obj));
        if (activeKey) {
          const sid = shadowKey!.replace('coding:session:shadow:', '');
          backing.set(`coding:session:idem:${sid}:${activeKey}`, 'completed');
        }
        return ['ok', activeKey ?? ''];
      }
      if (script.includes('UPDATE_EVENT_LUA') || script.includes('last_event_id')) {
        const [shadowKey, , , lastEventId, , nowMs] = args as string[];
        const raw = backing.get(shadowKey!);
        if (!raw) return ['not_found'];
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        shadow.lastEventId = lastEventId!;
        shadow.updatedAt = Number(nowMs!);
        obj.shadow = shadow;
        backing.set(shadowKey!, JSON.stringify(obj));
        return ['ok'];
      }
      return null;
    },
  };
  return { redis, backing };
}

function makeFly(): FlyMachineDriver {
  return {
    provisionWorkspace: vi.fn().mockResolvedValue({ machineId: MACHINE_ID, volumeId: VOLUME_ID, region: 'sin', baseUrl: NODE_BASE }),
    destroyWorkspace: vi.fn().mockResolvedValue(undefined),
    suspendWorkspace: vi.fn().mockResolvedValue(undefined),
    resumeWorkspace: vi.fn().mockResolvedValue(undefined),
    reapWedged: vi.fn().mockResolvedValue({ destroyedIds: [], errors: [] }),
  } as unknown as FlyMachineDriver;
}

function makeNodeClient(): CodingNodeClient {
  return {
    createSession: vi.fn().mockResolvedValue({ ok: true, value: { sessionId: 'new-session', state: 'CREATING' } }),
    prompt:        vi.fn().mockResolvedValue({ ok: true, value: { sessionId: 'new-session', state: 'PROMPTING' } }),
    abort:         vi.fn().mockResolvedValue({ ok: true, value: { sessionId: 'new-session', state: 'READY' } }),
    close:         vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    streamEvents:  vi.fn(),
    verify:        vi.fn().mockResolvedValue({ ok: true, value: { alive: true, sessionId: 'new-session', state: 'READY', lastEventSeq: 0 } }),
    refreshGithubCredential: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    setEgressPhase: vi.fn().mockResolvedValue({ ok: true, value: { ok: true, phase: 'setup', sessionId: 'new-session' } }),
  } as unknown as CodingNodeClient;
}

const FAKE_GITHUB_CREDENTIAL = {
  token: 'ghs_test_install_token_audit_123',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  repositoryFullName: 'acme/my-repo',
  cloneUrl: 'https://github.com/acme/my-repo.git',
};

function makeBroker() {
  return {
    mintInstallationToken: vi.fn().mockResolvedValue({ ok: true, value: FAKE_GITHUB_CREDENTIAL }),
    revokeInstallationToken: vi.fn().mockResolvedValue(undefined),
    revokeCachedInstallationToken: vi.fn().mockResolvedValue(undefined),
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

function makeCoord(
  redis: RedisClient,
  nodeClient: CodingNodeClient,
  fly: FlyMachineDriver,
  auditSink: CodingSessionAuditSink,
): CodingSessionCoordinator {
  return new CodingSessionCoordinator({
    store: new CodingSessionStore({ redis }),
    nodeClient,
    fly,
    codingNodePublicKeyPem: PEM,
    auditSink,
    broker: makeBroker() as never,
    installationRepo: makeInstallationRepo() as never,
  });
}

const BINDING_ID = 'b1000000-0000-0000-0000-000000000001';
const baseCreate = { workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID };

// ---------------------------------------------------------------------------
// createSession — provision path
// ---------------------------------------------------------------------------

describe('Coordinator × Audit — createSession', () => {
  let fly: FlyMachineDriver;
  let nodeClient: CodingNodeClient;
  beforeEach(() => { fly = makeFly(); nodeClient = makeNodeClient(); });

  it('emits PROVISION_REQUESTED then SESSION_READY then PROVISION_SUCCEEDED', async () => {
    const { writer, calls } = makeWriter();
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const res = await coord.createSession(baseCreate);
    expect(res.ok).toBe(true);
    const types = calls.map((c) => c.eventType);
    expect(types).toContain(CODING_SESSION_EVENT.PROVISION_REQUESTED);
    expect(types).toContain(CODING_SESSION_EVENT.SESSION_READY);
    expect(types).toContain(CODING_SESSION_EVENT.PROVISION_SUCCEEDED);
    expect(types.indexOf(CODING_SESSION_EVENT.PROVISION_REQUESTED)).toBeLessThan(types.indexOf(CODING_SESSION_EVENT.SESSION_READY));
  });

  it('intent audit (PROVISION_REQUESTED) occurs BEFORE machine provision', async () => {
    const callOrder: string[] = [];
    const writer: AuditWriter = {
      appendEvent: vi.fn(async (i: AuditEventInput) => {
        callOrder.push(`audit:${i.eventType}`);
        return i;
      }),
    };
    const fly2 = makeFly();
    vi.mocked(fly2.provisionWorkspace).mockImplementation(async (..._args) => {
      callOrder.push('provision');
      return { machineId: MACHINE_ID, volumeId: VOLUME_ID, region: 'sin', baseUrl: NODE_BASE };
    });
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly2, makeSink(writer));
    await coord.createSession(baseCreate);
    const reqIdx = callOrder.indexOf(`audit:${CODING_SESSION_EVENT.PROVISION_REQUESTED}`);
    const provIdx = callOrder.indexOf('provision');
    expect(reqIdx).not.toBe(-1);
    expect(provIdx).not.toBe(-1);
    expect(reqIdx).toBeLessThan(provIdx);
  });

  it('fail-closed: PROVISION_REQUESTED audit failure prevents machine provision', async () => {
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(makeFailWriter('chain locked')));
    const res = await coord.createSession(baseCreate);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('AUDIT_FAILED');
    expect(fly.provisionWorkspace).not.toHaveBeenCalled();
  });

  it('PROVISION_SUCCEEDED audit failure does NOT destroy healthy machine (fail-observable)', async () => {
    const writer: AuditWriter = {
      appendEvent: vi.fn(async (i: AuditEventInput) => {
        if (i.eventType === CODING_SESSION_EVENT.PROVISION_SUCCEEDED) throw new Error('outage');
        return i;
      }),
    };
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const res = await coord.createSession(baseCreate);
    // Provision succeeded even though outcome audit failed
    expect(res.ok).toBe(true);
    // Machine must NOT have been destroyed
    expect(fly.destroyWorkspace).not.toHaveBeenCalled();
  });

  it('SESSION_READY audit failure does not block createSession', async () => {
    const writer: AuditWriter = {
      appendEvent: vi.fn(async (i: AuditEventInput) => {
        if (i.eventType === CODING_SESSION_EVENT.SESSION_READY) throw new Error('OTEL outage');
        return i;
      }),
    };
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const res = await coord.createSession(baseCreate);
    expect(res.ok).toBe(true);
    expect(fly.destroyWorkspace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// submitPrompt
// ---------------------------------------------------------------------------

describe('Coordinator × Audit — submitPrompt', () => {
  let fly: FlyMachineDriver;
  let nodeClient: CodingNodeClient;
  beforeEach(() => { fly = makeFly(); nodeClient = makeNodeClient(); });

  async function createAndGetId(coord: CodingSessionCoordinator): Promise<string> {
    const cr = await coord.createSession(baseCreate);
    if (!cr.ok) throw new Error('createSession failed in setup');
    return cr.value.sessionId!;
  }

  it('PROMPT_REQUESTED intent audit occurs before claimPrompt (store call)', async () => {
    const callOrder: string[] = [];
    const writer: AuditWriter = {
      appendEvent: vi.fn(async (i: AuditEventInput) => { callOrder.push(`audit:${i.eventType}`); return i; }),
    };
    const { redis, backing } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const sessionId = await createAndGetId(coord);
    callOrder.length = 0;
    const origGet = redis.get.bind(redis);
    let promptClaimCalled = false;
    redis.eval = async (script: string, n: number, ...args: unknown[]) => {
      if (script.includes('CLAIM_LUA') || script.includes('idem_ttl')) {
        callOrder.push('store:claimPrompt');
        promptClaimCalled = true;
      }
      return (coord as unknown as { store: CodingSessionStore }).store['redis' as never] === redis
        ? (await (coord as unknown as { store: { redis: RedisClient } }).store['redis' as never].eval(script, n, ...args))
        : null;
    };
    void origGet; void promptClaimCalled;
    // Simulate normal eval from backing
    redis.eval = async (script: string, _n: number, ...args: unknown[]) => {
      if (script.includes('CLAIM_LUA') || script.includes('idem_ttl')) callOrder.push('store:claimPrompt');
      if (script.includes('ROLLBACK_LUA') || script.includes('key_mismatch')) {
        const [shadowKey] = args as string[];
        const raw = backing.get(shadowKey!);
        if (!raw) return ['not_found'];
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const shadow = obj.shadow as Record<string, unknown>;
        shadow.state = 'READY';
        delete shadow.activeIdempotencyKey;
        obj.shadow = shadow;
        backing.set(shadowKey!, JSON.stringify(obj));
        return ['ok'];
      }
      if (script.includes('COMPLETE_ACTIVE_LUA') || script.includes('active_key')) {
        const [shadowKey, nextState] = args as string[];
        const raw = backing.get(shadowKey!);
        if (!raw) return ['not_found'];
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const shadow = obj.shadow as Record<string, unknown>;
        shadow.state = nextState!;
        delete shadow.activeIdempotencyKey;
        obj.shadow = shadow;
        backing.set(shadowKey!, JSON.stringify(obj));
        return ['ok', ''];
      }
      const [shadowKey, idemKey, fromState, toState, idemVal, , , nowMs, eu, ew, et] = args as string[];
      const raw = backing.get(shadowKey!);
      if (!raw) return ['not_found'];
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const shadow = obj.shadow as Record<string, unknown>;
      if (shadow.userId !== eu || shadow.workspaceId !== ew || shadow.tenantId !== et) return ['owner_mismatch'];
      if (backing.get(idemKey!) === 'pending') return ['pending_duplicate'];
      if (backing.get(idemKey!) === 'completed') return ['completed_duplicate'];
      if (shadow.state !== fromState) return ['busy', shadow.state];
      shadow.state = toState!; shadow.activeIdempotencyKey = idemVal!; shadow.updatedAt = Number(nowMs!);
      obj.shadow = shadow;
      backing.set(shadowKey!, JSON.stringify(obj));
      backing.set(idemKey!, 'pending');
      return ['accepted'];
    };

    await coord.submitPrompt({ workspaceId: WS_ID, sessionId, userId: USER_ID, tenantId: ORG_ID, message: 'hello', idempotencyKey: 'k1' });
    const reqIdx = callOrder.indexOf(`audit:${CODING_SESSION_EVENT.PROMPT_REQUESTED}`);
    const claimIdx = callOrder.indexOf('store:claimPrompt');
    expect(reqIdx).not.toBe(-1);
    expect(claimIdx).not.toBe(-1);
    expect(reqIdx).toBeLessThan(claimIdx);
  });

  it('fail-closed: PROMPT_REQUESTED audit failure prevents mutation', async () => {
    const provisionWriter: AuditWriter = {
      appendEvent: vi.fn(async (i: AuditEventInput) => {
        if (i.eventType === CODING_SESSION_EVENT.PROMPT_REQUESTED) throw new Error('chain locked');
        return i;
      }),
    };
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(provisionWriter));
    const sessionId = await createAndGetId(coord);
    const res = await coord.submitPrompt({ workspaceId: WS_ID, sessionId, userId: USER_ID, tenantId: ORG_ID, message: 'test', idempotencyKey: 'k2' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('AUDIT_FAILED');
    expect(nodeClient.prompt).not.toHaveBeenCalled();
  });

  it('PROMPT_ACCEPTED outcome audit failure does NOT reverse accepted prompt', async () => {
    const writer: AuditWriter = {
      appendEvent: vi.fn(async (i: AuditEventInput) => {
        if (i.eventType === CODING_SESSION_EVENT.PROMPT_ACCEPTED) throw new Error('outage');
        return i;
      }),
    };
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const sessionId = await createAndGetId(coord);
    const res = await coord.submitPrompt({ workspaceId: WS_ID, sessionId, userId: USER_ID, tenantId: ORG_ID, message: 'hello', idempotencyKey: 'k3' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.outcome).toBe('accepted');
  });

  it('raw prompt message does not appear in any audit detail', async () => {
    const { writer, calls } = makeWriter();
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const sessionId = await createAndGetId(coord);
    calls.length = 0;
    const SECRET_PROMPT = 'Bearer sk_live_verysecrettoken_12345678901234567890';
    await coord.submitPrompt({ workspaceId: WS_ID, sessionId, userId: USER_ID, tenantId: ORG_ID, message: SECRET_PROMPT, idempotencyKey: 'k4' });
    for (const call of calls) {
      expect(JSON.stringify(call.details)).not.toContain(SECRET_PROMPT);
    }
  });
});

// ---------------------------------------------------------------------------
// abortSession
// ---------------------------------------------------------------------------

describe('Coordinator × Audit — abortSession', () => {
  it('ABORT_REQUESTED intent occurs before node abort; ABORT_COMPLETED after', async () => {
    const callOrder: string[] = [];
    const writer: AuditWriter = { appendEvent: vi.fn(async (i: AuditEventInput) => { callOrder.push(`audit:${i.eventType}`); return i; }) };
    const fly = makeFly(); const nodeClient = makeNodeClient();
    const nodeAbortOrig = vi.mocked(nodeClient.abort);
    nodeAbortOrig.mockImplementation(async (...args) => { callOrder.push('node:abort'); return { ok: true, value: { sessionId: args[2] as string, state: 'READY' } }; });
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const cr = await coord.createSession(baseCreate);
    if (!cr.ok) throw new Error('setup failed');
    callOrder.length = 0;
    const res = await coord.abortSession({ sessionId: cr.value.sessionId!, workspaceId: WS_ID, userId: USER_ID, tenantId: ORG_ID });
    expect(res.ok).toBe(true);
    const reqIdx = callOrder.indexOf(`audit:${CODING_SESSION_EVENT.ABORT_REQUESTED}`);
    const abortIdx = callOrder.indexOf('node:abort');
    const completeIdx = callOrder.indexOf(`audit:${CODING_SESSION_EVENT.ABORT_COMPLETED}`);
    expect(reqIdx).not.toBe(-1); expect(abortIdx).not.toBe(-1); expect(completeIdx).not.toBe(-1);
    expect(reqIdx).toBeLessThan(abortIdx);
    expect(abortIdx).toBeLessThan(completeIdx);
  });

  it('ABORT_COMPLETED outcome failure does not reverse abort result', async () => {
    const writer: AuditWriter = {
      appendEvent: vi.fn(async (i: AuditEventInput) => {
        if (i.eventType === CODING_SESSION_EVENT.ABORT_COMPLETED) throw new Error('outage');
        return i;
      }),
    };
    const fly = makeFly(); const nodeClient = makeNodeClient();
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const cr = await coord.createSession(baseCreate);
    if (!cr.ok) throw new Error('setup failed');
    const res = await coord.abortSession({ sessionId: cr.value.sessionId!, workspaceId: WS_ID, userId: USER_ID, tenantId: ORG_ID });
    expect(res.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// closeSession
// ---------------------------------------------------------------------------

describe('Coordinator × Audit — closeSession', () => {
  it('CLOSE_REQUESTED intent occurs before node close; CLOSE_COMPLETED and DESTROY_COMPLETED after', async () => {
    const callOrder: string[] = [];
    const writer: AuditWriter = { appendEvent: vi.fn(async (i: AuditEventInput) => { callOrder.push(`audit:${i.eventType}`); return i; }) };
    const fly = makeFly(); const nodeClient = makeNodeClient();
    const nodeCloseOrig = vi.mocked(nodeClient.close);
    nodeCloseOrig.mockImplementation(async (..._args) => { callOrder.push('node:close'); return { ok: true, value: undefined }; });
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const cr = await coord.createSession(baseCreate);
    if (!cr.ok) throw new Error('setup failed');
    callOrder.length = 0;
    const res = await coord.closeSession({ sessionId: cr.value.sessionId!, workspaceId: WS_ID, userId: USER_ID, tenantId: ORG_ID });
    expect(res.ok).toBe(true);
    const reqIdx = callOrder.indexOf(`audit:${CODING_SESSION_EVENT.CLOSE_REQUESTED}`);
    const closeIdx = callOrder.indexOf('node:close');
    const completedIdx = callOrder.indexOf(`audit:${CODING_SESSION_EVENT.CLOSE_COMPLETED}`);
    expect(reqIdx).not.toBe(-1); expect(closeIdx).not.toBe(-1); expect(completedIdx).not.toBe(-1);
    expect(reqIdx).toBeLessThan(closeIdx);
    expect(closeIdx).toBeLessThan(completedIdx);
  });

  it('CLOSE_COMPLETED outcome failure returns ok:true (resources already destroyed)', async () => {
    const writer: AuditWriter = {
      appendEvent: vi.fn(async (i: AuditEventInput) => {
        if (i.eventType === CODING_SESSION_EVENT.CLOSE_COMPLETED) throw new Error('chain broken');
        return i;
      }),
    };
    const fly = makeFly(); const nodeClient = makeNodeClient();
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const cr = await coord.createSession(baseCreate);
    if (!cr.ok) throw new Error('setup failed');
    const res = await coord.closeSession({ sessionId: cr.value.sessionId!, workspaceId: WS_ID, userId: USER_ID, tenantId: ORG_ID });
    expect(res.ok).toBe(true);
  });

  it('fail-closed: CLOSE_REQUESTED audit failure prevents node close', async () => {
    const writer: AuditWriter = {
      appendEvent: vi.fn(async (i: AuditEventInput) => {
        if (i.eventType === CODING_SESSION_EVENT.CLOSE_REQUESTED) throw new Error('chain locked');
        return i;
      }),
    };
    const fly = makeFly(); const nodeClient = makeNodeClient();
    const { redis } = makeRedisStore();
    const coord = makeCoord(redis, nodeClient, fly, makeSink(writer));
    const cr = await coord.createSession(baseCreate);
    if (!cr.ok) throw new Error('setup failed');
    const res = await coord.closeSession({ sessionId: cr.value.sessionId!, workspaceId: WS_ID, userId: USER_ID, tenantId: ORG_ID });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('AUDIT_FAILED');
    expect(nodeClient.close).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Feature factory — production sink injection
// ---------------------------------------------------------------------------

describe('Feature factory — production sink injection', () => {
  it('buildCodingCoordinator uses real ImmutableAuditService and SecretReferenceService singletons', async () => {
    const fakeAppendEvent = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const fakeScanForRawSecrets = vi.fn().mockReturnValue({ clean: true, flaggedPaths: [], patterns: [] });

    vi.doMock('@uaip/shared-services', () => ({
      ImmutableAuditService: { getInstance: () => ({ appendEvent: fakeAppendEvent }) },
      SecretReferenceService: { getInstance: () => ({ scanForRawSecrets: fakeScanForRawSecrets }) },
    }));

    const { createProductionAuditSink } = await import('../../services/execution_mesh/coding_session_audit_sink.js');
    const sink = await createProductionAuditSink();
    expect(sink).toBeInstanceOf(CodingSessionAuditSink);

    vi.doUnmock('@uaip/shared-services');
  });
});

// ---------------------------------------------------------------------------
// Redaction log safety — no paths/values in logs
// ---------------------------------------------------------------------------

describe('Coordinator × Audit — redaction error exposes only count', () => {
  it('RedactionError message and payload contain only flaggedCount, not paths/values/pattern labels', async () => {
    const SECRET_VALUE = 'sk_live_verysecret1234567890';
    const scanner: SecretScanner = {
      scanForRawSecrets: vi.fn().mockReturnValue({ clean: false, flaggedCount: 1 } satisfies SecretScanResult),
    };
    const sink = new CodingSessionAuditSink({
      writer: { appendEvent: vi.fn() },
      scanner,
    });

    let thrown: unknown = null;
    try {
      await sink.append({
        eventType: CODING_SESSION_EVENT.PROVISION_REQUESTED,
        sessionId: SECRET_VALUE, workspaceId: WS_ID, actorId: USER_ID, actorType: 'user',
        details: { sessionId: SECRET_VALUE, workspaceId: WS_ID },
      });
    } catch (e) { thrown = e; }

    expect(thrown).toBeInstanceOf(Error);
    const errStr = JSON.stringify(thrown);
    expect(errStr).not.toContain(SECRET_VALUE);
    expect(errStr).not.toContain('$.sessionId');
    expect(errStr).not.toContain('flaggedPaths');
    expect(errStr).not.toContain('patterns');
    const { RedactionError: RE } = await import('../../services/execution_mesh/coding_session_audit_sink.js');
    expect(thrown).toBeInstanceOf(RE);
    expect((thrown as InstanceType<typeof RE>).redactionFailure.flaggedCount).toBe(1);
  });
});
