import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/artifact-service',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    },
    resolve: {
      alias: [
        {
          find: /^@uaip\/shared-services$/,
          replacement: path.resolve(import.meta.dirname, '../../../shared/services/src/index.ts'),
        },
        {
          find: '@uaip/shared-services/drizzle/intelligence',
          replacement: path.resolve(import.meta.dirname, '../../../shared/services/src/database/drizzle/schemas/intelligence_schema.ts'),
        },
        {
          find: '@uaip/shared-services/drizzle/control',
          replacement: path.resolve(import.meta.dirname, '../../../shared/services/src/database/drizzle/schemas/control_schema.ts'),
        },
        {
          find: /^@uaip\/shared-services\/(.*)$/,
          replacement: path.resolve(import.meta.dirname, '../../../shared/services/src/database/$1'),
        },
        {
          find: '@uaip/types',
          replacement: path.resolve(import.meta.dirname, '../../../packages/shared-types/src'),
        },
        {
          find: '@uaip/utils',
          replacement: path.resolve(import.meta.dirname, '../../../packages/shared-utils/src'),
        },
        {
          find: '@uaip/config',
          replacement: path.resolve(import.meta.dirname, '../../../shared/config/src'),
        },
        {
          find: '@uaip/infra',
          replacement: path.resolve(import.meta.dirname, '../../../shared/infra/src'),
        },
        {
          find: '@uaip/middleware',
          replacement: path.resolve(import.meta.dirname, '../../../shared/middleware/src'),
        },
      ],
    },
  })
);