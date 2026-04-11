import { z } from 'zod';
import { BaseEntitySchema, IDSchema } from './common.js';
import type { ToolDefinition } from './tool.js';

// Agent types
export enum AgentRole {
  ASSISTANT = 'assistant',
  ANALYZER = 'analyzer',
  ORCHESTRATOR = 'orchestrator',
  SPECIALIST = 'specialist',
  EXECUTOR = 'executor',
  ADVISOR = 'advisor',
  STRATEGIST = 'strategist',
  COMMUNICATOR = 'communicator',
  VALIDATOR = 'validator',
  ARCHITECT = 'architect',
  REVIEWER = 'reviewer',
  DESIGNER = 'designer',
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
  DELETED = 'deleted',
}

export const AgentPersonaSchema = z.object({
  name: z.string(),
  description: z.string(),
  capabilities: z.array(z.string()),
  constraints: z.record(z.any()).optional(),
  preferences: z.record(z.any()).optional(),
});

// Agent Skill Schema - OpenCode-compatible skill definition stored in DB
export const AgentSkillSchema = z.object({
  id: z.string().uuid().optional(), // client-generated or server-assigned
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  content: z.string().min(1), // Full SKILL.md body (markdown instructions)
  source: z.enum(['inline', 'filesystem', 'registry']).default('inline'),
  // For filesystem/registry sources - stored for re-sync; not required at runtime
  sourcePath: z.string().optional(), // e.g. '.agents/skills/my-skill/SKILL.md'
  sourceUrl: z.string().url().optional(), // e.g. registry URL
  enabled: z.boolean().default(true),
  // OpenCode-compatible frontmatter fields (optional)
  model: z.string().optional(), // override model for this skill
  allowedTools: z.array(z.string()).optional(), // restrict tools when skill is active
  metadata: z.record(z.any()).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type AgentSkill = z.infer<typeof AgentSkillSchema>;

export type AgentPersona = z.infer<typeof AgentPersonaSchema>;

export const AgentIntelligenceConfigSchema = z.object({
  analysisDepth: z.enum(['basic', 'intermediate', 'advanced']).default('intermediate'),
  contextWindowSize: z.number().positive().default(4000),
  decisionThreshold: z.number().min(0).max(1).default(0.7),
  learningEnabled: z.boolean().default(true),
  collaborationMode: z
    .enum(['independent', 'collaborative', 'supervised'])
    .default('collaborative'),
});

export type AgentIntelligenceConfig = z.infer<typeof AgentIntelligenceConfigSchema>;

export const AgentSecurityContextSchema = z.object({
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  allowedCapabilities: z.array(z.string()),
  restrictedDomains: z.array(z.string()).optional(),
  approvalRequired: z.boolean().default(false),
  auditLevel: z.enum(['minimal', 'standard', 'comprehensive']).default('standard'),
  maxCapabilities: z.number().optional(),
});

export type AgentSecurityContext = z.infer<typeof AgentSecurityContextSchema>;

// ============================================================================
// Shared sub-schemas reused across multiple agent schema variants
// ============================================================================

const AgentConfigSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  analysisDepth: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  contextWindowSize: z.number().positive().optional(),
  decisionThreshold: z.number().min(0).max(1).optional(),
  learningEnabled: z.boolean().optional(),
  collaborationMode: z.enum(['independent', 'collaborative', 'supervised']).optional(),
});

const MCPToolItemSchema = z.object({
  toolId: z.string(),
  toolName: z.string(),
  serverName: z.string(),
  enabled: z.boolean(),
  priority: z.number().optional(),
  parameters: z.record(z.any()).optional(),
});

const MCPToolSettingsSchema = z.object({
  allowedServers: z.array(z.string()).optional(),
  blockedServers: z.array(z.string()).optional(),
  maxToolsPerServer: z.number().positive().optional(),
  autoDiscoveryEnabled: z.boolean().optional(),
});

const AgentModelFieldsSchema = z.object({
  modelId: z.string().optional(),
  apiType: z.enum(['ollama', 'llmstudio', 'openai', 'anthropic', 'custom']).optional(),
  userLLMProviderId: IDSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  systemPrompt: z.string().optional(),
});

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
  skills: z.array(AgentSkillSchema).default([]),
  version: z.number().default(1),
  metadata: z.record(z.any()).optional(),
  createdBy: IDSchema,
  lastActiveAt: z.date().optional(),
  configuration: AgentConfigSchema.optional(),
  ...AgentModelFieldsSchema.shape,

  assignedMCPTools: z.array(MCPToolItemSchema).default([]),

  mcpToolSettings: MCPToolSettingsSchema.optional(),
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
  createdBy: IDSchema,
});

export type AgentCreate = z.infer<typeof AgentCreateSchema>;

