import { Elysia } from 'elysia';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';

// Rate limiter configuration interface
interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  message?: any;
  keyGenerator?: (request: Request) => string;
  skip?: (request: Request) => boolean;
}

// In-memory rate limiter store
class RateLimiterStore {
  private requests = new Map<string, { count: number; resetTime: number }>();

  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const existing = this.requests.get(key);

    if (!existing || existing.resetTime < now) {
      const entry = { count: 1, resetTime: now + windowMs };
      this.requests.set(key, entry);
      return entry;
    }

    existing.count++;
    return existing;
  }

  // Clean up expired entries periodically
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (entry.resetTime < now) {
        this.requests.delete(key);
      }
    }
  }
}

const globalStore = new RateLimiterStore();

// Clean up every minute
setInterval(() => globalStore.cleanup(), 60000);

// Elysia rate limiter plugin
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs || config.rateLimit.windowMs;
  const max = options.max || config.rateLimit.max;

  const keyGenerator =
    options.keyGenerator ||
    ((request: Request) => {
      const forwarded = request.headers.get('x-forwarded-for');
      return forwarded?.split(',')[0]?.trim() || 'unknown';
    });

  const skip =
    options.skip ||
    ((request: Request) => {
      const url = new URL(request.url);
      return url.pathname === '/health';
    });

  return (app: Elysia) => {
    return app.guard({
      beforeHandle({ request, set }) {
        // Skip rate limiting for certain requests
        if (skip(request)) {
          return;
        }

        const key = keyGenerator(request);
        const entry = globalStore.increment(key, windowMs);

        // Add rate limit headers
        set.headers['X-RateLimit-Limit'] = String(max);
        set.headers['X-RateLimit-Remaining'] = String(Math.max(0, max - entry.count));
        set.headers['X-RateLimit-Reset'] = String(Math.ceil(entry.resetTime / 1000));

        if (entry.count > max) {
          const url = new URL(request.url);
          logger.warn('Rate limit exceeded', {
            ip: key,
            userAgent: request.headers.get('user-agent') || 'unknown',
            url: url.pathname,
            method: request.method,
          });

          set.status = 429;
          set.headers['Retry-After'] = String(Math.ceil((entry.resetTime - Date.now()) / 1000));

          return (
            options.message || {
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

// Default rate limiter middleware
export const rateLimiter = createRateLimiter();
