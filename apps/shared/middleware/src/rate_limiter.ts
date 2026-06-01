import { Elysia } from 'elysia';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';

interface RedisEvalClient {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimiterStore {
  increment(key: string): Promise<RateLimitEntry>;
  cleanup(): void;
}

interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  message?: unknown;
  keyGenerator?: (request: Request) => string;
  skip?: (request: Request) => boolean;
  redis?: RedisEvalClient;
}

class InMemoryRateLimiterStore implements RateLimiterStore {
  private readonly requests = new Map<string, RateLimitEntry>();
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  async increment(key: string): Promise<RateLimitEntry> {
    const now = Date.now();
    const existing = this.requests.get(key);

    if (!existing || existing.resetTime < now) {
      const entry: RateLimitEntry = { count: 1, resetTime: now + this.windowMs };
      this.requests.set(key, entry);
      return entry;
    }

    existing.count++;
    return existing;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (entry.resetTime < now) {
        this.requests.delete(key);
      }
    }
  }
}

const SLIDING_WINDOW_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return redis.call('ZCARD', KEYS[1])
`;

class RedisRateLimiterStore implements RateLimiterStore {
  private readonly redis: RedisEvalClient;
  private readonly windowMs: number;

  constructor(redis: RedisEvalClient, windowMs: number) {
    this.redis = redis;
    this.windowMs = windowMs;
  }

  async increment(key: string): Promise<RateLimitEntry> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const redisKey = `rl:${key}`;
    const requestId = `${now}-${Math.random().toString(36).slice(2)}`;

    const count = (await this.redis.eval(
      SLIDING_WINDOW_LUA,
      1,
      redisKey,
      String(windowStart),
      String(now),
      requestId,
      String(this.windowMs + 1000),
    )) as number;

    return { count, resetTime: now + this.windowMs };
  }

  cleanup(): void {}
}

let globalStore: InMemoryRateLimiterStore | null = null;

function getGlobalStore(windowMs: number): InMemoryRateLimiterStore {
  if (!globalStore) {
    globalStore = new InMemoryRateLimiterStore(windowMs);
    setInterval(() => globalStore?.cleanup(), 60000);
  }
  return globalStore;
}

export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs ?? config.rateLimit.windowMs;
  const max = options.max ?? config.rateLimit.max;

  const store: RateLimiterStore = options.redis
    ? new RedisRateLimiterStore(options.redis, windowMs)
    : getGlobalStore(windowMs);

  const keyGenerator =
    options.keyGenerator ??
    ((request: Request) => {
      const forwarded = request.headers.get('x-forwarded-for');
      return forwarded?.split(',')[0]?.trim() ?? 'unknown';
    });

  const skip =
    options.skip ??
    ((request: Request) => {
      const url = new URL(request.url);
      return url.pathname === '/health';
    });

  return (app: Elysia) => {
    return app.guard({
      async beforeHandle({ request, set }) {
        if (skip(request)) {
          return;
        }

        const key = keyGenerator(request);
        const entry = await store.increment(key);

        set.headers['X-RateLimit-Limit'] = String(max);
        set.headers['X-RateLimit-Remaining'] = String(Math.max(0, max - entry.count));
        set.headers['X-RateLimit-Reset'] = String(Math.ceil(entry.resetTime / 1000));

        if (entry.count > max) {
          const url = new URL(request.url);
          logger.warn('Rate limit exceeded', {
            ip: key,
            userAgent: request.headers.get('user-agent') ?? 'unknown',
            url: url.pathname,
            method: request.method,
          });

          set.status = 429;
          set.headers['Retry-After'] = String(Math.ceil((entry.resetTime - Date.now()) / 1000));

          return (
            options.message ?? {
              success: false,
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later',
              },
              meta: {
                timestamp: new Date(),
                retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000),
              },
            }
          );
        }
      },
    });
  };
}

export const rateLimiter = createRateLimiter();

export { InMemoryRateLimiterStore, RedisRateLimiterStore };
export type { RateLimiterOptions, RateLimiterStore, RateLimitEntry, RedisEvalClient };
