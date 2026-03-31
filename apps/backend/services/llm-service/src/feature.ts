import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import { UnifiedModelSelectionFacade } from '@uaip/shared-services'
import { LLMService, UserLLMService, ModelBootstrapService } from '@uaip/llm-service'
import { logger } from '@uaip/utils'

import { registerLLMRoutes } from './routes/llm_routes.js'
import { registerUserLLMRoutes } from './routes/user_llm_routes.js'

let llmService: LLMService
let userLLMService: UserLLMService
let modelBootstrapService: ModelBootstrapService

export const llmFeature: Feature = {
  name: 'llm-service',

  async initialize(_deps: ServiceDeps): Promise<void> {
    const modelSelectionFacade = new UnifiedModelSelectionFacade()
    llmService = LLMService.getInstance()
    userLLMService = new UserLLMService(modelSelectionFacade)
    modelBootstrapService = ModelBootstrapService.getInstance()
    logger.info('llm-service feature initialized')
  },

  routes(app) {
    registerLLMRoutes(app, llmService, modelBootstrapService, userLLMService)
    registerUserLLMRoutes(app, userLLMService)
    return app
  },
}
