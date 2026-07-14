// Test setup for exec-node-coding
import { afterEach, vi } from 'vitest';

// Clear all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Suppress SIGTERM handlers in tests
process.removeAllListeners('SIGTERM');
process.removeAllListeners('SIGINT');
