import { afterEach, vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

afterEach(() => {
  vi.clearAllMocks();
});
