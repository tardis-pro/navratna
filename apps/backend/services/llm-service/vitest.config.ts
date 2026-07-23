import { mergeConfig, defineProject } from 'vitest/config'
import { sharedBackendConfig } from '../../../../vitest.shared.js'

export default mergeConfig(
  sharedBackendConfig,
  defineProject({
    test: {
      name: '@uaip/llm-service-api',
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    },
  })
)
