import { describe, it, expect } from 'vitest';
import { CodingSessionStore } from '../../services/execution_mesh/coding_session_store.js';
import type { RedisClient } from '../../services/execution_mesh/coding_session_store.js';
import type { CodingSessionScope } from '../../services/execution_mesh/coding_session_store.js';
import type { CodingSessionShadow } from '@uaip/types';

function makeShadow(overrides: Partial<CodingSessionShadow> = {}): CodingSessionShadow {
  const now = Date.now();
  return {
    sessionId: '11111111-1111-1111-1111-111111111111',
    workspaceId: '22222222-2222-2222-2222-222222222222',
    projectId: 'proj-1',
    userId: '33333333-3333-3333-3333-333333333333',
    tenantId: 'tenant-1',
    repositoryId: '99887766',
    machineId: 'mach-abc',
    volumeId: 'vol-abc',
    nodeBaseUrl: 'http://mach-abc.vm.my-app.internal:3009',
    state: 'READY',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function scopeFor(shadow: CodingSessionShadow): CodingSessionScope {
  return {
    userId: shadow.userId,
    workspaceId: shadow.workspaceId,
    tenantId: shadow.tenantId,
  };
}

function makeRedis(): { redis: RedisClient; store: Map<string, string> } {
  const store = new Map<string, string>();
  const redis: RedisClient = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value, _mode, _ttl) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (...keys) => {
      let n = 0;
      for (const k of keys) { if (store.delete(k)) n++; }
      return n;
    },
    eval: async (script, _numkeys, ...args) => {
      if (script.includes('existing_idem') || script.includes('CLAIM_LUA') || script.includes('idem_ttl')) {
        const shadowKey = args[0]!;
        const idemKey = args[1]!;
        const fromState = args[2]!;
        const toState = args[3]!;
        const idemVal = args[4]!;
        const _ttlS = args[5]!;
        const nowMs = args[7]!;
        const expectedUser = args[8]!;
        const expectedWorkspace = args[9]!;
        const expectedTenant = args[10]!;

        const raw = store.get(shadowKey);
        if (!raw) return ['not_found'];
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return ['corrupt']; }

        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        if (shadow.userId !== expectedUser || shadow.workspaceId !== expectedWorkspace || shadow.tenantId !== expectedTenant) return ['owner_mismatch'];

        const existingIdem = store.get(idemKey);
        if (existingIdem === 'pending') return ['pending_duplicate'];
        if (existingIdem === 'completed') return ['completed_duplicate'];

        if (shadow.state !== fromState) return ['busy', shadow.state];

        shadow.state = toState;
        shadow.activeIdempotencyKey = idemVal;
        shadow.updatedAt = Number(nowMs);
        obj.shadow = shadow;
        store.set(shadowKey, JSON.stringify(obj));
        store.set(idemKey, 'pending');
        void _ttlS;
        return ['accepted'];
      }
      if (script.includes('key_mismatch') || script.includes('ROLLBACK')) {
        const shadowKey = args[0]!;
        const idemKey = args[1]!;
        const expected = args[2]!;
        const nowMs = args[4]!;
        const raw = store.get(shadowKey);
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
        store.set(shadowKey, JSON.stringify(obj));
        if (idemKey) store.delete(idemKey);
        return ['ok'];
      }
      if (script.includes('active_key') || script.includes('COMPLETE_ACTIVE')) {
        const shadowKey = args[0]!;
        const nextState = args[1]!;
        const nowMs = args[4]!;
        const raw = store.get(shadowKey);
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
        store.set(shadowKey, JSON.stringify(obj));
        if (activeKey) {
          const sid = shadowKey.replace('coding:session:shadow:', '');
          store.set(`coding:session:idem:${sid}:${activeKey}`, 'completed');
        }
        return ['ok', activeKey ?? ''];
      }
      if (script.includes('last_event_id') || script.includes('UPDATE_EVENT')) {
        const shadowKey = args[0]!;
        const lastEventId = args[3]!;
        const nowMs = args[5]!;
        const raw = store.get(shadowKey);
        if (!raw) return ['not_found'];
        let obj: Record<string, unknown>;
        try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return ['corrupt']; }
        const shadow = obj.shadow as Record<string, unknown> | undefined;
        if (!shadow) return ['corrupt'];
        shadow.lastEventId = lastEventId;
        shadow.updatedAt = Number(nowMs);
        obj.shadow = shadow;
        store.set(shadowKey, JSON.stringify(obj));
        return ['ok'];
      }
      if (script.includes('COMPLETE_IDEM') || (script.includes('completed') && !script.includes('active_key'))) {
        const idemKey = args[0]!;
        store.set(idemKey, 'completed');
        return 1;
      }
      return null;
    },
  };
  return { redis, store };
}

