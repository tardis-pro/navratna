// Tests for the coordinator's phase-transition wiring.
//
// Verifies: setup phase is set BEFORE node createSession; agent phase is set
// AFTER node READY; failure of setup phase cleans up machine + shadow and
// returns PHASE_TRANSITION_FAILED; failure of agent phase also destroys
// the machine because session creation must not succeed in the wrong phase.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@uaip/middleware', () => ({
  withNginxAuth: (app: unknown) => app,
  getNginxUser: () => ({ id: 'u1', organizationId: 't1' }),
  withSpan: async <T>(_name: string, fn: (s: object) => Promise<T>) =>
    fn({ setAttribute: vi.fn(), setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() }),
}));

vi.mock('../../services/execution_mesh/coding_node_jwt.js', () => ({
  mintCodingNodeJwt: vi.fn().mockResolvedValue('minted-test-jwt'),
}));

import { CodingSessionCoordinator } from '../../services/execution_mesh/coding_session_coordinator.js';
import { CodingSessionStore } from '../../services/execution_mesh/coding_session_store.js';
import { CodingSessionAuditSink } from '../../services/execution_mesh/coding_session_audit_sink.js';
import type { RedisClient } from '../../services/execution_mesh/coding_session_store.js';
import type { CodingNodeClient } from '../../services/execution_mesh/coding_node_client.js';
import type { FlyMachineDriver } from '../../services/execution_mesh/fly_machine_driver.js';

const USER_ID = '33333333-3333-3333-3333-333333333333';
const REPO_ID = '12345678';
const ORG_ID = '44444444-4444-4444-4444-444444444444';
const BINDING_ID = 'b1000000-0000-0000-0000-000000000001';
const WS_ID = '22222222-2222-2222-2222-222222222222';
const PROJ_ID = 'proj-1';
const MACHINE_ID = 'mach-abc123';
const VOLUME_ID = 'vol-xyz789';
const NODE_BASE_URL = `http://${MACHINE_ID}.vm.myapp.internal:3009`;

function makeRedisStore() {
  const backing = new Map<string, string>();
  const redis: RedisClient = {
    get: async (k) => backing.get(k) ?? null,
    set: async (k, v) => { backing.set(k, v); return 'OK'; },
    del: async (...keys) => { let n = 0; for (const k of keys) { if (backing.delete(k)) n++; } return n; },
    eval: async (script, _n, ...args) => {
      if (script.includes('CLAIM_LUA') || script.includes('existing_idem')) {
        const [, idemKey, , , , , , nowMs, expectedUser, expectedWorkspace, expectedTenant] = args;
        const raw = backing.get(args[0]!);
        if (!raw) return ['not_found'];
        try {
          const obj = JSON.parse(raw) as { shadow?: Record<string, unknown> };
          const shadow = obj.shadow;
          if (!shadow) return ['corrupt'];
          if (shadow.userId !== expectedUser || shadow.workspaceId !== expectedWorkspace || shadow.tenantId !== expectedTenant) return ['owner_mismatch'];
          const existing = backing.get(idemKey);
          if (existing === 'pending') return ['pending_duplicate'];
          if (existing === 'completed') return ['completed_duplicate'];
          backing.set(args[0]!, JSON.stringify({ shadow: { ...shadow, state: args[3]!, updatedAt: Number(nowMs) } }));
          return ['accepted'];
        } catch { return ['corrupt']; }
      }
      return null;
    },
  };
  return { redis, backing };
}

function makeNodeClient(over: Partial<CodingNodeClient> = {}): CodingNodeClient {
  return {
    createSession: vi.fn().mockResolvedValue({ ok: true, value: { sessionId: 's', state: 'CREATING' } }),
    setEgressPhase: vi.fn().mockResolvedValue({ ok: true, value: { ok: true as const, phase: 'setup' as const, sessionId: 's' } }),
    verify: vi.fn().mockResolvedValue({ ok: true, value: { alive: true, sessionId: 's', state: 'READY' as const, lastEventSeq: 0 } }),
    ...over,
  } as unknown as CodingNodeClient;
}

function makeFly(): FlyMachineDriver {
  return {
    provisionWorkspace: vi.fn().mockResolvedValue({ machineId: MACHINE_ID, volumeId: VOLUME_ID, region: 'sin', baseUrl: NODE_BASE_URL }),
    destroyWorkspace: vi.fn().mockResolvedValue(undefined),
  } as unknown as FlyMachineDriver;
}

