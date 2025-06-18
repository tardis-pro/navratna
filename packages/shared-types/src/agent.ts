import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';

// Agent types
export enum AgentRole {
  ASSISTANT = 'assistant',
  ANALYZER = 'analyzer', 
  ORCHESTRATOR = 'orchestrator',
  SPECIALIST = 'specialist'
}

export const AgentPersonaSchema = z.object({
  name: z.string(),
  description: z.string(),
  capabilities: z.array(z.string()),
  constraints: z.record(z.any()).optional(),
  preferences: z.record(z.any()).optional()
});

export type AgentPersona = z.infer<typeof AgentPersonaSchema>;

export const AgentIntelligenceConfigSchema = z.object({
  analysisDepth: z.enum(['basic', 'intermediate', 'advanced']).default('intermediate'),
  contextWindowSize: z.number().positive().default(4000),
  decisionThreshold: z.number().min(0).max(1).default(0.7),
  learningEnabled: z.boolean().default(true),
  collaborationMode: z.enum(['independent', 'collaborative', 'supervised']).default('collaborative')
});

export type AgentIntelligenceConfig = z.infer<typeof AgentIntelligenceConfigSchema>;

export const AgentSecurityContextSchema = z.object({
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  allowedCapabilities: z.array(z.string()),
  restrictedDomains: z.array(z.string()).optional(),
  approvalRequired: z.boolean().default(false),
  auditLevel: z.enum(['minimal', 'standard', 'comprehensive']).default('standard')
});

export type AgentSecurityContext = z.infer<typeof AgentSecurityContextSchema>;

export const AgentSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  role: z.nativeEnum(AgentRole),
  personaId: IDSchema,
  persona: AgentPersonaSchema.optional(),
  intelligenceConfig: AgentIntelligenceConfigSchema,
  securityContext: AgentSecurityContextSchema,
  isActive: z.boolean().default(true),
  createdBy: IDSchema,    
  lastActiveAt: z.date().optional(),
  configuration: z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    analysisDepth: z.enum(['basic', 'intermediate', 'advanced']).optional(),
    contextWindowSize: z.number().positive().optional(),
    decisionThreshold: z.number().min(0).max(1).optional(),
    learningEnabled: z.boolean().optional(),
    collaborationMode: z.enum(['independent', 'collaborative', 'supervised']).optional()
  }).optional(),
  // Model configuration fields (direct agent fields, not in configuration)
  modelId: z.string().optional(),
  apiType: z.enum(['ollama', 'llmstudio']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  systemPrompt: z.string().optional()
});

export type Agent = z.infer<typeof AgentSchema>;

// Agent Create Schema - for creating new agents (excludes auto-generated fields)
export const AgentCreateSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.nativeEnum(AgentRole),
  personaId: IDSchema,
  persona: AgentPersonaSchema.optional(),
  intelligenceConfig: AgentIntelligenceConfigSchema.optional(),
  securityContext: AgentSecurityContextSchema.optional(),
  isActive: z.boolean().default(true).optional(),
  createdBy: IDSchema
});

export type AgentCreate = z.infer<typeof AgentCreateSchema>;

// Agent Create Request Schema - for API requests (user-friendly format)
export const AgentCreateRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1),
  capabilities: z.array(z.string()).min(1),
  role: z.nativeEnum(AgentRole).optional().default(AgentRole.ASSISTANT),
  personaId: IDSchema.optional(),
  persona: AgentPersonaSchema.optional(),
  configuration: z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    analysisDepth: z.enum(['basic', 'intermediate', 'advanced']).optional(),
    contextWindowSize: z.number().positive().optional(),
    decisionThreshold: z.number().min(0).max(1).optional(),
    learningEnabled: z.boolean().optional(),
    collaborationMode: z.enum(['independent', 'collaborative', 'supervised']).optional()
  }).optional(),
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  isActive: z.boolean().optional().default(true)
}).refine(
  (data) => data.personaId || data.persona,
  {
    message: "Either personaId or persona data must be provided",
    path: ["personaId"]
  }
);

export type AgentCreateRequest = z.infer<typeof AgentCreateRequestSchema>;

