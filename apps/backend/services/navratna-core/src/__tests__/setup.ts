import { afterEach, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DELETION_HASH_SALT = process.env.DELETION_HASH_SALT || 'test-deletion-hash-salt';

afterEach(() => {
  vi.clearAllMocks();
});
