import { Elysia } from 'elysia'

import { registerAgentRoutes } from '../../agent-intelligence/src/routes/agent_routes.js'
import { registerAgentCrudRoutes } from '../../agent-intelligence/src/routes/agents_crud_routes.js'
import { registerAgentChatRoutes } from '../../agent-intelligence/src/routes/agent_chat_routes.js'
import { registerAgentCapabilityRoutes } from '../../agent-intelligence/src/routes/agent_capability_routes.js'
import { registerAgentMemoryRoutes } from '../../agent-intelligence/src/routes/agent_memory_routes.js'
import { registerConstellationRoutes } from '../../agent-intelligence/src/routes/constellation_routes.js'
import { registerPersonaRoutes } from '../../discussion-orchestration/src/routes/persona_routes.js'
import { registerDiscussionRoutes } from '../../discussion-orchestration/src/routes/discussion_routes.js'
import { registerArtifactRoutes } from '../../artifact-service/src/routes/artifact_routes.js'
import { registerShortLinkRoutes } from '../../artifact-service/src/routes/short_link_routes.js'
import { registerLLMRoutes } from '../../llm-service/src/routes/llm_routes.js'
import { registerUserLLMRoutes } from '../../llm-service/src/routes/user_llm_routes.js'
import { registerKnowledgeIngestRoutes } from './routes/knowledge_ingest_routes.js'
import { registerCognitivePortraitRoutes } from '../../agent-intelligence/src/routes/cognitive_portrait_routes.js'

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

export const coreApp = new Elysia({ name: 'navratna-core' })
  .get('/health', (): CoreHealthResponse => ({ status: 'ok', service: 'navratna-core', features: [] }))
  .get('/health/detailed', (): CoreDetailedHealthResponse => ({ status: 'ok', service: 'navratna-core', timestamp: '', uptime: 0, features: [], timing: { p95: 0, p50: 0, avg: 0, sampleCount: 0 }, memory: { heapUsed: 0, heapTotal: 0, rss: 0, external: 0 }, cpu: { user: 0, system: 0 } }))
  .use(registerAgentRoutes())
  // Services are null here; app.ts is a type-export stub — services are initialized at runtime in index.ts
  .use(registerAgentCrudRoutes(null))
  .use(registerAgentChatRoutes(null, null, null))
  .use(registerAgentCapabilityRoutes(null, null))
  .use(registerAgentMemoryRoutes(null))
  .use(registerConstellationRoutes())
  .use(registerPersonaRoutes(null))
  .use(registerDiscussionRoutes(null, null))
  .use(registerArtifactRoutes(null))
  .use(registerShortLinkRoutes())
  .use(registerLLMRoutes(null, null, null))
  .use(registerUserLLMRoutes(null))
  .use(registerKnowledgeIngestRoutes())
  .use(registerCognitivePortraitRoutes())

export type NavratnaCoreApp = typeof coreApp