function makeStore(redisOverride?: Partial<RedisClient>): { store: CodingSessionStore; redisStore: Map<string, string>; redis: RedisClient } {
  const { redis, store: redisStore } = makeRedis();
  const merged: RedisClient = redisOverride ? { ...redis, ...redisOverride } : redis;
  const store = new CodingSessionStore({ redis: merged });
  return { store, redisStore, redis: merged };
}

describe('CodingSessionStore', () => {
  describe('put and getScoped', () => {
    it('round-trips shadow (no token stored)', async () => {
      const { store } = makeStore();
      const shadow = makeShadow();
      await store.put(shadow);
      const result = await store.getScoped(shadow.sessionId, scopeFor(shadow));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.sessionId).toBe(shadow.sessionId);
      expect(result.value.repositoryId).toBe('99887766');
    });

    it('returns NOT_FOUND when key absent', async () => {
      const { store } = makeStore();
      const scope: CodingSessionScope = { userId: '33333333-3333-3333-3333-333333333333', workspaceId: '22222222-2222-2222-2222-222222222222', tenantId: 'tenant-1' };
      const result = await store.getScoped('00000000-0000-0000-0000-000000000000', scope);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('returns OWNER_MISMATCH when userId differs', async () => {
      const { store } = makeStore();
      const shadow = makeShadow();
      await store.put(shadow);
      const wrongScope: CodingSessionScope = { userId: '99999999-9999-9999-9999-999999999999', workspaceId: shadow.workspaceId, tenantId: shadow.tenantId };
      const result = await store.getScoped(shadow.sessionId, wrongScope);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('OWNER_MISMATCH');
    });

    it('returns REDIS_UNAVAILABLE when redis.get throws', async () => {
      const { store } = makeStore({ get: async () => { throw new Error('connection refused'); } });
      const scope: CodingSessionScope = { userId: '33333333-3333-3333-3333-333333333333', workspaceId: '22222222-2222-2222-2222-222222222222', tenantId: 'tenant-1' };
      const result = await store.getScoped('11111111-1111-1111-1111-111111111111', scope);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('REDIS_UNAVAILABLE');
    });

    it('returns CORRUPT_RECORD when stored value is invalid JSON', async () => {
      const { store, redisStore } = makeStore();
      const shadow = makeShadow();
      redisStore.set(`coding:session:shadow:${shadow.sessionId}`, 'not-json');
      const result = await store.getScoped(shadow.sessionId, scopeFor(shadow));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CORRUPT_RECORD');
    });

    it('no bearer token or signed JWT is stored in Redis envelope', async () => {
      const { store, redisStore } = makeStore();
      const shadow = makeShadow();
      await store.put(shadow);
      const raw = redisStore.get(`coding:session:shadow:${shadow.sessionId}`) ?? '';
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(Object.keys(parsed)).toEqual(['shadow']);
      expect('token' in parsed).toBe(false);
      expect('nodeToken' in parsed).toBe(false);
    });
  });

  describe('gateway restart recovery (remint)', () => {
    it('second store instance reads shadow written by first (public shadow, no secret)', async () => {
      const { redis: redisClient } = makeRedis();
      const store1 = new CodingSessionStore({ redis: redisClient });
      const store2 = new CodingSessionStore({ redis: redisClient });
      const shadow = makeShadow();

      await store1.put(shadow);
      const result = await store2.getScoped(shadow.sessionId, scopeFor(shadow));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.sessionId).toBe(shadow.sessionId);
      expect(result.value.repositoryId).toBe('99887766');
    });
  });

  describe('deleteScoped', () => {
    it('deletes session and subsequent getScoped returns NOT_FOUND', async () => {
      const { store } = makeStore();
      const shadow = makeShadow();
      await store.put(shadow);
      await store.deleteScoped(shadow.sessionId, scopeFor(shadow));
      const result = await store.getScoped(shadow.sessionId, scopeFor(shadow));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('returns ok for non-existent session', async () => {
      const { store } = makeStore();
      const scope: CodingSessionScope = { userId: '33333333-3333-3333-3333-333333333333', workspaceId: '22222222-2222-2222-2222-222222222222', tenantId: 'tenant-1' };
      const result = await store.deleteScoped('11111111-1111-1111-1111-111111111111', scope);
      expect(result.ok).toBe(true);
    });
  });

  describe('claimPrompt idempotency', () => {
    it('returns accepted for READY session with new idempotency key', async () => {
      const { store } = makeStore();
      const shadow = makeShadow({ state: 'READY' });
      await store.put(shadow);
      const result = await store.claimPrompt({ sessionId: shadow.sessionId, scope: scopeFor(shadow), idempotencyKey: 'idem-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('accepted');
    });

    it('returns pending_duplicate for same key twice', async () => {
      const { store, redisStore } = makeStore();
      const shadow = makeShadow({ state: 'READY' });
      await store.put(shadow);
      await store.claimPrompt({ sessionId: shadow.sessionId, scope: scopeFor(shadow), idempotencyKey: 'idem-2' });
      await store.put({ ...shadow, state: 'READY' });
      redisStore.set(`coding:session:idem:${shadow.sessionId}:idem-2`, 'pending');
      const second = await store.claimPrompt({ sessionId: shadow.sessionId, scope: scopeFor(shadow), idempotencyKey: 'idem-2' });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.status).toBe('pending_duplicate');
    });

    it('returns completed_duplicate after key is marked completed', async () => {
      const { store } = makeStore();
      const shadow = makeShadow({ state: 'READY' });
      await store.put(shadow);
      await store.claimPrompt({ sessionId: shadow.sessionId, scope: scopeFor(shadow), idempotencyKey: 'idem-3' });
      await store.completeIdempotencyKey(shadow.sessionId, 'idem-3');

      const readyShadow = makeShadow({ state: 'READY' });
      await store.put(readyShadow, 'tok');

      const result = await store.claimPrompt({ sessionId: shadow.sessionId, scope: scopeFor(shadow), idempotencyKey: 'idem-3' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('completed_duplicate');
    });

    it('returns busy when session state is not READY', async () => {
      const { store } = makeStore();
      const shadow = makeShadow({ state: 'PROMPTING' });
      await store.put(shadow);
      const result = await store.claimPrompt({ sessionId: shadow.sessionId, scope: scopeFor(shadow), idempotencyKey: 'idem-4' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('busy');
    });

    it('returns not_found when session absent', async () => {
      const { store } = makeStore();
      const result = await store.claimPrompt({
        sessionId: '11111111-1111-1111-1111-111111111111',
        scope: scopeFor(makeShadow()),
        idempotencyKey: 'idem-5',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('not_found');
    });

    it('returns owner_mismatch when userId wrong', async () => {
      const { store } = makeStore();
      const shadow = makeShadow({ state: 'READY' });
      await store.put(shadow);
      const result = await store.claimPrompt({
        sessionId: shadow.sessionId,
        scope: { ...scopeFor(shadow), userId: '99999999-9999-9999-9999-999999999999' },
        idempotencyKey: 'idem-6',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('owner_mismatch');
    });

    it('returns REDIS_UNAVAILABLE when eval throws', async () => {
      const { redis, store: backing } = makeRedis();
      const shadow = makeShadow({ state: 'READY' });

      const storeA = new CodingSessionStore({ redis });
      await storeA.put(shadow);

      const brokenRedis: RedisClient = {
        get: async (key) => backing.get(key) ?? null,
        set: async (key, value) => { backing.set(key, value); return 'OK'; },
        del: async (key) => { backing.delete(key); return 1; },
        eval: async () => { throw new Error('NOSCRIPT'); },
      };
      const storeB = new CodingSessionStore({ redis: brokenRedis });
      const result = await storeB.claimPrompt({ sessionId: shadow.sessionId, scope: scopeFor(shadow), idempotencyKey: 'idem-7' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('REDIS_UNAVAILABLE');
    });
  });
});
