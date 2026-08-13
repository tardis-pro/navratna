// @uaip/config throws at MODULE SCOPE when these are absent, so any test whose
// import graph reaches it dies during collection — the suite reports a failed
// FILE with zero tests rather than a failed assertion. Dummy values; nothing
// here signs or verifies a real token.
process.env.JWT_SECRET ||= 'test-jwt-secret-value-not-used-for-real-signing';
process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret-value-not-used-for-real';
process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt-value-not-used-for-real';

const mockLogger: unknown = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

expect.extend({
  toBeOneOf(received: unknown, expected: unknown[]) {
    const pass = expected.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${expected.join(', ')}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${expected.join(', ')}`,
        pass: false,
      };
    }
  },
});

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore all mocks after each test
  vi.restoreAllMocks();
});

// Global test utilities
export const createMockRequest: (
  body?: unknown,
  params?: unknown,
  query?: unknown,
  user?: unknown
) => unknown = (
  body = {},
  params = {},
  query = {},
  user = { id: 'test-user-id', role: 'user' }
) => ({
  body,
  params,
  query,
  headers: {},
  user,
  ip: '127.0.0.1',
  get: vi.fn().mockReturnValue('test-value'),
});

export const createMockResponse: () => unknown = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };
  return res;
};

export const createMockNext: () => unknown = () => vi.fn();

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '3004';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.BCRYPT_ROUNDS = '8';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock crypto for deterministic testing
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-uuid-123'),
    getRandomValues: vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
  },
});

const mockDate = new Date('2023-01-01T00:00:00Z');
vi.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());

// Export mock logger for use in tests
export { mockLogger };
