import { z } from 'zod';

/**
 * Canonical workflow contract, derived from the `workflow_definitions` table and
 * the behaviour of WorkflowExecutorService — NOT from the older frontend-only
 * shapes in frontend_api.ts, which model a workflow the backend never accepted
 * (`triggers[]`/`isActive`/generic `action`) and are therefore superseded.
 */

export const WorkflowTriggerKindSchema = z.enum(['cron', 'every', 'webhook', 'event']);
export type WorkflowTriggerKind = z.infer<typeof WorkflowTriggerKindSchema>;

export const WorkflowTriggerSchema = z.object({
  kind: WorkflowTriggerKindSchema,
  expr: z.string().min(1),
  tz: z.string().min(1).optional(),
});
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

/**
 * Each step variant carries the fields its executor branch actually reads, so an
 * unrunnable step (a bash step with no command) fails validation at the API edge
 * instead of at 3am inside a scheduled run.
 */
export const BashWorkflowStepSchema = z.object({
  type: z.literal('bash'),
  id: z.string().min(1).optional(),
  command: z.string().min(1),
});
export type BashWorkflowStep = z.infer<typeof BashWorkflowStepSchema>;

export const HttpCallWorkflowStepSchema = z.object({
  type: z.literal('httpCall'),
  id: z.string().min(1).optional(),
  url: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});
export type HttpCallWorkflowStep = z.infer<typeof HttpCallWorkflowStepSchema>;

export const AgentTurnWorkflowStepSchema = z.object({
  type: z.literal('agentTurn'),
  id: z.string().min(1).optional(),
  prompt: z.string().min(1),
  agentId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});
export type AgentTurnWorkflowStep = z.infer<typeof AgentTurnWorkflowStepSchema>;

export const WorkflowDefinitionStepSchema = z.discriminatedUnion('type', [
  BashWorkflowStepSchema,
  HttpCallWorkflowStepSchema,
  AgentTurnWorkflowStepSchema,
]);
export type WorkflowDefinitionStep = z.infer<typeof WorkflowDefinitionStepSchema>;

export const WorkflowDeliverySchema = z.object({
  type: z.enum(['webhook', 'email', 'slack', 'whatsapp']),
  target: z.string().min(1),
  retryPolicy: z.record(z.unknown()).optional(),
});
export type WorkflowDelivery = z.infer<typeof WorkflowDeliverySchema>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  trigger: WorkflowTriggerSchema,
  steps: z.array(WorkflowDefinitionStepSchema),
  delivery: WorkflowDeliverySchema.nullable(),
  enabled: z.boolean(),
  agentId: z.string().nullable(),
  sessionKey: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const CreateWorkflowRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  trigger: WorkflowTriggerSchema,
  steps: z.array(WorkflowDefinitionStepSchema).min(1),
  delivery: WorkflowDeliverySchema.nullable().optional(),
  enabled: z.boolean().optional(),
  agentId: z.string().min(1).optional(),
  sessionKey: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequestSchema>;

export const UpdateWorkflowRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().nullable(),
    trigger: WorkflowTriggerSchema,
    steps: z.array(WorkflowDefinitionStepSchema).min(1),
    delivery: WorkflowDeliverySchema.nullable(),
    enabled: z.boolean(),
    agentId: z.string().nullable(),
    sessionKey: z.string().nullable(),
    model: z.string().nullable(),
  })
  .partial();
export type UpdateWorkflowRequest = z.infer<typeof UpdateWorkflowRequestSchema>;

export const WorkflowStepOutcomeStatusSchema = z.enum(['completed', 'failed', 'skipped']);
export type WorkflowStepOutcomeStatus = z.infer<typeof WorkflowStepOutcomeStatusSchema>;

export const WorkflowStepOutcomeSchema = z.object({
  stepId: z.string(),
  type: z.string(),
  status: WorkflowStepOutcomeStatusSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
});
export type WorkflowStepOutcome = z.infer<typeof WorkflowStepOutcomeSchema>;

/**
 * A run is not its own table — it is an `operations` row of type `hybrid_workflow`
 * whose `context.workflowDefinitionId` names the definition. This is the projection
 * of that row onto the workflow API.
 */
export const WorkflowExecutionSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  status: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  currentStep: z.number().optional(),
  totalSteps: z.number().optional(),
  durationMs: z.number().optional(),
  steps: z.array(WorkflowStepOutcomeSchema),
  input: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

export const ExecuteWorkflowRequestSchema = z.object({
  input: z.record(z.unknown()).optional(),
});
export type ExecuteWorkflowRequest = z.infer<typeof ExecuteWorkflowRequestSchema>;
