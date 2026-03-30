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
