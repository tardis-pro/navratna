// @uaip/config resolves these at module scope via throw-expressions, so they must
// exist before any import of the config graph or the suite fails to load.
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.DELETION_HASH_SALT ??= 'test-deletion-hash-salt';

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
  redirect: vi.fn().mockReturnThis(),
});

export const createMockNext = () => vi.fn();

process.env.NODE_ENV = 'test';
process.env.PORT = '3005';
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
    return originalOn(event as NodeJS.Signals, listener as (...args: unknown[]) => void);
  }
);
