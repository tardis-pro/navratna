import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';

// LLM provider types
export enum LLMProviderType {
  OLLAMA = 'ollama',
  LLM_STUDIO = 'llmstudio',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  CUSTOM = 'custom'
}

// LLM model information
export const LLMModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  source: z.string(),
  apiEndpoint: z.string().url(),
  apiType: z.nativeEnum(LLMProviderType),
  provider: z.string(),
  isAvailable: z.boolean().default(true),
  contextLength: z.number().optional(),
  maxTokens: z.number().optional(),
  capabilities: z.array(z.enum(['text', 'code', 'reasoning', 'multimodal'])).optional(),
  pricing: z.object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    currency: z.string().default('USD')
  }).optional()
});

export type LLMModel = z.infer<typeof LLMModelSchema>;

// LLM usage tracking
export const LLMUsageSchema = z.object({
  promptTokens: z.number().min(0).default(0),
  completionTokens: z.number().min(0).default(0),
  totalTokens: z.number().min(0).default(0),
  requestCount: z.number().min(0).default(1),
  responseTime: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  model: z.string(),
  provider: z.string(),
  timestamp: z.date()
});

export type LLMUsage = z.infer<typeof LLMUsageSchema>;

// LLM generation request
export const LLMGenerationRequestSchema = z.object({
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().min(1).max(100000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  model: z.string().optional(),
  preferredType: z.nativeEnum(LLMProviderType).optional(),
  stopSequences: z.array(z.string()).optional(),
  stream: z.boolean().default(false),
  userId: IDSchema.optional(),
  sessionId: z.string().optional(),
  context: z.record(z.any()).optional()
});

export type LLMGenerationRequest = z.infer<typeof LLMGenerationRequestSchema>;

// LLM generation response
export const LLMGenerationResponseSchema = z.object({
  response: z.string(),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  usage: LLMUsageSchema.optional(),
  model: z.string(),
  provider: z.string(),
  finishReason: z.enum(['stop', 'length', 'content_filter', 'error']).optional(),
  generatedAt: z.date(),
  requestId: z.string().optional()
});

export type LLMGenerationResponse = z.infer<typeof LLMGenerationResponseSchema>;

// Agent-specific LLM request
export const AgentLLMRequestSchema = z.object({
  agent: z.object({
    id: IDSchema,
    name: z.string(),
    role: z.string(),
    capabilities: z.array(z.string()),
    context: z.record(z.any()).optional()
  }),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    metadata: z.record(z.any()).optional(),
    timestamp: z.date().optional()
  })),
  context: z.object({
    conversationId: IDSchema.optional(),
    sessionId: z.string().optional(),
    environment: z.record(z.any()).optional()
  }).optional(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.any()).optional()
  })).optional(),
  preferences: z.object({
    model: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional()
  }).optional()
});

export type AgentLLMRequest = z.infer<typeof AgentLLMRequestSchema>;

// Context analysis request
export const ContextAnalysisRequestSchema = z.object({
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    timestamp: z.date(),
    metadata: z.record(z.any()).optional()
  })),
  currentContext: z.record(z.any()).optional(),
  userRequest: z.string().optional(),
  agentCapabilities: z.array(z.string()).optional(),
  analysisDepth: z.enum(['basic', 'intermediate', 'advanced']).default('intermediate')
});

export type ContextAnalysisRequest = z.infer<typeof ContextAnalysisRequestSchema>;

// Context analysis response
export const ContextAnalysisResponseSchema = z.object({
  analysis: z.object({
    intent: z.object({
      primary: z.string(),
      secondary: z.array(z.string()),
      confidence: z.number().min(0).max(1)
    }),
    entities: z.array(z.object({
      type: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1)
    })),
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    complexity: z.enum(['low', 'medium', 'high']),
    topics: z.array(z.string()),
    urgency: z.enum(['low', 'medium', 'high'])
  }),
  insights: z.array(z.string()),
  recommendations: z.array(z.object({
    type: z.string(),
    description: z.string(),
    confidence: z.number().min(0).max(1)
  })),
  usage: LLMUsageSchema.optional(),
  analyzedAt: z.date()
});

export type ContextAnalysisResponse = z.infer<typeof ContextAnalysisResponseSchema>;

// LLM-based artifact generation request
export const LLMArtifactGenerationRequestSchema = z.object({
  type: z.enum(['code', 'document', 'configuration', 'test', 'schema']),
  prompt: z.string().min(1),
  language: z.string().optional(),
  framework: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  constraints: z.object({
    maxLines: z.number().optional(),
    style: z.string().optional(),
    conventions: z.array(z.string()).optional()
  }).optional(),
  context: z.record(z.any()).optional()
});

export type LLMArtifactGenerationRequest = z.infer<typeof LLMArtifactGenerationRequestSchema>;

// LLM-based artifact generation response
export const LLMArtifactGenerationResponseSchema = z.object({
  artifact: z.object({
    type: z.string(),
    content: z.string(),
    metadata: z.object({
      language: z.string().optional(),
      framework: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
      version: z.string().optional()
    }),
    validation: z.object({
      syntaxValid: z.boolean(),
      errors: z.array(z.string()),
      warnings: z.array(z.string())
    }).optional()
  }),
  explanation: z.string().optional(),
  usage: LLMUsageSchema.optional(),
  generatedAt: z.date()
});

export type LLMArtifactGenerationResponse = z.infer<typeof LLMArtifactGenerationResponseSchema>;

// Provider statistics
export const ProviderStatsSchema = z.object({
  name: z.string(),
  type: z.nativeEnum(LLMProviderType),
  available: z.boolean(),
  totalRequests: z.number().min(0).default(0),
  successfulRequests: z.number().min(0).default(0),
  failedRequests: z.number().min(0).default(0),
  averageResponseTime: z.number().min(0).optional(),
  totalTokensUsed: z.number().min(0).default(0),
  totalCost: z.number().min(0).default(0),
  lastUsed: z.date().optional(),
  uptime: z.number().min(0).max(100).optional(),
  healthStatus: z.enum(['healthy', 'degraded', 'unavailable']).default('healthy')
});

export type ProviderStats = z.infer<typeof ProviderStatsSchema>; 