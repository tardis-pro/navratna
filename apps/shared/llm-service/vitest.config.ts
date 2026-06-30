import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedBackendConfig } from '../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineConfig({
    test: {
      name: '@uaip/llm-service',
      setupFiles: ['./src/__tests__/setup.ts'],
      testTimeout: 10_000,
      include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.spec.ts'],
      coverage: {
        include: ['src/**/*.ts'],
        thresholds: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@tests': path.resolve(import.meta.dirname, 'src/__tests__'),
        '@uaip/types': path.resolve(import.meta.dirname, '../../packages/shared-types/src'),
        '@uaip/utils': path.resolve(import.meta.dirname, '../../packages/shared-utils/src'),
        '@uaip/config': path.resolve(import.meta.dirname, '../config/src'),
        '@uaip/infra': path.resolve(import.meta.dirname, '../infra/src'),
        '@uaip/middleware': path.resolve(import.meta.dirname, '../middleware/src'),
        '@uaip/shared-services': path.resolve(import.meta.dirname, '../services/src'),
      },
    },
  })
);