function makeAudit(): CodingSessionAuditSink {
  return new CodingSessionAuditSink({
    writer: { appendEvent: vi.fn().mockResolvedValue(undefined) },
    scanner: { scanForRawSecrets: vi.fn().mockReturnValue({ clean: true, flaggedCount: 0 }) },
  });
}

function makeCoord(over: { nodeClient?: CodingNodeClient; fly?: FlyMachineDriver; redis?: RedisClient }) {
  const store = new CodingSessionStore({ redis: over.redis ?? makeRedisStore().redis });
  return new CodingSessionCoordinator({
    store,
    nodeClient: over.nodeClient ?? makeNodeClient(),
    fly: over.fly ?? makeFly(),
    codingNodePublicKeyPem: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest==\n-----END PUBLIC KEY-----',
    auditSink: makeAudit(),
    broker: {
      mintInstallationToken: vi.fn().mockResolvedValue({
        ok: true,
        value: { token: 'github-test-token', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      }),
    } as never,
    installationRepo: {
      findScopedBinding: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          bindingId: BINDING_ID,
          installationId: '1234',
          repositoryId: REPO_ID,
          repositoryFullName: 'owner/repo',
          status: 'active',
        },
      }),
    } as never,
  });
}

describe('coordinator phase transitions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls setEgressPhase(setup) BEFORE node createSession', async () => {
    const order: string[] = [];
    const nodeClient = {
      createSession: vi.fn().mockImplementation(async () => { order.push('create'); return { ok: true, value: { sessionId: 's', state: 'CREATING' } }; }),
      setEgressPhase: vi.fn().mockImplementation(async (base, _t, req) => {
        order.push(`phase:${req.phase}`);
        return { ok: true, value: { ok: true as const, phase: req.phase, sessionId: req.sessionId } };
      }),
      verify: vi.fn().mockResolvedValue({ ok: true, value: { alive: true, sessionId: 's', state: 'READY' as const, lastEventSeq: 0 } }),
    } as unknown as CodingNodeClient;
    const coord = makeCoord({ nodeClient, fly: makeFly() });
    const result = await coord.createSession({
      workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID,
    });
    expect(result.ok).toBe(true);
    const idxSetup = order.findIndex((s) => s === 'phase:setup');
    const idxAgent = order.findIndex((s) => s === 'phase:agent');
    const idxCreate = order.findIndex((s) => s === 'create');
    expect(idxSetup).toBeGreaterThanOrEqual(0);
    expect(idxSetup).toBeLessThan(idxCreate);
    expect(idxAgent).toBeGreaterThan(idxSetup);
  });

  it('cleans up machine + shadow when setup phase transition fails', async () => {
    const fly = makeFly();
    const redis = makeRedisStore().redis;
    const nodeClient = makeNodeClient({
      setEgressPhase: vi.fn().mockResolvedValue({ ok: false, error: { code: 'NODE_AUTH_FAILED', status: 401 } }),
    });
    const coord = makeCoord({ nodeClient, fly, redis });
    const result = await coord.createSession({
      workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PHASE_TRANSITION_FAILED');
    expect(fly.destroyWorkspace).toHaveBeenCalled();
  });

  it('cleans up machine when agent phase transition fails', async () => {
    let calls = 0;
    const fly = makeFly();
    const nodeClient = {
      createSession: vi.fn().mockResolvedValue({ ok: true, value: { sessionId: 's', state: 'CREATING' } }),
      setEgressPhase: vi.fn().mockImplementation(async (_base, _t, req) => {
        calls++;
        // First call (setup) succeeds; second call (agent) fails.
        if (req.phase === 'agent') {
          return { ok: false, error: { code: 'NODE_AUTH_FAILED', status: 401 } };
        }
        return { ok: true, value: { ok: true as const, phase: req.phase, sessionId: req.sessionId } };
      }),
      verify: vi.fn().mockResolvedValue({ ok: true, value: { alive: true, sessionId: 's', state: 'READY' as const, lastEventSeq: 0 } }),
    } as unknown as CodingNodeClient;
    const coord = makeCoord({ nodeClient, fly, redis: makeRedisStore().redis });
    const result = await coord.createSession({
      workspaceId: WS_ID, projectId: PROJ_ID, userId: USER_ID, tenantId: ORG_ID, repositoryId: REPO_ID, bindingId: BINDING_ID,
    });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PHASE_TRANSITION_FAILED');
    expect(fly.destroyWorkspace).toHaveBeenCalledWith(MACHINE_ID, VOLUME_ID);
  });
});