// Agent Create Request Schema - for API requests (user-friendly format)
export const AgentCreateRequestSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().min(1),
    capabilities: z.array(z.string()).min(1),
    skills: z.array(AgentSkillSchema).optional().default([]),
    role: z.nativeEnum(AgentRole).optional().default(AgentRole.ASSISTANT),
    personaId: IDSchema.optional(),
    persona: AgentPersonaSchema.optional(),
    // Tool attachment support
    attachedTools: z
      .array(
        z.object({
          toolId: z.string(),
          toolName: z.string(),
          category: z.string(),
          permissions: z.array(z.string()).optional(),
        })
      )
      .optional()
      .default([]),

    assignedMCPTools: z
      .array(MCPToolItemSchema.extend({ enabled: z.boolean().default(true) }))
      .optional()
      .default([]),

    mcpToolSettings: MCPToolSettingsSchema.extend({
      autoDiscoveryEnabled: z.boolean().optional().default(true),
    }).optional(),
    chatConfig: z
      .object({
        enableKnowledgeAccess: z.boolean().optional().default(true),
        enableToolExecution: z.boolean().optional().default(true),
        enableMemoryEnhancement: z.boolean().optional().default(true),
        maxConcurrentChats: z.number().positive().optional().default(5),
        conversationTimeout: z.number().positive().optional().default(3600000), // 1 hour in ms
      })
      .optional(),
    configuration: AgentConfigSchema.optional(),
    modelId: z.string().optional(),
    apiType: z.enum(['ollama', 'llmstudio', 'openai', 'anthropic', 'custom']).optional(),
    securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
    isActive: z.boolean().optional().default(true),
  })
  .refine((data) => data.personaId || data.persona, {
    message: 'Either personaId or persona data must be provided',
    path: ['personaId'],
  });

export type AgentCreateRequest = z.infer<typeof AgentCreateRequestSchema>;

// Agent Update Schema - for updating existing agents (all fields optional except constraints)
export const AgentUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  role: z.nativeEnum(AgentRole).optional(),
  personaId: IDSchema.optional(),
  persona: AgentPersonaSchema.optional(),
  intelligenceConfig: AgentIntelligenceConfigSchema.optional(),
  configuration: AgentConfigSchema.optional(),
  securityContext: AgentSecurityContextSchema.optional(),
  isActive: z.boolean().optional(),
  status: z.enum(['idle', 'active', 'busy', 'error', 'offline']).optional(),
  lastActiveAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
  skills: z.array(AgentSkillSchema).optional(),
  ...AgentModelFieldsSchema.shape,

  assignedMCPTools: z.array(MCPToolItemSchema).optional(),

  mcpToolSettings: MCPToolSettingsSchema.optional(),
});

export type AgentUpdate = z.infer<typeof AgentUpdateSchema>;

// Agent Update Request Schema - for API requests (user-friendly format)
export const AgentUpdateRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().min(1).optional(),
  capabilities: z.array(z.string()).optional(),
  skills: z.array(AgentSkillSchema).optional(),
  role: z.nativeEnum(AgentRole).optional(),
  personaId: IDSchema.optional(),
  persona: AgentPersonaSchema.optional(),
  configuration: AgentConfigSchema.optional(),
  ...AgentModelFieldsSchema.pick({ modelId: true, apiType: true, userLLMProviderId: true }).shape,
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  isActive: z.boolean().optional(),

  assignedMCPTools: z
    .array(MCPToolItemSchema.extend({ enabled: z.boolean().default(true) }))
    .optional(),

  mcpToolSettings: MCPToolSettingsSchema.optional(),
});

export type AgentUpdateRequest = z.infer<typeof AgentUpdateRequestSchema>;

// Agent Create Request Schema - for API requests (user-friendly format)
export const CreateAgentRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1).optional(),
  capabilities: z.array(z.string()).default([]),
  skills: z.array(AgentSkillSchema).default([]),
  role: z.nativeEnum(AgentRole),
  personaId: IDSchema.optional(),
  persona: AgentPersonaSchema.optional(),
  configuration: AgentConfigSchema.optional(),
  metadata: z.record(z.any()).optional(),
  ...AgentModelFieldsSchema.omit({ userLLMProviderId: true }).shape,
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  isActive: z.boolean().default(true),

  assignedMCPTools: z
    .array(MCPToolItemSchema.extend({ enabled: z.boolean().default(true) }))
    .optional(),

  mcpToolSettings: MCPToolSettingsSchema.optional(),
});

export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;

