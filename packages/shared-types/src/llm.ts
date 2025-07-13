import { z } from 'zod';
import { IDSchema } from './common.js';

// LLM provider types

export enum LLMProviderStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  TESTING = 'testing'
}

export enum LLMProviderType {
  OLLAMA = 'ollama',
  OPENAI = 'openai',
  LLMSTUDIO = 'llmstudio',
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
  capabilities: z.array(z.enum([
    'text', 
    'code', 
    'reasoning', 
    'multimodal',
    'vision-to-text',
    'audio-to-text', 
    'audio-to-audio',
    'tool-calling',
    'function-calling',
    'image-generation',
    'embeddings'
  ])).optional(),
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

// Model capability detection and management
export enum ModelCapability {
  TEXT = 'text',
  CODE = 'code',
  REASONING = 'reasoning',
  MULTIMODAL = 'multimodal',
  VISION_TO_TEXT = 'vision-to-text',
  AUDIO_TO_TEXT = 'audio-to-text',
  AUDIO_TO_AUDIO = 'audio-to-audio',
  TOOL_CALLING = 'tool-calling',
  FUNCTION_CALLING = 'function-calling',
  IMAGE_GENERATION = 'image-generation',
  EMBEDDINGS = 'embeddings'
}

export const ModelCapabilityDetectionSchema = z.object({
  modelId: z.string(),
  provider: z.nativeEnum(LLMProviderType),
  detectedCapabilities: z.array(z.nativeEnum(ModelCapability)),
  testedAt: z.date(),
  testResults: z.record(z.object({
    supported: z.boolean(),
    confidence: z.number().min(0).max(1),
    testMethod: z.enum(['api-call', 'documentation', 'inference', 'manual']),
    notes: z.string().optional()
  })).optional()
});

export type ModelCapabilityDetection = z.infer<typeof ModelCapabilityDetectionSchema>;

// Default model configurations with capabilities
export const DefaultModelConfigSchema = z.object({
  provider: z.nativeEnum(LLMProviderType),
  modelId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  capabilities: z.array(z.nativeEnum(ModelCapability)),
  defaultSettings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).optional(),
    topP: z.number().min(0).max(1).optional()
  }).optional(),
  priority: z.number().min(1).max(100).default(50),
  isRecommended: z.boolean().default(false)
});

export type DefaultModelConfig = z.infer<typeof DefaultModelConfigSchema>;

// Force onboard request schema
export const ForceOnboardRequestSchema = z.object({
  userId: z.string(),
  resetPersona: z.boolean().default(false),
  resetProviders: z.boolean().default(false),
  resetModels: z.boolean().default(false),
  detectCapabilities: z.boolean().default(true),
  reason: z.string().optional()
});

export type ForceOnboardRequest = z.infer<typeof ForceOnboardRequestSchema>;

// User LLM Meta Models for specialized tasks
export enum LLMTaskType {
  SUMMARIZATION = 'summarization',
  VISION = 'vision',
  TOOL_CALLING = 'tool_calling',
  SPEECH_TO_TEXT = 'speech_to_text',
  TEXT_TO_SPEECH = 'text_to_speech',
  CODE_GENERATION = 'code_generation',
  REASONING = 'reasoning',
  CREATIVE_WRITING = 'creative_writing',
  TRANSLATION = 'translation',
  EMBEDDINGS = 'embeddings',
  CLASSIFICATION = 'classification'
}

export const UserLLMPreferenceSchema = z.object({
  id: IDSchema,
  userId: IDSchema,
  taskType: z.nativeEnum(LLMTaskType),
  preferredProvider: z.nativeEnum(LLMProviderType),
  preferredModel: z.string(),
  fallbackModel: z.string().optional(),
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).optional(),
    topP: z.number().min(0).max(1).optional(),
    systemPrompt: z.string().optional(),
    customSettings: z.record(z.any()).optional()
  }).optional(),
  isActive: z.boolean().default(true),
  priority: z.number().min(1).max(100).default(50),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type UserLLMPreference = z.infer<typeof UserLLMPreferenceSchema>;

