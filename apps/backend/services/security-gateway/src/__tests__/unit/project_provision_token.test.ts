import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
});

const { verifyServiceToken } = await import('../../http/project_provision_elysia');

/**
 * What this guards: POST /api/v1/projects/provision sits behind a
 * pre-authentication nginx location, so the edge does NOT authenticate it. If
 * this check were ever vacuous, project creation — which mints the identity that
 * owns MCP servers — would become an unauthenticated LAN endpoint.
 *
 * A credential check that is never exercised is indistinguishable from one that
 * always passes, which is why it is exported and tested directly.
 */
describe('project provision service token', () => {
  const SECRET = 'a'.repeat(64);

  it('accepts the configured token', () => {
    expect(verifyServiceToken(SECRET, SECRET).valid).toBe(true);
  });

  it('fails closed when no token is configured', () => {
    const result = verifyServiceToken(SECRET, undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not configured/);
  });

  it('fails closed when the configured token is empty', () => {
    expect(verifyServiceToken(SECRET, '').valid).toBe(false);
  });

  it('rejects a missing header', () => {
    const result = verifyServiceToken(null, SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Missing x-navratna-service-token/);
  });

  it('rejects a wrong token of the same length', () => {
    expect(verifyServiceToken('b'.repeat(64), SECRET).valid).toBe(false);
  });

  it('rejects a shorter token without throwing', () => {
    // timingSafeEqual throws on a length mismatch; the length check must come
    // first or a short token becomes a 500 instead of a 401.
    expect(() => verifyServiceToken('short', SECRET)).not.toThrow();
    expect(verifyServiceToken('short', SECRET).valid).toBe(false);
  });

  it('rejects a longer token without throwing', () => {
    expect(() => verifyServiceToken(SECRET + 'extra', SECRET)).not.toThrow();
    expect(verifyServiceToken(SECRET + 'extra', SECRET).valid).toBe(false);
  });

  it('does not leak whether the length or the value was wrong', () => {
    // Both wrong-length and wrong-value return the same message, so the error
    // cannot be used to probe the token's length.
    expect(verifyServiceToken('short', SECRET).error).toBe(
      verifyServiceToken('b'.repeat(64), SECRET).error
    );
  });

  it('rejects the empty string as a presented token', () => {
    expect(verifyServiceToken('', SECRET).valid).toBe(false);
  });
});
