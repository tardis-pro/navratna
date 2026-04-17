import { z } from 'zod';

// ============================================================================
// Workflow Composition Types — Layer 2 of the Self-Composing Platform
//
// These types define how agents compose "applications" from MCP tools.
// A WorkflowDefinition is the schema for a reusable composition.
// The UI is derived from the workflow structure, not designed separately.
// ============================================================================

// ─── JSON Schema Reference ──────────────────────────────────────────────────
// Used for inputSchema / outputSchema / stateSchema on WorkflowDefinition.
// Lightweight subset — full JSON Schema validation happens at runtime.

export const CompositionJSONSchemaSchema = z.object({
  type: z.string().optional(),
  properties: z.record(z.any()).optional(),
  required: z.array(z.string()).optional(),
  items: z.any().optional(),
  description: z.string().optional(),
  $ref: z.string().optional(),
}).passthrough();

export type CompositionJSONSchema = z.infer<typeof CompositionJSONSchemaSchema>;

// ─── TRIGGERS ───────────────────────────────────────────────────────────────

export const CompositionTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('intent'), patterns: z.array(z.string()) }),
  z.object({ type: z.literal('event'), topic: z.string(), filter: z.string().optional() }),
  z.object({ type: z.literal('schedule'), cron: z.string(), timezone: z.string().optional() }),
  z.object({ type: z.literal('webhook'), path: z.string(), method: z.string() }),
  z.object({ type: z.literal('manual') }),
  z.object({
    type: z.literal('workflow-chain'),
    workflowId: z.string(),
    on: z.enum(['completed', 'failed']),
  }),
]);

export type CompositionTrigger = z.infer<typeof CompositionTriggerSchema>;

// ─── MCP CONNECTIONS ────────────────────────────────────────────────────────

export const WorkflowMCPConnectionAuthSchema = z.object({
  type: z.enum(['tardis-jwt', 'bearer', 'api-key', 'oauth']),
  config: z.record(z.string()).optional(),
});

export const WorkflowMCPConnectionSchema = z.object({
  id: z.string(),
  source: z.enum(['federation', 'local', 'url']),
  subdomainId: z.string().optional(),
  serverName: z.string().optional(),
  url: z.string().optional(),
  requiredTools: z.array(z.string()),
  auth: WorkflowMCPConnectionAuthSchema.optional(),
});

export type WorkflowMCPConnection = z.infer<typeof WorkflowMCPConnectionSchema>;

// ─── INPUT BINDING ──────────────────────────────────────────────────────────
// SECURITY: 'env' ref type is explicitly excluded — workflows must never access environment variables

export const InputBindingSchema = z.discriminatedUnion('ref', [
  z.object({ ref: z.literal('trigger'), path: z.string() }),
  z.object({ ref: z.literal('step'), stepId: z.string(), path: z.string() }),
  z.object({ ref: z.literal('state'), path: z.string() }),
  z.object({ ref: z.literal('literal'), value: z.unknown() }),
  z.object({ ref: z.literal('agent'), prompt: z.string() }),
]);

export type InputBinding = z.infer<typeof InputBindingSchema>;

// ─── WORKFLOW STEP ──────────────────────────────────────────────────────────

export const CompositionRetryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  backoff: z.enum(['fixed', 'exponential']),
  delayMs: z.number().int().positive(),
});

export type CompositionRetryPolicy = z.infer<typeof CompositionRetryPolicySchema>;

export const WaitForSchema = z.object({
  event: z.string(),
  timeout: z.number().int().positive(),
});

export const CompositionWorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),

  // Execution type
  type: z.enum([
    'tool',
    'agent-reason',
    'approval',
    'conditional',
    'parallel',
    'transform',
    'wait',
  ]),

  // For type: 'tool'
  tool: z.string().optional(),
  mcpConnectionId: z.string().optional(),

  // For type: 'agent-reason'
  reasoningPrompt: z.string().optional(),
  outputMapping: z.record(z.string()).optional(),

  // For type: 'conditional'
  condition: z.string().optional(),
  trueBranch: z.array(z.string()).optional(),
  falseBranch: z.array(z.string()).optional(),

  // For type: 'parallel'
  parallelSteps: z.array(z.string()).optional(),
  policy: z.enum(['all_success', 'any_success', 'majority']).optional(),

  // For type: 'transform'
  transform: z.string().optional(),

  // For type: 'wait'
  waitFor: WaitForSchema.optional(),

  // Data flow
  input: z.record(InputBindingSchema),
  output: z.string().optional(),

  // Dependencies
  dependsOn: z.array(z.string()),

  // Failure handling
  onFailure: z.enum(['retry', 'skip', 'abort', 'compensate', 'escalate']),
  retryPolicy: CompositionRetryPolicySchema.optional(),
  compensationStep: z.string().optional(),

  // Approval override
  requiresApproval: z.boolean().optional(),
  approvalMessage: z.string().optional(),
});

export type CompositionWorkflowStep = z.infer<typeof CompositionWorkflowStepSchema>;

// ─── APPROVAL POLICY ────────────────────────────────────────────────────────

export const ApprovalPolicySchema = z.object({
  default: z.enum(['auto', 'require', 'confidence-gated']),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  highStakesOverride: z.boolean().optional(),
  stepOverrides: z.record(z.enum(['auto', 'require'])).optional(),
  escalateTo: z.string().optional(),
  timeoutAction: z.enum(['auto-approve', 'auto-reject', 'escalate']).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

// ─── UI PROJECTION ──────────────────────────────────────────────────────────

export const BlockDisplayTypeSchema = z.enum([
  'card',
  'status-badge',
  'form',
  'chart',
  'table',
  'timeline',
  'approval-prompt',
  'custom-url',
]);

export type BlockDisplayType = z.infer<typeof BlockDisplayTypeSchema>;

export const FieldProjectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'currency', 'date', 'status', 'link', 'badge', 'progress']),
  format: z.string().optional(),
});

