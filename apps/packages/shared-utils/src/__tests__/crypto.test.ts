import { describe, it, expect } from 'vitest';
import { encryptApiKey, decryptApiKey, isEncryptedApiKey } from '../crypto.js';

const TEST_KEY = '0'.repeat(64);

describe('encryptApiKey / decryptApiKey', () => {
  it('round-trips plaintext correctly', () => {
    const original = 'sk-test-api-key-12345';
    const encrypted = encryptApiKey(original, TEST_KEY);
    const decrypted = decryptApiKey(encrypted, TEST_KEY);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertext on each call due to random IV', () => {
    const enc1 = encryptApiKey('sk-test', TEST_KEY);
    const enc2 = encryptApiKey('sk-test', TEST_KEY);
    expect(enc1).not.toBe(enc2);
  });

  it('encrypted output has exactly 3 colon-separated parts', () => {
    const encrypted = encryptApiKey('test', TEST_KEY);
    expect(encrypted.split(':').length).toBe(3);
  });

  it('all parts are non-empty hex strings', () => {
    const encrypted = encryptApiKey('test', TEST_KEY);
    const parts = encrypted.split(':');
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(part).toMatch(/^[\da-f]+$/i);
    }
  });

  it('throws on tampered ciphertext (GCM auth tag mismatch)', () => {
    const encrypted = encryptApiKey('test', TEST_KEY);
    const parts = encrypted.split(':');
    parts[2] = 'deadbeef';
    expect(() => decryptApiKey(parts.join(':'), TEST_KEY)).toThrow();
  });

  it('throws on tampered auth tag', () => {
    const encrypted = encryptApiKey('test', TEST_KEY);
    const parts = encrypted.split(':');
    parts[1] = 'a'.repeat(32);
    expect(() => decryptApiKey(parts.join(':'), TEST_KEY)).toThrow();
  });

  it('throws when encryption key is too short', () => {
    expect(() => encryptApiKey('test', 'tooshort')).toThrow('32 bytes');
  });

  it('throws when decryption key is too short', () => {
    expect(() => decryptApiKey('a:b:c', 'tooshort')).toThrow('32 bytes');
  });

  it('throws when encrypted format has wrong number of parts', () => {
    const key = TEST_KEY;
    expect(() => decryptApiKey('only-two:parts', key)).toThrow();
    expect(() => decryptApiKey('four:parts:here:extra', key)).toThrow();
  });
});

describe('isEncryptedApiKey', () => {
  it('returns true for output produced by encryptApiKey', () => {
    const encrypted = encryptApiKey('test', TEST_KEY);
    expect(isEncryptedApiKey(encrypted)).toBe(true);
  });

  it('returns false for plaintext API key', () => {
    expect(isEncryptedApiKey('sk-proj-abc123xyz')).toBe(false);
  });

  it('returns false for string with wrong number of colons', () => {
    expect(isEncryptedApiKey('abc:def')).toBe(false);
    expect(isEncryptedApiKey('abc:def:ghi:jkl')).toBe(false);
  });

  it('returns false when any part is empty', () => {
    expect(isEncryptedApiKey(':abc:def')).toBe(false);
    expect(isEncryptedApiKey('abc::def')).toBe(false);
  });

  it('returns false when any part contains non-hex characters', () => {
    expect(isEncryptedApiKey('xyz:abc:def')).toBe(false);
  });
});
