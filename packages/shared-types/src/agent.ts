import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';

// Agent types
export enum AgentRole {
  ASSISTANT = 'assistant',
  ANALYZER = 'analyzer',
  ORCHESTRATOR = 'orchestrator',
  SPECIALIST = 'specialist'
}

export enum AgentStatus {
  INITIALIZING = 'initializing',
  IDLE = 'idle',
  ACTIVE = 'active',
  BUSY = 'busy',
  ERROR = 'error',
  OFFLINE = 'offline',
  SHUTTING_DOWN = 'shutting_down',
  INACTIVE = 'inactive',
  DELETED = 'deleted'
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
  auditLevel: z.enum(['minimal', 'standard', 'comprehensive']).default('standard'),
  maxCapabilities: z.number().optional()
});

export type AgentSecurityContext = z.infer<typeof AgentSecurityContextSchema>;

export const AgentSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  role: z.nativeEnum(AgentRole),
  personaId: IDSchema,
  persona: AgentPersonaSchema.optional(),
  intelligenceConfig: AgentIntelligenceConfigSchema,
  securityContext: AgentSecurityContextSchema,
  isActive: z.boolean().default(true),
  status: z.nativeEnum(AgentStatus).default(AgentStatus.IDLE),
  capabilities: z.array(z.string()).default([]),
  version: z.number().default(1),
  metadata: z.record(z.any()).optional(),
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
  apiType: z.enum(['ollama', 'llmstudio', 'openai', 'anthropic', 'custom']).optional(),
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
  status: z.enum(['idle', 'active', 'busy', 'error', 'offline']).default('idle').optional(),
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
  // Model configuration fields (direct agent fields)
  modelId: z.string().optional(),
  apiType: z.enum(['ollama', 'llmstudio', 'openai', 'anthropic', 'custom']).optional(),
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
  status: z.enum(['idle', 'active', 'busy', 'error', 'offline']).optional(),
  lastActiveAt: z.date().optional(),
  // Model configuration fields (direct agent fields, not in configuration)
  modelId: z.string().optional(),
  apiType: z.enum(['ollama', 'llmstudio', 'openai', 'anthropic', 'custom']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  systemPrompt: z.string().optional()
});

export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;

// Agent Update Request Schema - for API requests (user-friendly format)
export const AgentUpdateRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().min(1).optional(),
  capabilities: z.array(z.string()).optional(),
  role: z.nativeEnum(AgentRole).optional(),
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
  modelId: z.string().optional(),
  apiType: z.enum(['ollama', 'llmstudio', 'openai', 'anthropic', 'custom']).optional(),
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  isActive: z.boolean().optional()
});

export type AgentUpdateRequest = z.infer<typeof AgentUpdateRequestSchema>;

// Agent Create Request Schema - for API requests (user-friendly format)
export const CreateAgentRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1).optional(),
  capabilities: z.array(z.string()).default([]),
  role: z.nativeEnum(AgentRole),
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
  modelId: z.string().optional(),
  apiType: z.enum(['ollama', 'llmstudio', 'openai', 'anthropic', 'custom']).optional(),
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  isActive: z.boolean().default(true)
});

export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;

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
  contextId: z.string().optional(),
  agentId: IDSchema,
  userId: IDSchema,
  messages: z.array(MessageSchema),
  metadata: z.record(z.any()).optional(),
  startedAt: z.date(),
  startTime: z.date().optional(),
  lastActivityAt: z.date(),
  lastInteractionTime: z.date().optional(),
  userPreferences: z.record(z.any()).optional(),
  platform: z.string().optional(),
  device: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  networkQuality: z.string().optional()
});

export type ConversationContext = z.infer<typeof ConversationContextSchema>;

// Environment factors for context analysis
export const EnvironmentFactorsSchema = z.object({
  platform: z.string().default('web'),
  device: z.string().default('desktop'),
  location: z.string().default('unknown'),
  timeOfDay: z.string(),
  dayOfWeek: z.string(),
  timezone: z.string().default('UTC'),
  language: z.string().default('en'),
  networkQuality: z.string().default('good'),
  securityLevel: z.number().min(1).max(5)
});

export type EnvironmentFactors = z.infer<typeof EnvironmentFactorsSchema>;

// Agent analysis types
export const ContextAnalysisSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  timestamp: z.date(),
  conversationContext: ConversationContextSchema,
  userRequest: z.string(),
  userIntent: z.object({
    primary: z.string(),
    secondary: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1),
    keywords: z.array(z.string()).default([]),
    sentiment: z.string()
  }),
  contextualFactors: z.record(z.any()).optional(),
  environmentFactors: EnvironmentFactorsSchema,
  confidence: z.number().min(0).max(1),
  recommendations: z.array(z.string()).default([]),
  relevantKnowledge: z.array(z.any()).default([]),
  constraints: z.record(z.any()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  metadata: z.record(z.any()).optional()
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

// Agent State Machine Types
export enum AgentOperationalState {
  IDLE = 'idle',
  THINKING = 'thinking',
  EXECUTING = 'executing',
  WAITING = 'waiting',
  ERROR = 'error'
}

export const AgentStateTransitionSchema = z.object({
  from: z.nativeEnum(AgentOperationalState),
  to: z.nativeEnum(AgentOperationalState),
  trigger: z.string(),
  timestamp: z.date(),
  metadata: z.record(z.any()).optional()
});

export type AgentStateTransition = z.infer<typeof AgentStateTransitionSchema>;

export const AgentExecutionContextSchema = z.object({
  operationalState: z.nativeEnum(AgentOperationalState),
  currentAction: z.string().optional(),
  capabilities: z.array(z.string()),
  lastTransition: AgentStateTransitionSchema.optional(),
  errorDetails: z.string().optional(),
  stateMetadata: z.record(z.any()).optional()
});

export type AgentExecutionContext = z.infer<typeof AgentExecutionContextSchema>;

// Collaboration Types
export enum CollaborationPatternType {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  HIERARCHICAL = 'hierarchical',
  CONSENSUS = 'consensus'
}

export enum WorkflowStepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  assignedAgentId: z.string(),
  status: z.nativeEnum(WorkflowStepStatus),
  dependsOn: z.array(z.string()).optional(),
  input: z.record(z.any()).optional(),
  output: z.record(z.any()).optional(),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  duration: z.number().optional(),
  errorDetails: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const CollaborationPatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.nativeEnum(CollaborationPatternType),
  steps: z.array(WorkflowStepSchema),
  participantAgents: z.array(z.string()),
  maxConcurrency: z.number().positive().optional(),
  timeoutSeconds: z.number().positive().optional(),
  successCriteria: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export type CollaborationPattern = z.infer<typeof CollaborationPatternSchema>;

export const AgentMessageSchema = z.object({
  id: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string().optional(), // null for broadcast
  workflowId: z.string(),
  stepId: z.string().optional(),
  messageType: z.enum(['task_assignment', 'step_completion', 'data_transfer', 'status_update', 'error_report']),
  content: z.record(z.any()),
  timestamp: z.date(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium')
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>; 