// Agent Update Schema - for updating existing agents (all fields optional except constraints)
export const AgentUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.nativeEnum(AgentRole).optional(),
  personaId: IDSchema.optional(),
  persona: AgentPersonaSchema.optional(),
  intelligenceConfig: AgentIntelligenceConfigSchema.optional(),
  configuration: z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    analysisDepth: z.enum(['basic', 'intermediate', 'advanced']).optional(),
    contextWindowSize: z.number().positive().optional(),
    decisionThreshold: z.number().min(0).max(1).optional(),
    learningEnabled: z.boolean().optional(),
    collaborationMode: z.enum(['independent', 'collaborative', 'supervised']).optional()
  }).optional(),
  securityContext: AgentSecurityContextSchema.optional(),
  isActive: z.boolean().optional(),
  lastActiveAt: z.date().optional(),
  // Model configuration fields (direct agent fields, not in configuration)
  modelId: z.string().optional(),
  apiType: z.enum(['ollama', 'llmstudio']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  systemPrompt: z.string().optional()
});

export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;

// Conversation types
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

export const MessageSchema = z.object({
  id: IDSchema,
  role: z.nativeEnum(MessageRole),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  timestamp: z.date()
});

export type Message = z.infer<typeof MessageSchema>;

export const ConversationContextSchema = z.object({
  id: IDSchema,
  agentId: IDSchema,
  userId: IDSchema,
  messages: z.array(MessageSchema),
  metadata: z.record(z.any()).optional(),
  startedAt: z.date(),
  lastActivityAt: z.date()
});

export type ConversationContext = z.infer<typeof ConversationContextSchema>;

// Agent analysis types
export const ContextAnalysisSchema = z.object({
  conversationContext: ConversationContextSchema,
  userRequest: z.string(),
  constraints: z.record(z.any()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium')
});

export type ContextAnalysis = z.infer<typeof ContextAnalysisSchema>;

export const ActionRecommendationSchema = z.object({
  type: z.enum(['tool_execution', 'artifact_generation', 'hybrid_workflow', 'clarification']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  estimatedDuration: z.number().optional(),
  requiredCapabilities: z.array(z.string()),
  riskLevel: z.enum(['low', 'medium', 'high']).default('low')
});

export type ActionRecommendation = z.infer<typeof ActionRecommendationSchema>;

export const AgentAnalysisResultSchema = z.object({
  analysis: z.object({
    intent: z.string(),
    entities: z.array(z.record(z.any())),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
    complexity: z.enum(['simple', 'moderate', 'complex']),
    urgency: z.enum(['low', 'medium', 'high'])
  }),
  recommendedActions: z.array(ActionRecommendationSchema),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  suggestedCapabilities: z.array(z.string()).optional()
});

export type AgentAnalysisResult = z.infer<typeof AgentAnalysisResultSchema>;

// Extended AgentAnalysis type for intelligence service
export const AgentAnalysisSchema = z.object({
  analysis: z.object({
    context: z.object({
      messageCount: z.number(),
      participants: z.array(z.string()),
      topics: z.array(z.string()),
      sentiment: z.string(),
      complexity: z.string(),
      urgency: z.string()
    }),
    intent: z.object({
      primary: z.string(),
      secondary: z.array(z.string()),
      confidence: z.number(),
      entities: z.array(z.any()),
      complexity: z.string()
    }),
    agentCapabilities: z.object({
      tools: z.array(z.string()),
      artifacts: z.array(z.string()),
      specializations: z.array(z.string()),
      limitations: z.array(z.string())
    }),
    environmentFactors: z.object({
      timeOfDay: z.number(),
      userLoad: z.number(),
      systemLoad: z.string(),
      availableResources: z.string()
    })
  }),
  recommendedActions: z.array(z.object({
    type: z.string(),
    confidence: z.number(),
    description: z.string(),
    estimatedDuration: z.number()
  })),
  confidence: z.number(),
  explanation: z.string(),
  timestamp: z.date()
});

export type AgentAnalysis = z.infer<typeof AgentAnalysisSchema>;

// ExecutionPlan type for intelligence service
export const ExecutionPlanSchema = z.object({
  id: IDSchema,
  type: z.string(),
  agentId: IDSchema,
  steps: z.array(z.object({
    id: IDSchema,
    type: z.string(),
    description: z.string(),
    estimatedDuration: z.number(),
    required: z.boolean()
  })),
  dependencies: z.array(z.string()),
  estimatedDuration: z.number(),
  priority: z.string(),
  constraints: z.array(z.string()),
  metadata: z.object({
    generatedBy: z.string(),
    basedOnAnalysis: z.date(),
    userPreferences: z.any().optional(),
    version: z.string()
  }),
  created_at: z.date()
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// LearningResult type for intelligence service
export const LearningResultSchema = z.object({
  learningApplied: z.boolean(),
  confidenceAdjustments: z.object({
    overallAdjustment: z.number(),
    specificAdjustments: z.record(z.any())
  }),
  newKnowledge: z.array(z.string()),
  improvedCapabilities: z.array(z.string())
});

export type LearningResult = z.infer<typeof LearningResultSchema>; 