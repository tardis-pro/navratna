import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { UserErasureService } from '../../user_erasure_service';

const TEST_SALT = 'test-salt-deterministic';

describe('UserErasureService — certificate primitives', () => {
  beforeAll(() => {
    process.env.DELETION_HASH_SALT = TEST_SALT;
  });

  afterAll(() => {
    delete process.env.DELETION_HASH_SALT;
  });

  describe('hashSubject determinism', () => {
    it('returns the same 64-char hex for the same userId', () => {
      const svc = new UserErasureService();
      const first = svc.hashSubject('user-123');
      const second = svc.hashSubject('user-123');

      expect(first).toBe(second);
      expect(first).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces a different hash when the salt differs', () => {
      const saltA = 'salt-alpha';
      const saltB = 'salt-beta';

      process.env.DELETION_HASH_SALT = saltA;
      const hashA = new UserErasureService().hashSubject('user-123');

      process.env.DELETION_HASH_SALT = saltB;
      const hashB = new UserErasureService().hashSubject('user-123');

      expect(hashA).not.toBe(hashB);

      // Restore for subsequent tests
      process.env.DELETION_HASH_SALT = TEST_SALT;
    });
  });

  describe('hashSubject throws when salt is absent', () => {
    it('throws if DELETION_HASH_SALT is not set', () => {
      const savedSalt = process.env.DELETION_HASH_SALT;
      delete process.env.DELETION_HASH_SALT;

      expect(() => new UserErasureService().hashSubject('x')).toThrow(
        'DELETION_HASH_SALT env var must be set for erasure certificate generation'
      );

      process.env.DELETION_HASH_SALT = savedSalt;
    });
  });

  describe('HMAC correctness', () => {
    it('matches Node crypto HMAC-SHA256 (not plain SHA256)', () => {
      process.env.DELETION_HASH_SALT = TEST_SALT;
      const svc = new UserErasureService();
      const actual = svc.hashSubject('user-123');

      const expected = createHmac('sha256', TEST_SALT).update('user-123').digest('hex');

      expect(actual).toBe(expected);
    });
  });
});
