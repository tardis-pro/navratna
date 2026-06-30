import { afterEach, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DELETION_HASH_SALT = process.env.DELETION_HASH_SALT || 'test-deletion-hash-salt';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-at-least-32-chars';

afterEach(() => {
  vi.clearAllMocks();
});
