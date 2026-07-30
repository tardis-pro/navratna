import { mergeConfig, defineProject } from 'vitest/config'
import { sharedBackendConfig } from '../../../../vitest.shared.js'

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/llm-service-api',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    },
  })
)
