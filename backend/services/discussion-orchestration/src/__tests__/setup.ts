// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Restore all mocks after each test
  jest.restoreAllMocks();
});

// Global test utilities
export const createMockRequest = (
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
  get: jest.fn().mockReturnValue('test-value'),
});

export const createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  };
  return res;
};

export const createMockNext = () => jest.fn();

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '3005';
process.env.RABBITMQ_URL = 'amqp://localhost:5672';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock Date.now for consistent timestamps
const mockDate = new Date('2023-01-01T00:00:00Z');
jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
Date.now = jest.fn(() => mockDate.getTime());

// Mock process events to prevent interference with tests
const originalOn = process.on;
(process.on as any) = jest.fn().mockImplementation((event, callback) => {
  if (event === 'SIGTERM' || event === 'SIGINT') {
    // Don't actually register these handlers in tests
    return process;
  }
  return originalOn.call(process, event, callback);
});
