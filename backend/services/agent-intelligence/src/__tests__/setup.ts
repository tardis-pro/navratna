import { vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@uaip/utils';

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();

  // Mock logger to prevent noise in test output
  vi.spyOn(logger, 'info').mockImplementation(() => logger);
  vi.spyOn(logger, 'warn').mockImplementation(() => logger);
  vi.spyOn(logger, 'error').mockImplementation(() => logger);
  vi.spyOn(logger, 'debug').mockImplementation(() => logger);
});

afterEach(() => {
  // Restore all mocks after each test
  vi.restoreAllMocks();
});

// Global test utilities
export const createMockRequest = (body = {}, params = {}, query = {}) => ({
  body,
  params,
  query,
  headers: {},
  user: { id: 'test-user-id', role: 'user' }
});

export const createMockResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis()
  };
  return res;
};

export const createMockNext = () => vi.fn();

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.RABBITMQ_URL = 'amqp://localhost:5672';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';