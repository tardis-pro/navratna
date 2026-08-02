import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/orchestration-pipeline',
      setupFiles: ['./src/__tests__/setup.ts'],
      testTimeout: 15_000,
      coverage: {
        include: ['src/**/*.ts'],
        thresholds: {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75,
        },
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
        '@uaip/shared-services/drizzle/clients': path.resolve(
          import.meta.dirname,
          '../../../shared/services/src/database/drizzle/clients/index.ts'
        ),
        '@uaip/shared-services/drizzle/control': path.resolve(
          import.meta.dirname,
          '../../../shared/services/src/database/drizzle/schemas/control_schema.ts'
        ),
        '@uaip/shared-services': path.resolve(import.meta.dirname, '../../../shared/services/src'),
        '@uaip/llm-service': path.resolve(import.meta.dirname, '../../../shared/llm-service/src'),
      },
    },
  })
);
