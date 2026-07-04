/**
 * Redis TLS helper.
 *
 * Managed Redis providers (Upstash, and any `rediss://` endpoint) require TLS.
 * The connection config elsewhere in the codebase parses host/port/password but
 * historically dropped the TLS flag, so plaintext connections to a TLS-only
 * provider (e.g. Upstash) fail at connect time.
 *
 * `getRedisTLSOptions()` returns an ioredis-compatible `{ tls }` fragment when
 * TLS should be enabled, or `{}` otherwise, so it can be spread into any
 * ioredis options object.
 *
 * TLS is enabled when ANY of the following is true:
 *   - `REDIS_TLS=true`
 *   - `REDIS_URL` uses the `rediss://` scheme
 *   - the resolved host looks like a managed TLS provider (e.g. `*.upstash.io`)
 */

import type { RedisOptions } from 'ioredis';

const TLS_HOST_SUFFIXES = ['.upstash.io'];

function hostRequiresTLS(host?: string): boolean {
  if (!host) return false;
  return TLS_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Determine whether Redis connections should use TLS.
 * @param host Optional resolved host to inspect (e.g. from parsed REDIS_URL).
 */
export function shouldUseRedisTLS(host?: string): boolean {
  if (process.env.REDIS_TLS === 'true') return true;

  const url = process.env.REDIS_URL;
  if (url && url.startsWith('rediss://')) return true;

  if (hostRequiresTLS(host)) return true;

  // Fall back to inspecting the host embedded in REDIS_URL if present.
  if (url) {
    try {
      const parsed = new URL(url);
      if (hostRequiresTLS(parsed.hostname)) return true;
    } catch {
      // ignore malformed URL — other signals already checked
    }
  }

  return false;
}

/**
 * Returns an ioredis options fragment enabling TLS when required, else `{}`.
 * Spread into any ioredis options object:
 *
 *   new Redis({ host, port, password, ...getRedisTLSOptions(host) })
 *
 * `servername` is set to the host so SNI works with providers like Upstash.
 */
export function getRedisTLSOptions(host?: string): Pick<RedisOptions, 'tls'> {
  if (!shouldUseRedisTLS(host)) return {};
  return {
    tls: host ? { servername: host } : {},
  };
}
