import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/capability-registry',
      // Supplies the fail-fast env vars `@uaip/config` demands at import time.
      // Without it, any test that transitively imports shared config dies during
      // collection rather than running — see src/__tests__/setup.ts.
      setupFiles: ['./src/__tests__/setup.ts'],
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
        '@uaip/infra': path.resolve(import.meta.dirname, '../../../shared/infra/src'),
        '@uaip/middleware': path.resolve(import.meta.dirname, '../../../shared/middleware/src'),
        '@uaip/shared-services': path.resolve(import.meta.dirname, '../../../shared/services/src'),
      },
    },
  })
);
