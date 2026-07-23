import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-32-chars-long-enough';

afterEach(() => {
  vi.clearAllMocks();
});