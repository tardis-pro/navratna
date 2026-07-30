import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-32-chars-long-enough';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-long-enough';
process.env.DELETION_HASH_SALT = 'test-deletion-salt-32-chars-long-enough';

afterEach(() => {
  vi.clearAllMocks();
});