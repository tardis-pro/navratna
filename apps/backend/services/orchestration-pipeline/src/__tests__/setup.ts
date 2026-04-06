beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
  get: vi.fn().mockReturnValue('test-value'),
});

export const createMockResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  cookie: vi.fn().mockReturnThis(),
  clearCookie: vi.fn().mockReturnThis(),
  header: vi.fn().mockReturnThis(),
  removeHeader: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
});

export const createMockNext = () => vi.fn();

process.env.NODE_ENV = 'test';
process.env.PORT = '3002';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';

const mockDate = new Date('2023-01-01T00:00:00Z');
vi.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());

const originalOn = process.on.bind(process);
vi.spyOn(process, 'on').mockImplementation(
  (event: string, listener: (...args: unknown[]) => void) => {
    if (event === 'SIGTERM' || event === 'SIGINT') {
      return process;
    }
    return originalOn(event, listener);
  }
);
