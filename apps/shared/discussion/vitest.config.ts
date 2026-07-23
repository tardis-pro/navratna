import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/discussion-core',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    },
    resolve: {
      alias: {
        '@/': path.resolve(import.meta.dirname, 'src') + '/',
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