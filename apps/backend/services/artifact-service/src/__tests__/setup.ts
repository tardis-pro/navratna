import { afterEach, vi } from 'vitest';

process.env.NODE_ENV = 'test';

// @uaip/config throws at MODULE SCOPE when these are absent, so any test whose
// import graph reaches it dies before a single test runs. Values are dummies —
// nothing here signs or verifies a real token.
process.env.JWT_SECRET ||= 'test-jwt-secret-value-not-used-for-real-signing';
process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret-value-not-used-for-real';
process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt-value-not-used-for-real';

afterEach(() => {
  vi.clearAllMocks();
});