import { afterEach, vi } from 'vitest';

process.env.NODE_ENV = 'test';

afterEach(() => {
  vi.clearAllMocks();
});