// Conversation types
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export const MessageSchema = z.object({
  id: IDSchema,
  role: z.nativeEnum(MessageRole),
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  timestamp: z.date(),
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
  networkQuality: z.string().optional(),
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
  securityLevel: z.number().min(1).max(5),
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
    sentiment: z.string(),
  }),
  contextualFactors: z.record(z.any()).optional(),
  environmentFactors: EnvironmentFactorsSchema,
  confidence: z.number().min(0).max(1),
  recommendations: z.array(z.string()).default([]),
  relevantKnowledge: z.array(z.any()).default([]),
  constraints: z.record(z.any()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  metadata: z.record(z.any()).optional(),
});

export type ContextAnalysis = z.infer<typeof ContextAnalysisSchema>;

export const ActionRecommendationSchema = z.object({
  type: z.enum(['tool_execution', 'artifact_generation', 'hybrid_workflow', 'clarification']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  estimatedDuration: z.number().optional(),
  requiredCapabilities: z.array(z.string()),
  riskLevel: z.enum(['low', 'medium', 'high']).default('low'),
});

export type ActionRecommendation = z.infer<typeof ActionRecommendationSchema>;

export const AgentAnalysisResultSchema = z.object({
  analysis: z.object({
    intent: z.string(),
    entities: z.array(z.record(z.any())),
    sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
    complexity: z.enum(['simple', 'moderate', 'complex']),
    urgency: z.enum(['low', 'medium', 'high']),
  }),
  recommendedActions: z.array(ActionRecommendationSchema),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  suggestedCapabilities: z.array(z.string()).optional(),
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
      urgency: z.string(),
    }),
    intent: z.object({
      primary: z.string(),
      secondary: z.array(z.string()),
      confidence: z.number(),
      entities: z.array(z.any()),
      complexity: z.string(),
    }),
    agentCapabilities: z.object({
      tools: z.array(z.string()),
      artifacts: z.array(z.string()),
      specializations: z.array(z.string()),
      limitations: z.array(z.string()),
    }),
    environmentFactors: z.object({
      timeOfDay: z.number(),
      userLoad: z.number(),
      systemLoad: z.string(),
      availableResources: z.string(),
    }),
  }),
  recommendedActions: z.array(
    z.object({
      type: z.string(),
      confidence: z.number(),
      description: z.string(),
      estimatedDuration: z.number(),
    })
  ),
  confidence: z.number(),
  explanation: z.string(),
  timestamp: z.date(),
});

export type AgentAnalysis = z.infer<typeof AgentAnalysisSchema>;

// ExecutionPlan type for intelligence service
export const ExecutionPlanSchema = z.object({
  id: IDSchema,
  type: z.string(),
  agentId: IDSchema,
  steps: z.array(
    z.object({
      id: IDSchema,
      type: z.string(),
      description: z.string(),
      estimatedDuration: z.number(),
      required: z.boolean(),
    })
  ),
  dependencies: z.array(z.string()),
  estimatedDuration: z.number(),
  priority: z.string(),
  constraints: z.array(z.string()),
  metadata: z.object({
    generatedBy: z.string(),
    basedOnAnalysis: z.date(),
    userPreferences: z.any().optional(),
    version: z.string(),
  }),
  created_at: z.date(),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// LearningResult type for intelligence service
export const LearningResultSchema = z.object({
  learningApplied: z.boolean(),
  confidenceAdjustments: z.object({
    overallAdjustment: z.number(),
    specificAdjustments: z.record(z.any()),
  }),
  newKnowledge: z.array(z.string()),
  improvedCapabilities: z.array(z.string()),
});

export type LearningResult = z.infer<typeof LearningResultSchema>;

// Agent State Machine Types
export enum AgentOperationalState {
  IDLE = 'idle',
  THINKING = 'thinking',
  EXECUTING = 'executing',
  WAITING = 'waiting',
  ERROR = 'error',
}

export const AgentStateTransitionSchema = z.object({
  from: z.nativeEnum(AgentOperationalState),
  to: z.nativeEnum(AgentOperationalState),
  trigger: z.string(),
  timestamp: z.date(),
  metadata: z.record(z.any()).optional(),
});

export type AgentStateTransition = z.infer<typeof AgentStateTransitionSchema>;

export const AgentExecutionContextSchema = z.object({
  operationalState: z.nativeEnum(AgentOperationalState),
  currentAction: z.string().optional(),
  capabilities: z.array(z.string()),
  lastTransition: AgentStateTransitionSchema.optional(),
  errorDetails: z.string().optional(),
  stateMetadata: z.record(z.any()).optional(),
});

export type AgentExecutionContext = z.infer<typeof AgentExecutionContextSchema>;

// Collaboration Types
export enum CollaborationPatternType {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  HIERARCHICAL = 'hierarchical',
  CONSENSUS = 'consensus',
}

export enum WorkflowStepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
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
  metadata: z.record(z.any()).optional(),
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
  metadata: z.record(z.any()).optional(),
});

