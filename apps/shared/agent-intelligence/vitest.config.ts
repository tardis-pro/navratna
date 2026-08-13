import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/agent-intelligence',
      testTimeout: 30_000,
      include: ['src/__tests__/**/*.test.ts'],
      coverage: {
        include: ['src/**/*.ts'],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@uaip/types': path.resolve(import.meta.dirname, '../../packages/shared-types/src'),
        '@uaip/utils': path.resolve(import.meta.dirname, '../../packages/shared-utils/src'),
        '@uaip/config': path.resolve(import.meta.dirname, '../config/src'),
        '@uaip/middleware': path.resolve(import.meta.dirname, '../middleware/src'),
        '@uaip/shared-services': path.resolve(import.meta.dirname, '../services/src'),
      },
    },
  })
);
