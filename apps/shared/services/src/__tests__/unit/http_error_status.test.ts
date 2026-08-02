import { describe, it, expect } from 'vitest';
import { resolveErrorStatus } from '../../http_error_status.js';

/**
 * Elysia seeds `set.status` with 200 before a handler runs, so an unmatched
 * route reaches onError already carrying a success status. Trusting that value
 * makes every 404 answer HTTP 200 with an error body, which any `res.ok` client
 * reads as success — the failure mode that made unmounted routes look mounted.
 */

describe('resolveErrorStatus', () => {
  it('reports NOT_FOUND as 404 even though set.status still holds the default 200', () => {
    expect(resolveErrorStatus('NOT_FOUND', 200)).toBe(404);
  });

  it('reports NOT_FOUND as 404 when the status was never assigned', () => {
    expect(resolveErrorStatus('NOT_FOUND', undefined)).toBe(404);
  });

  it('keeps an explicit error status a handler deliberately set', () => {
    expect(resolveErrorStatus('VALIDATION', 400)).toBe(400);
    expect(resolveErrorStatus('UNKNOWN', 401)).toBe(401);
    expect(resolveErrorStatus('UNKNOWN', 503)).toBe(503);
  });

  it('falls back to 500 for an unclassified failure carrying no error status', () => {
    expect(resolveErrorStatus('UNKNOWN', 200)).toBe(500);
    expect(resolveErrorStatus('UNKNOWN', undefined)).toBe(500);
  });

  it('handles the numeric codes Elysia can emit alongside its string codes', () => {
    expect(resolveErrorStatus(418, 418)).toBe(418);
    expect(resolveErrorStatus(418, 200)).toBe(500);
  });

  it('never reports a 2xx or 3xx as the outcome of an error', () => {
    for (const carried of [200, 201, 204, 302, undefined]) {
      for (const code of ['NOT_FOUND', 'UNKNOWN', 'VALIDATION', 'PARSE']) {
        expect(resolveErrorStatus(code, carried)).toBeGreaterThanOrEqual(400);
      }
    }
  });
});
