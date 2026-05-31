import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/utils',
      setupFiles: [],
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
      coverage: {
        include: ['src/**/*.ts'],
      },
    },
    resolve: {
      alias: {
        '@uaip/types': path.resolve(import.meta.dirname, '../shared-types/src'),
      },
    },
  })
);
