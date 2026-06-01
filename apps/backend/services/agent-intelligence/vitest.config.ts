import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DELETION_HASH_SALT: 'test-deletion-hash-salt',
      JWT_SECRET: 'test-jwt-secret-for-unit-tests-minimum-32-chars',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-for-unit-tests-32-chars',
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: ['node_modules', 'dist', 'src/__tests__', '**/*.test.ts', '**/*.config.ts'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@tests', replacement: path.resolve(__dirname, './src/__tests__') },
      { find: '@uaip/shared-services/feature-factory', replacement: path.resolve(__dirname, '../../../shared/services/src/feature_factory.ts') },
      { find: '@uaip/shared-services/persona', replacement: path.resolve(__dirname, '../../../shared/services/src/persona_service.ts') },
      { find: '@uaip/shared-services/discussion', replacement: path.resolve(__dirname, '../../../shared/services/src/discussion_service.ts') },
      { find: '@uaip/shared-services/event-bus', replacement: path.resolve(__dirname, '../../../shared/services/src/event_bus_service.ts') },
      { find: '@uaip/agent-intelligence-core', replacement: path.resolve(__dirname, '../../../shared/agent-intelligence/dist') },
      { find: '@uaip/discussion-core', replacement: path.resolve(__dirname, '../../../shared/discussion/src') },
    ],
  },
});