export type FieldProjection = z.infer<typeof FieldProjectionSchema>;

export const ActionProjectionSchema = z.object({
  label: z.string(),
  type: z.enum(['approve', 'reject', 'retry', 'skip', 'custom']),
  stepId: z.string().optional(),
  confirmation: z.string().optional(),
});

export type ActionProjection = z.infer<typeof ActionProjectionSchema>;

export const WorkflowBlockProjectionSchema = z.object({
  stepId: z.string(),
  display: BlockDisplayTypeSchema,
  title: z.string().optional(),
  fields: z.array(FieldProjectionSchema).optional(),
  actions: z.array(ActionProjectionSchema).optional(),
});

export type WorkflowBlockProjection = z.infer<typeof WorkflowBlockProjectionSchema>;

// Microexpression reference — using string literal union to avoid circular import issues
// at Zod schema level. The TS type is constrained to Microexpression from microexpression.ts.
const MicroexpressionRef = z.enum([
  'calm',
  'attentive',
  'working',
  'alarmed',
  'confused',
  'satisfied',
  'strained',
]);

export const WorkflowUIProjectionSchema = z.object({
  // Telescope integration
  intentTriggers: z.array(z.string()),
  constellation: z.object({
    icon: z.string(),
    color: z.string(),
    category: z.string(),
  }),

  // Block generation
  blocks: z.array(WorkflowBlockProjectionSchema),

  // Microexpression mapping
  expressions: z.object({
    idle: MicroexpressionRef,
    running: MicroexpressionRef,
    waitingApproval: MicroexpressionRef,
    completed: MicroexpressionRef,
    failed: MicroexpressionRef,
  }),

  // Ambient signals
  ambient: z.object({
    showInMorningOpen: z.boolean(),
    attentionWeight: z.number().min(0).max(1),
    whisperTemplate: z.string().optional(),
  }),
});

export type WorkflowUIProjection = z.infer<typeof WorkflowUIProjectionSchema>;

// ─── STATE MACHINE EXTENSION ────────────────────────────────────────────────
// For long-running processes (e.g., invoice: draft → sent → paid → overdue)

export const WorkflowStateSchema = z.object({
  name: z.string(),
  onEnter: z.array(z.string()).optional(),
  onExit: z.array(z.string()).optional(),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const WorkflowTransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  trigger: CompositionTriggerSchema,
  guard: z.string().optional(),
  actions: z.array(z.string()).optional(),
});

export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;

export const WorkflowStateMachineSchema = z.object({
  states: z.record(WorkflowStateSchema),
  initialState: z.string(),
  transitions: z.array(WorkflowTransitionSchema),
});

export type WorkflowStateMachine = z.infer<typeof WorkflowStateMachineSchema>;

// ─── COMPOSITION POLICY ─────────────────────────────────────────────────────
// Safety policies for what agents can compose

export const PolicyRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('deny_tool'), tool: z.string(), reason: z.string() }),
  z.object({ type: z.literal('deny_combination'), tools: z.array(z.string()), reason: z.string() }),
  z.object({
    type: z.literal('blast_radius_limit'),
    maxRecords: z.number().int().positive().optional(),
    maxAmount: z.number().positive().optional(),
    maxEmails: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('rate_limit'),
    maxExecutionsPerHour: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('require_approval_for_domain'),
    domain: z.string(),
    approvers: z.array(z.string()),
  }),
  z.object({
    type: z.literal('confidence_threshold'),
    domain: z.string(),
    minConfidence: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal('secret_reference_required'),
    fieldPatterns: z.array(z.string()),
  }),
  z.object({ type: z.literal('require_dry_run') }),
  z.object({ type: z.literal('require_schema_validation') }),
  z.object({
    type: z.literal('regulatory_hold'),
    domain: z.string(),
    delayMs: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('maker_checker'),
    domain: z.string(),
    minApprovers: z.number().int().positive(),
  }),
]);

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const CompositionPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  rules: z.array(PolicyRuleSchema),
});

export type CompositionPolicy = z.infer<typeof CompositionPolicySchema>;

// ─── WORKFLOW DEFINITION ────────────────────────────────────────────────────
// The top-level schema for a reusable workflow composition

export const CompositionDefinitionSchema = z.object({
  // Identity
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  tags: z.array(z.string()),
  category: z.string(),
  isPublic: z.boolean(),

  // Agent
  agentPersona: z.string(),
  agentSystemPrompt: z.string().optional(),

  // Triggers
  triggers: z.array(CompositionTriggerSchema),

  // MCP connections
  mcpServers: z.array(WorkflowMCPConnectionSchema),

  // Execution graph
  steps: z.array(CompositionWorkflowStepSchema),

  // Approval gates
  approvalPolicy: ApprovalPolicySchema,

  // UI projection
  ui: WorkflowUIProjectionSchema,

  // Data schemas
  inputSchema: CompositionJSONSchemaSchema,
  outputSchema: CompositionJSONSchemaSchema,
  stateSchema: CompositionJSONSchemaSchema,

  // State machine (optional — for long-running processes)
  stateMachine: WorkflowStateMachineSchema.optional(),

  // Composition policy (optional — safety constraints)
  compositionPolicy: CompositionPolicySchema.optional(),

  // Lifecycle
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CompositionDefinition = z.infer<typeof CompositionDefinitionSchema>;
