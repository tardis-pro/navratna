import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/security-gateway',
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
        '@uaip/types': path.resolve(import.meta.dirname, '../../../packages/shared-types/src'),
        '@uaip/utils': path.resolve(import.meta.dirname, '../../../packages/shared-utils/src'),
        '@uaip/config': path.resolve(import.meta.dirname, '../../../shared/config/src'),
        '@uaip/infra': path.resolve(import.meta.dirname, '../../../shared/infra/src'),
        '@uaip/middleware': path.resolve(import.meta.dirname, '../../../shared/middleware/src'),
        // Subpath aliases MUST precede the package-root alias: Vite matches string
        // aliases by prefix in order, so a bare '@uaip/shared-services' entry would
        // rewrite '@uaip/shared-services/drizzle/clients' to a src/drizzle path that
        // does not exist (the real files live under src/database/drizzle).
        '@uaip/shared-services/drizzle/clients': path.resolve(
          import.meta.dirname,
          '../../../shared/services/src/database/drizzle/clients'
        ),
        '@uaip/shared-services/drizzle/control': path.resolve(
          import.meta.dirname,
          '../../../shared/services/src/database/drizzle/schemas/control_schema.ts'
        ),
        '@uaip/shared-services/drizzle/intelligence': path.resolve(
          import.meta.dirname,
          '../../../shared/services/src/database/drizzle/schemas/intelligence_schema.ts'
        ),
        '@uaip/shared-services': path.resolve(import.meta.dirname, '../../../shared/services/src'),
        '@uaip/llm-service': path.resolve(import.meta.dirname, '../../../shared/llm-service/src'),
      },
    },
  })
);
