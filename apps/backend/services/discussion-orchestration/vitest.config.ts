import { mergeConfig, defineProject } from 'vitest/config';
import { sharedBackendConfig } from '../../../../vitest.shared.js';
import path from 'path';

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/discussion-orchestration',
      setupFiles: ['./src/__tests__/setup.ts'],
      testTimeout: 15_000,
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
      alias: [
        { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
        { find: '@uaip/types', replacement: path.resolve(import.meta.dirname, '../../../packages/shared-types/src') },
        { find: '@uaip/utils', replacement: path.resolve(import.meta.dirname, '../../../packages/shared-utils/src') },
        { find: '@uaip/config', replacement: path.resolve(import.meta.dirname, '../../../shared/config/src') },
        { find: '@uaip/infra', replacement: path.resolve(import.meta.dirname, '../../../shared/infra/src') },
        { find: '@uaip/middleware', replacement: path.resolve(import.meta.dirname, '../../../shared/middleware/src') },
        { find: '@uaip/shared-services/persona', replacement: path.resolve(import.meta.dirname, '../../../shared/services/src/persona_service.ts') },
        { find: '@uaip/shared-services/discussion', replacement: path.resolve(import.meta.dirname, '../../../shared/services/src/discussion_service.ts') },
        { find: '@uaip/shared-services/feature-factory', replacement: path.resolve(import.meta.dirname, '../../../shared/services/src/feature_factory.ts') },
        { find: '@uaip/shared-services/event-bus', replacement: path.resolve(import.meta.dirname, '../../../shared/services/src/event_bus_service.ts') },
        { find: '@uaip/shared-services', replacement: path.resolve(import.meta.dirname, '../../../shared/services/src') },
        { find: '@uaip/llm-service', replacement: path.resolve(import.meta.dirname, '../../../shared/llm-service/src') },
        { find: '@uaip/discussion-core', replacement: path.resolve(import.meta.dirname, '../../../shared/discussion/src') },
      ],
    },
  })
);
