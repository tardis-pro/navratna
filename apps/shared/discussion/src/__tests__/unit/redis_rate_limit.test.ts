import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * checkRateLimit must decide allow/deny in ONE atomic Redis operation.
 *
 * A GET / modify / SET sequence lets concurrent callers all read the same count
 * and overwrite each other, so an arbitrary burst slips through. It must also
 * fail CLOSED: a Redis error, or a poisoned key, has to deny rather than grant
 * a fresh window.
 */

type RedisStub = {
  eval: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  setex: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

const redisStub: RedisStub = {
  eval: vi.fn(),
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  on: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: class {
    constructor() {
      return redisStub;
    }
  },
}));

vi.mock('@uaip/infra', () => ({
  getRedisTLSOptions: () => ({}),
}));

const { RedisSessionManager } = await import('../../websocket/redis_session_manager.js');

describe('RedisSessionManager.checkRateLimit', () => {
  let manager: InstanceType<typeof RedisSessionManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new RedisSessionManager({ host: 'localhost', port: 6379 });
  });

  it('decides in a single atomic call, not a read-then-write', async () => {
    redisStub.eval.mockResolvedValue(1);

    await expect(manager.checkRateLimit('conn-1', 'messages', 10)).resolves.toBe(true);

    expect(redisStub.eval).toHaveBeenCalledTimes(1);
    expect(redisStub.get).not.toHaveBeenCalled();
    expect(redisStub.setex).not.toHaveBeenCalled();
  });

  it('denies once the atomic counter reports the limit is reached', async () => {
    redisStub.eval.mockResolvedValue(0);

    await expect(manager.checkRateLimit('conn-1', 'messages', 10)).resolves.toBe(false);
  });

  it('keys the counter per connection AND per bucket type', async () => {
    redisStub.eval.mockResolvedValue(1);

    await manager.checkRateLimit('conn-1', 'messages', 10);
    await manager.checkRateLimit('conn-1', 'typing', 10);

    const firstKey = String(redisStub.eval.mock.calls[0][2]);
    const secondKey = String(redisStub.eval.mock.calls[1][2]);

    expect(firstKey).toContain('conn-1');
    expect(firstKey).toContain('messages');
    expect(secondKey).toContain('typing');
    expect(firstKey).not.toBe(secondKey);
  });

  it('passes the limit and window to the script rather than trusting the caller', async () => {
    redisStub.eval.mockResolvedValue(1);

    await manager.checkRateLimit('conn-1', 'messages', 7);

    const args = redisStub.eval.mock.calls[0].map(String);
    expect(args).toContain('7');
  });

  it('denies when Redis itself fails', async () => {
    redisStub.eval.mockRejectedValue(new Error('redis down'));

    await expect(manager.checkRateLimit('conn-1', 'messages', 10)).resolves.toBe(false);
  });

  it('denies when a poisoned counter value cannot be interpreted', async () => {
    redisStub.eval.mockResolvedValue('not-a-number');

    await expect(manager.checkRateLimit('conn-1', 'messages', 10)).resolves.toBe(false);
  });

  it('a burst beyond the limit is rejected once the counter passes it', async () => {
    let counter = 0;
    redisStub.eval.mockImplementation(async () => {
      counter += 1;
      return counter <= 3 ? 1 : 0;
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => manager.checkRateLimit('conn-1', 'messages', 3))
    );

    expect(results.filter(Boolean)).toHaveLength(3);
    expect(results.filter((r) => !r)).toHaveLength(2);
  });
});
