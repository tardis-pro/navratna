import { Elysia } from 'elysia'

import {
  registerAgentRoutes,
  registerAgentCrudRoutes,
  registerAgentChatRoutes,
  registerAgentCapabilityRoutes,
  registerAgentMemoryRoutes,
  registerConstellationRoutes,
  registerCognitivePortraitRoutes,
} from '@uaip/agent-intelligence-core'
import { registerPersonaRoutes, registerDiscussionRoutes } from '@uaip/discussion-core'
import { registerArtifactRoutes } from '../../artifact-service/src/routes/artifact_routes.js'
import { registerShortLinkRoutes } from '../../artifact-service/src/routes/short_link_routes.js'
import { registerLLMRoutes } from '../../llm-service/src/routes/llm_routes.js'
import { registerUserLLMRoutes } from '../../llm-service/src/routes/user_llm_routes.js'
import { registerKnowledgeIngestRoutes } from './routes/knowledge_ingest_routes.js'
import { registerDeploymentRoutes } from './deployment/deployment_routes.js'
import { registerOnboardingRoutes } from './onboarding/onboarding_routes.js'
import { registerCompositionRoutes } from './composition/composition_routes.js'
import { registerTaskDAGRoutes } from './taskdag/task_dag_routes.js'

type CoreHealthStatus = 'ok' | 'degraded'

type CoreHealthResponse = {
  status: CoreHealthStatus
  service: string
  features: string[]
}

type CoreDetailedHealthResponse = {
  status: CoreHealthStatus
  service: string
  timestamp: string
  uptime: number
  features: string[]
  timing: { p95: number; p50: number; avg: number; sampleCount: number }
  memory: { heapUsed: number; heapTotal: number; rss: number; external: number }
  cpu: { user: number; system: number }
}

// app.ts is a type-export stub for Eden — services are null here and initialized at
// runtime in index.ts. The stub is never executed, so a typed-null is passed to each
// route registrar purely to derive `typeof coreApp`.
const typeExportStub = null as never

export const coreApp = new Elysia({ name: 'navratna-core' })
  .get('/health', (): CoreHealthResponse => ({ status: 'ok', service: 'navratna-core', features: [] }))
  .get('/health/detailed', (): CoreDetailedHealthResponse => ({ status: 'ok', service: 'navratna-core', timestamp: '', uptime: 0, features: [], timing: { p95: 0, p50: 0, avg: 0, sampleCount: 0 }, memory: { heapUsed: 0, heapTotal: 0, rss: 0, external: 0 }, cpu: { user: 0, system: 0 } }))
  .use(registerAgentRoutes())
  .use(registerAgentCrudRoutes(typeExportStub))
  .use(registerAgentChatRoutes(typeExportStub, typeExportStub, typeExportStub))
  .use(registerAgentCapabilityRoutes(typeExportStub, typeExportStub))
  .use(registerAgentMemoryRoutes(typeExportStub))
  .use(registerConstellationRoutes())
  .use(registerPersonaRoutes(typeExportStub))
  .use(registerDiscussionRoutes(typeExportStub, typeExportStub))
  .use(registerArtifactRoutes(typeExportStub))
  .use(registerShortLinkRoutes())
  .use(registerLLMRoutes(typeExportStub, typeExportStub, typeExportStub))
  .use(registerUserLLMRoutes(typeExportStub))
  .use(registerKnowledgeIngestRoutes())
  .use(registerCognitivePortraitRoutes())
  .use(registerDeploymentRoutes(typeExportStub))
  .use(registerOnboardingRoutes())
  .use(registerCompositionRoutes())
  .use(registerTaskDAGRoutes(typeExportStub))

export type NavratnaCoreApp = typeof coreApp
