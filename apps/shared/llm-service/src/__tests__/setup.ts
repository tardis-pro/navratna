import process from 'node:process';
import { afterEach, beforeEach, vi } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.DELETION_HASH_SALT = 'test-deletion-hash-salt';

// Suppress logger output in tests — mock @uaip/utils logger
const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    logger: silentLogger,
    createLogger: () => silentLogger,
  };
});

// Mock @uaip/middleware to avoid event-bus / metrics wiring in unit tests
vi.mock('@uaip/middleware', () => ({
  recordLLMRequest: vi.fn(),
}));

// Restore fetch to prevent test leakage
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  // Unstub globals set inside individual tests (e.g. fetch)
  vi.unstubAllGlobals();
});
