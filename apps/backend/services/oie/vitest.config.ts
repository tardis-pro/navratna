import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/oie',
      testTimeout: 30_000,
      coverage: {
        include: ['src/**/*.ts'],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@uaip/types': path.resolve(import.meta.dirname, '../../../packages/shared-types/src'),
        '@uaip/utils': path.resolve(import.meta.dirname, '../../../packages/shared-utils/src'),
        '@uaip/config': path.resolve(import.meta.dirname, '../../../shared/config/src'),
      },
    },
  })
);