export type CollaborationPattern = z.infer<typeof CollaborationPatternSchema>;

export const AgentMessageSchema = z.object({
  id: z.string(),
  fromAgentId: z.string(),
  toAgentId: z.string().optional(), // null for broadcast
  workflowId: z.string(),
  stepId: z.string().optional(),
  messageType: z.enum([
    'task_assignment',
    'step_completion',
    'data_transfer',
    'status_update',
    'error_report',
  ]),
  content: z.record(z.any()),
  timestamp: z.date(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

// ============================================================================
// Agent Decision Engine Types (moved from backend/shared/services)
// ============================================================================

export interface DecisionResult {
  selectedAction: ActionRecommendation | null;
  resolvedCapabilities: ToolDefinition[];
  confidence: number;
  reasoning: string;
  executionPlan?: {
    steps: Array<{ tool: ToolDefinition; parameters: Record<string, unknown> }>;
    estimatedDuration: number;
  };
}

export interface CapabilityResolver {
  lookup(toolName: string): Promise<ToolDefinition | null>;
  validateCapabilities(
    requiredCapabilities: string[]
  ): Promise<{ valid: boolean; missing: string[] }>;
  getAvailableCapabilities(): Promise<string[]>;
}

// ============================================================================
// Task DAG Types (moved from backend/shared/services)
// ============================================================================

export interface TaskNode {
  id: string;
  description: string;
  type: 'query' | 'command' | 'monitor' | 'orchestrate' | 'communicate';
  dependencies: string[];
  estimatedDurationMs?: number;
  toolId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface TaskDAG {
  id: string;
  goal: string;
  nodes: TaskNode[];
  edges: Array<{ from: string; to: string }>;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Meta Reasoning Types (moved from backend/shared/services)
// ============================================================================

export interface MetaReasoningInput {
  agentId: string;
  intent: string;
  proposedAction: string;
  confidence: number;
  context: Record<string, unknown>;
}

export interface MetaReasoningDecision {
  action: 'proceed' | 'clarify' | 'delegate' | 'abstain' | 'escalate';
  confidence: number;
  reasoning: string;
  suggestedClarification?: string;
  suggestedDelegate?: string;
  warnings: string[];
}

export interface CapabilityGapResult {
  hasGap: boolean;
  missingCapabilities: string[];
}

export interface ErrorHistoryResult {
  recentErrors: number;
  errorRate: number;
}

// ============================================================================
// Cognitive Types (moved from backend/shared/services)
// ============================================================================

export interface ExecutionGate {
  agentId: string;
  taskType: string;
  requiredConfidence: number;
  actualConfidence: number;
  passed: boolean;
  reason: string;
}

export interface ConfidenceProfile {
  agentId: string;
  taskType: string;
  historicalAccuracy: number;
  sampleSize: number;
  dynamicThreshold: number;
  lastUpdated: Date;
}

/**
 * Domain-scoped confidence profile — extends ConfidenceProfile with a domain
 * field so that each agent tracks a separate EMA per domain.
 */
export interface DomainConfidenceProfile extends ConfidenceProfile {
  domain: string;
  lastComposedAt?: Date;
}

export interface ReasoningNode {
  id: string;
  type: 'observation' | 'inference' | 'assumption' | 'conclusion' | 'evidence' | 'uncertainty';
  content: string;
  confidence: number;
  source?: string;
  timestamp: Date;
}

export interface ReasoningEdge {
  from: string;
  to: string;
  relationship: 'supports' | 'contradicts' | 'requires' | 'derives' | 'weakens';
  strength: number;
}

export interface ExplanationDAG {
  id: string;
  agentId: string;
  taskId: string;
  nodes: ReasoningNode[];
  edges: ReasoningEdge[];
  conclusion?: ReasoningNode;
  overallConfidence: number;
  uncertainties: ReasoningNode[];
  createdAt: Date;
}

export interface CapabilityAssessment {
  agentId: string;
  requiredCapabilities: string[];
  availableCapabilities: string[];
  gaps: CapabilityGap[];
  overallReadiness: number;
  recommendation: 'proceed' | 'augment' | 'delegate' | 'block';
}

export interface CapabilityGap {
  capability: string;
  severity: 'minor' | 'major' | 'critical';
  alternatives: string[];
  workaround?: string;
}

// Agent entity interface
export interface AgentEntity {
  id: string;
  name: string;
  role: string;
  persona?: Record<string, unknown>;
  intelligenceConfig?: Record<string, unknown>;
  securityContext?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdBy?: string;
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  apiType?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  skills?: Array<{ name: string; description?: string; enabled?: boolean }>;
  capabilities?: string[];
  status?: string;
}