// Agent LLM Preferences Schema
export const AgentLLMPreferenceSchema = z.object({
  id: IDSchema.optional(),
  agentId: IDSchema,
  taskType: z.nativeEnum(LLMTaskType),
  preferredProvider: z.nativeEnum(LLMProviderType),
  preferredModel: z.string(),
  fallbackModel: z.string().optional(),
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).optional(),
    topP: z.number().min(0).max(1).optional(),
    systemPrompt: z.string().optional(),
    customSettings: z.record(z.any()).optional()
  }).optional(),
  isActive: z.boolean().default(true),
  priority: z.number().min(1).max(100).default(50),
  description: z.string().optional(),
  reasoning: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type AgentLLMPreference = z.infer<typeof AgentLLMPreferenceSchema>;

// Agent routing domain classification
export enum DiscussionDomain {
  TECHNICAL_ARCHITECTURE = 'technical_architecture',
  PROJECT_MANAGEMENT = 'project_management',
  CODE_REVIEW = 'code_review',
  STRATEGIC_PLANNING = 'strategic_planning',
  CRISIS_RESPONSE = 'crisis_response',
  KNOWLEDGE_SYNTHESIS = 'knowledge_synthesis',
  USER_EXPERIENCE = 'user_experience',
  SECURITY_ANALYSIS = 'security_analysis',
  PERFORMANCE_OPTIMIZATION = 'performance_optimization',
  COMPLIANCE_AUDIT = 'compliance_audit',
  CREATIVE_BRAINSTORMING = 'creative_brainstorming',
  TECHNICAL_SUPPORT = 'technical_support',
  BUSINESS_PROCESS = 'business_process',
  CUSTOMER_ONBOARDING = 'customer_onboarding',
  INVOICE_PROCESSING = 'invoice_processing',
  EMPLOYEE_ONBOARDING = 'employee_onboarding',
  VENDOR_MANAGEMENT = 'vendor_management',
  QUALITY_ASSURANCE = 'quality_assurance',
  FINANCIAL_REPORTING = 'financial_reporting'
}

// Agent routing action classification
export enum DiscussionAction {
  ANALYZE = 'analyze',
  SYNTHESIZE = 'synthesize',
  DECIDE = 'decide',
  VALIDATE = 'validate',
  EXECUTE = 'execute',
  BRAINSTORM = 'brainstorm',
  TROUBLESHOOT = 'troubleshoot',
  REVIEW = 'review',
  PLAN = 'plan',
  ESCALATE = 'escalate',
  DOCUMENT = 'document',
  COORDINATE = 'coordinate',
  FACILITATE = 'facilitate',
  MEDIATE = 'mediate',
  PROCESS_CREATION = 'process_creation',
  STEP_EXECUTION = 'step_execution',
  APPROVAL_WORKFLOW = 'approval_workflow',
  COMPLIANCE_CHECK = 'compliance_check',
  PROCESS_OPTIMIZATION = 'process_optimization',
  EXCEPTION_HANDLING = 'exception_handling',
  AUDIT_TRAIL = 'audit_trail',
  STAKEHOLDER_COMMUNICATION = 'stakeholder_communication'
}

// Agent routing request
export const RoutingRequestSchema = z.object({
  domain: z.nativeEnum(DiscussionDomain),
  action: z.nativeEnum(DiscussionAction),
  context: z.object({
    complexity: z.enum(['low', 'medium', 'high']).optional(),
    urgency: z.enum(['low', 'normal', 'high', 'critical']).optional(),
    requiredTools: z.array(z.string()).optional(),
    timeConstraints: z.number().optional(), // minutes
    participantCount: z.number().optional(),
    expertise: z.array(z.string()).optional(),
    securityLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional()
  }).optional(),
  preferences: z.object({
    preferredAgents: z.array(IDSchema).optional(),
    excludedAgents: z.array(IDSchema).optional(),
    maxAgents: z.number().optional(),
    requireHuman: z.boolean().optional()
  }).optional()
});

export type RoutingRequest = z.infer<typeof RoutingRequestSchema>;

// Agent routing response
export const RoutingResponseSchema = z.object({
  primaryAgent: IDSchema,
  supportingAgents: z.array(IDSchema).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
  estimatedDuration: z.number().optional(), // minutes
  requiredCapabilities: z.array(z.string()).optional(),
  riskAssessment: z.object({
    level: z.enum(['low', 'medium', 'high']),
    factors: z.array(z.string()).optional()
  }).optional(),
  fallbackOptions: z.array(z.object({
    agent: IDSchema,
    reason: z.string()
  })).optional(),
  routedAt: z.date()
});

export type RoutingResponse = z.infer<typeof RoutingResponseSchema>; 