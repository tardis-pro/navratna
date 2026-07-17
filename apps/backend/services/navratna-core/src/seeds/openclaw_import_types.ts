// Types for the OpenClaw agent import ONLY. These live next to the importer, not in the
// shared @uaip/types package — the substrate's type system must stay ignorant of which
// ecosystem's data is being imported. OpenClaw is one source of persona/workflow rows,
// nothing the runtime needs to know about.

export interface OpenClawModelDefinition {
  id: string
  name?: string
  reasoning?: boolean
  input?: string[]
  contextWindow?: number
  maxTokens?: number
  cost?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
  }
}

export interface OpenClawProviderDefinition {
  baseUrl: string
  api?: string
  models: OpenClawModelDefinition[]
}

export interface AgentRouting {
  providerAlias: string
  modelId: string
}

export interface ImportAgentData {
  name: string
  systemPrompt: string
  routing?: AgentRouting
}
