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

export const coreApp = new Elysia({ name: 'navratna-core' })
  .get('/health', () => ({ status: 'ok' as 'ok' | 'degraded', service: 'navratna-core', features: [] as string[] }))
  .get('/health/detailed', () => ({ status: 'ok' as 'ok' | 'degraded', service: 'navratna-core', timestamp: '', uptime: 0, features: [] as string[], timing: { p95: 0, p50: 0, avg: 0, sampleCount: 0 }, memory: { heapUsed: 0, heapTotal: 0, rss: 0, external: 0 }, cpu: { user: 0, system: 0 } }))
  .use(registerAgentRoutes())
  .use(registerAgentCrudRoutes(null as never))
  .use(registerAgentChatRoutes(null as never, null as never, null as never))
  .use(registerAgentCapabilityRoutes(null as never, null as never))
  .use(registerAgentMemoryRoutes(null as never))
  .use(registerConstellationRoutes())
  .use(registerPersonaRoutes(null as never))
  .use(registerDiscussionRoutes(null as never, null as never))
  .use(registerArtifactRoutes(null as never))
  .use(registerShortLinkRoutes())
  .use(registerLLMRoutes(null as never, null as never, null as never))
  .use(registerUserLLMRoutes(null as never))
  .use(registerKnowledgeIngestRoutes())
  .use(registerCognitivePortraitRoutes())

export type NavratnaCoreApp = typeof coreApp
