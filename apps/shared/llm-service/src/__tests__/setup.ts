import process from 'node:process';
import { afterEach, beforeEach, vi } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = 'test-jwt-secret';

// Suppress logger output in tests — mock @uaip/utils logger
vi.mock('@uaip/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

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
