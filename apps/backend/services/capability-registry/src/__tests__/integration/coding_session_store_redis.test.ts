import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getRedisClient } from '@uaip/infra';
import { CodingSessionStore } from '../../services/execution_mesh/coding_session_store.js';
import type { CodingSessionScope, RedisClient } from '../../services/execution_mesh/coding_session_store.js';
import type { CodingSessionShadow } from '@uaip/types';

const runIntegration = process.env.RUN_REDIS_INTEGRATION === 'true';
const suite = runIntegration ? describe : describe.skip;
const sessionId = '81818181-8181-4181-8181-818181818181';
const scope: CodingSessionScope = {
  userId: '33333333-3333-4333-8333-333333333333',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  tenantId: 'tenant-real-redis',
};

suite('CodingSessionStore real Redis Lua', () => {
  let redis: RedisClient;
  let store: CodingSessionStore;

  beforeAll(async () => {
    const client = await getRedisClient();
    if (!client) throw new Error('Redis integration client unavailable');
    redis = {
      get: (key) => client.get(key),
      set: (key, value, expiryMode, seconds) => client.set(key, value, expiryMode, seconds),
      del: (...keys) => client.del(...keys),
      eval: (script, keyCount, ...args) => client.eval(script, keyCount, ...args),
    };
    store = new CodingSessionStore({ redis, encryptionKey: 'a'.repeat(64) });
    await redis.del(`coding:session:shadow:${sessionId}`, `coding:session:idem:${sessionId}:real-key`);
  });

  afterAll(async () => {
    if (redis) {
      await redis.del(`coding:session:shadow:${sessionId}`, `coding:session:idem:${sessionId}:real-key`);
    }
  });

  it('executes scoped claim, duplicate, rollback, and completion atomically', async () => {
    const now = Date.now();
    const shadow: CodingSessionShadow = {
      sessionId,
      workspaceId: scope.workspaceId,
      projectId: 'redis-probe',
      userId: scope.userId,
      tenantId: scope.tenantId,
      machineId: 'machine-real-redis',
      volumeId: 'volume-real-redis',
      nodeBaseUrl: 'http://machine-real-redis.vm.test.internal:3009',
      state: 'READY',
      createdAt: now,
      updatedAt: now,
    };

    expect((await store.put(shadow, 'node-token-real-redis')).ok).toBe(true);
    expect((await store.claimPrompt({ sessionId, scope, idempotencyKey: 'real-key' })).value).toEqual({ status: 'accepted' });

    const prompting = await store.getScoped(sessionId, scope);
    expect(prompting.ok && prompting.value.shadow.state).toBe('PROMPTING');
    expect(prompting.ok && prompting.value.shadow.activeIdempotencyKey).toBe('real-key');
    expect((await store.claimPrompt({ sessionId, scope, idempotencyKey: 'real-key' })).value).toEqual({ status: 'pending_duplicate' });

    const wrongScope = { ...scope, tenantId: 'other-tenant' };
    expect((await store.claimPrompt({ sessionId, scope: wrongScope, idempotencyKey: 'other-key' })).value).toEqual({ status: 'owner_mismatch' });

    expect((await store.rollbackActivePrompt({ sessionId, scope, idempotencyKey: 'real-key' })).ok).toBe(true);
    expect((await store.claimPrompt({ sessionId, scope, idempotencyKey: 'real-key' })).value).toEqual({ status: 'accepted' });
    expect((await store.completeActivePrompt({ sessionId, scope, nextState: 'READY' })).ok).toBe(true);
    expect((await store.claimPrompt({ sessionId, scope, idempotencyKey: 'real-key' })).value).toEqual({ status: 'completed_duplicate' });
  });
});
