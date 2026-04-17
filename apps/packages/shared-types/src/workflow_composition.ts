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

// ─── UI PROJECTION v1 (legacy) ──────────────────────────────────────────────

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

// ─── UI PROJECTION v2 ───────────────────────────────────────────────────────
// Spec-driven UI with live state bindings, structured predicates, and layout hints.

// BindingValue: either a $state.X path reference or a literal value
export const BindingValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path: z.string() }),   // { kind: 'path', path: '$state.customer.name' }
  z.object({ kind: z.literal('literal'), value: z.unknown() }), // { kind: 'literal', value: 'Hello' }
]);

export type BindingValue = z.infer<typeof BindingValueSchema>;

export type Predicate =
  | { op: 'exists'; path: string }
  | { op: 'not-exists'; path: string }
  | { op: '==='; path: string; value: string | number | boolean }
  | { op: '!=='; path: string; value: string | number | boolean }
  | { op: '>'; path: string; value: number }
  | { op: '<'; path: string; value: number }
  | { op: '>='; path: string; value: number }
  | { op: '<='; path: string; value: number }
  | { op: 'in'; path: string; value: string[] }
  | { op: 'not-in'; path: string; value: string[] }
  | { op: 'and'; children: Predicate[] }
  | { op: 'or'; children: Predicate[] }
  | { op: 'not'; child: Predicate };

const _PredicateBase = z.discriminatedUnion('op', [
  z.object({ op: z.literal('exists'), path: z.string() }),
  z.object({ op: z.literal('not-exists'), path: z.string() }),
  z.object({ op: z.literal('==='), path: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ op: z.literal('!=='), path: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ op: z.literal('>'), path: z.string(), value: z.number() }),
  z.object({ op: z.literal('<'), path: z.string(), value: z.number() }),
  z.object({ op: z.literal('>='), path: z.string(), value: z.number() }),
  z.object({ op: z.literal('<='), path: z.string(), value: z.number() }),
  z.object({ op: z.literal('in'), path: z.string(), value: z.array(z.string()) }),
  z.object({ op: z.literal('not-in'), path: z.string(), value: z.array(z.string()) }),
  z.object({ op: z.literal('and'), children: z.array(z.unknown()) }),
  z.object({ op: z.literal('or'), children: z.array(z.unknown()) }),
  z.object({ op: z.literal('not'), child: z.unknown() }),
]);

export const PredicateSchema = z.lazy(() => _PredicateBase);

// LoadingPolicy — what to show while a bound value is loading
export const LoadingPolicySchema = z.enum([
  'skeleton',     // show skeleton placeholder
  'spinner',      // show spinner
  'blur',         // show blurred previous value
  'hide',         // hide the node entirely
]);

export type LoadingPolicy = z.infer<typeof LoadingPolicySchema>;

// LayoutHint — optional rendering guidance for the host surface
export const LayoutHintSchema = z.object({
  span: z.enum(['full', 'half', 'quarter']).optional(),
  order: z.number().int().optional(),
  pinned: z.boolean().optional(),
});

export type LayoutHint = z.infer<typeof LayoutHintSchema>;

export type UINode = {
  kind: string;
  variant: string;
  bindings?: Record<string, BindingValue>;
  slots?: UINode[];
  layoutHint?: LayoutHint;
  constraints?: string[];
  visibility?: Predicate;
  enabled?: Predicate;
  loadingPolicy?: LoadingPolicy;
  fallback?: UINode;
};

const _UINodeBase = z.object({
  kind: z.string(),
  variant: z.string(),
  bindings: z.record(BindingValueSchema).optional(),
  slots: z.array(z.unknown()).optional(),
  layoutHint: LayoutHintSchema.optional(),
  constraints: z.array(z.string()).optional(),
  visibility: PredicateSchema.optional(),
  enabled: PredicateSchema.optional(),
  loadingPolicy: LoadingPolicySchema.optional(),
  fallback: z.unknown().optional(),
});

export const UINodeSchema = z.lazy(() => _UINodeBase);

// ─── WorkflowUIProjection (versioned) ───────────────────────────────────────
// version:1 → v1 flat schema (legacy)
// version:2 → v2 UINode tree schema (spec-driven)

export const WorkflowUIProjectionV1Schema = z.object({
  version: z.literal(1).default(1),

  // Telescope integration
  intentTriggers: z.array(z.string()),
  constellation: z.object({
    icon: z.string(),
    color: z.string(),
    category: z.string(),
  }),

  // Block generation (v1 flat)
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

export type WorkflowUIProjectionV1 = z.infer<typeof WorkflowUIProjectionV1Schema>;

export const WorkflowUIProjectionV2Schema = z.object({
  version: z.literal(2),

  // Telescope integration
  intentTriggers: z.array(z.string()),
  constellation: z.object({
    icon: z.string(),
    color: z.string(),
    category: z.string(),
  }),

  // v2 UINode tree — replaces flat blocks array
  rootNode: UINodeSchema,

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

export type WorkflowUIProjectionV2 = z.infer<typeof WorkflowUIProjectionV2Schema>;

export const WorkflowUIProjectionSchema = z.union([
  WorkflowUIProjectionV2Schema,
  WorkflowUIProjectionV1Schema,
]);

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
  z.object({ type: z.literal('deny_combination'), tools: z.array(z.string()), reason: z.string() }),
  z.object({
    type: z.literal('require_approval_for_domain'),
    domain: z.string(),
    approvers: z.array(z.string()),
  }),
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
