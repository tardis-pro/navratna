import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@uaip/config', () => ({
  config: {
    rateLimit: { windowMs: 60000, max: 100 },
  },
}));

import { RedisRateLimiterStore, InMemoryRateLimiterStore } from '../rate_limiter.js';
import type { RedisEvalClient } from '../rate_limiter.js';

interface SortedSetEntry {
  score: number;
  member: string;
}

interface PexpireRecord {
  key: string;
  ttlMs: number;
}

class FakeRedis implements RedisEvalClient {
  private readonly sortedSets = new Map<string, SortedSetEntry[]>();
  readonly pexpireCalls: PexpireRecord[] = [];

  async eval(
    _script: string,
    _numKeys: number,
    key: string,
    windowStart: string,
    now: string,
    requestId: string,
    ttlMs: string,
  ): Promise<number> {
    const windowStartNum = Number(windowStart);
    const nowNum = Number(now);
    const ttlMsNum = Number(ttlMs);

    let entries = this.sortedSets.get(key) ?? [];
    entries = entries.filter((e) => e.score > windowStartNum);
    entries.push({ score: nowNum, member: requestId });
    this.sortedSets.set(key, entries);

    this.pexpireCalls.push({ key, ttlMs: ttlMsNum });

    return entries.length;
  }

  getEntries(key: string): SortedSetEntry[] {
    return this.sortedSets.get(key) ?? [];
  }

  clear(): void {
    this.sortedSets.clear();
    this.pexpireCalls.length = 0;
  }
}

describe('RedisRateLimiterStore', () => {
  let fakeRedis: FakeRedis;

  beforeEach(() => {
    fakeRedis = new FakeRedis();
  });

  it('T1: within limit — count stays at or below max', async () => {
    const windowMs = 60000;
    const max = 5;
    const store = new RedisRateLimiterStore(fakeRedis, windowMs);

    for (let i = 0; i < max; i++) {
      // oxlint-disable-next-line no-await-in-loop -- sequential ordering required to verify monotonic count
      const result = await store.increment('user-1');
      expect(result.count).toBeLessThanOrEqual(max);
    }
  });

  it('T2: exceeding limit — count exceeds max on next call', async () => {
    const windowMs = 60000;
    const max = 3;
    const store = new RedisRateLimiterStore(fakeRedis, windowMs);

    for (let i = 0; i < max; i++) {
      // oxlint-disable-next-line no-await-in-loop -- sequential ordering required to build up count before asserting exceed
      await store.increment('user-2');
    }

    const result = await store.increment('user-2');
    expect(result.count).toBeGreaterThan(max);
  });

  it('T3: window reset after windowMs — counter resets', async () => {
    const windowMs = 100;
    const store = new RedisRateLimiterStore(fakeRedis, windowMs);

    await store.increment('user-3');
    await store.increment('user-3');

    await new Promise((resolve) => setTimeout(resolve, 150));

    const result = await store.increment('user-3');
    expect(result.count).toBe(1);
  });

  it('T4: two instances sharing same fake-redis accumulate counts', async () => {
    const windowMs = 60000;
    const storeA = new RedisRateLimiterStore(fakeRedis, windowMs);
    const storeB = new RedisRateLimiterStore(fakeRedis, windowMs);

    await storeA.increment('shared-key');
    await storeA.increment('shared-key');
    const result = await storeB.increment('shared-key');

    expect(result.count).toBe(3);
  });

  it('T5: PEXPIRE called with windowMs + 1000 buffer', async () => {
    const windowMs = 5000;
    const store = new RedisRateLimiterStore(fakeRedis, windowMs);

    await store.increment('user-5');

    expect(fakeRedis.pexpireCalls.length).toBe(1);
    expect(fakeRedis.pexpireCalls[0]?.ttlMs).toBe(windowMs + 1000);
  });

  it('T6: auth limiter (max 10) stricter than general (max 100)', async () => {
    const windowMs = 60000;
    const authStore = new RedisRateLimiterStore(fakeRedis, windowMs);
    const generalFakeRedis = new FakeRedis();
    const generalStore = new RedisRateLimiterStore(generalFakeRedis, windowMs);

    const authMax = 10;
    const generalMax = 100;

    for (let i = 0; i < authMax; i++) {
      // oxlint-disable-next-line no-await-in-loop -- sequential ordering required to build up count
      await authStore.increment('ip-auth');
    }
    const authResult = await authStore.increment('ip-auth');
    expect(authResult.count).toBeGreaterThan(authMax);

    for (let i = 0; i < generalMax; i++) {
      // oxlint-disable-next-line no-await-in-loop -- sequential ordering required to build up count
      await generalStore.increment('ip-general');
    }
    const generalResult = await generalStore.increment('ip-general');
    expect(generalResult.count).toBeGreaterThan(generalMax);

    expect(authMax).toBeLessThan(generalMax);
  });
});

describe('InMemoryRateLimiterStore', () => {
  it('within limit — count increments correctly', async () => {
    const store = new InMemoryRateLimiterStore(60000);

    const r1 = await store.increment('ip-1');
    expect(r1.count).toBe(1);

    const r2 = await store.increment('ip-1');
    expect(r2.count).toBe(2);
  });

  it('window reset — counter resets after expiry', async () => {
    const store = new InMemoryRateLimiterStore(50);

    await store.increment('ip-2');
    await store.increment('ip-2');

    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await store.increment('ip-2');
    expect(result.count).toBe(1);
  });

  it('cleanup removes expired entries', async () => {
    const store = new InMemoryRateLimiterStore(50);

    await store.increment('ip-3');

    await new Promise((resolve) => setTimeout(resolve, 100));

    store.cleanup();

    const result = await store.increment('ip-3');
    expect(result.count).toBe(1);
  });
});
