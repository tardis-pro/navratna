import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/middleware',
      setupFiles: [],
      coverage: {
        include: ['src/**/*.ts'],
        thresholds: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@uaip/config': path.resolve(import.meta.dirname, '../config/src'),
        '@uaip/types': path.resolve(import.meta.dirname, '../../packages/shared-types/src'),
        '@uaip/utils': path.resolve(import.meta.dirname, '../../packages/shared-utils/src'),
      },
    },
  })
);
