import { Elysia, t } from 'elysia';
import { withRequiredAuth, withOperatorGuard } from '@uaip/middleware';
import { getControlDb } from '@uaip/shared-services';
import { eq, and, desc, sql } from '@uaip/shared-services/drizzle/clients';
import {
  operations,
  workflowDefinitions,
  type NewWorkflowDefinition,
  type WorkflowDefinition,
} from '@uaip/shared-services/drizzle/control';
import type {
  DeliveryType,
  TriggerKind,
  WorkflowStepType as StepType,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { WorkflowEngineService } from '../services/workflow_engine_service.js';
import { WorkflowExecutorService } from '../services/workflow_executor_service.js';

type WorkflowTrigger = WorkflowDefinition['trigger'];
type WorkflowSteps = WorkflowDefinition['steps'];
type WorkflowDelivery = WorkflowDefinition['delivery'];

const WorkflowSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Optional(t.Union([t.String(), t.Null()])),
  trigger: t.Any(),
  steps: t.Any(),
  delivery: t.Optional(t.Any()),
  enabled: t.Optional(t.Boolean()),
  agentId: t.Optional(t.Union([t.String(), t.Null()])),
  sessionKey: t.Optional(t.Union([t.String(), t.Null()])),
  model: t.Optional(t.Union([t.String(), t.Null()])),
  createdAt: t.Optional(t.Any()),
  updatedAt: t.Optional(t.Any()),
})
const WorkflowErrorSchema = t.Object({ success: t.Literal(false), error: t.String() })

// requireOperator denies with { error, code } — NOT the { success:false, error }
// envelope the handlers use. Declaring WorkflowErrorSchema for 403 makes Elysia
// reject the guard's own response and return 422 instead of 403.
const GuardErrorSchema = t.Object({ error: t.String(), code: t.String() })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTriggerKind = (value: unknown): value is TriggerKind =>
  value === 'cron' || value === 'every' || value === 'webhook' || value === 'event';

const isStepType = (value: unknown): value is StepType =>
  value === 'agentTurn' || value === 'bash' || value === 'httpCall';

const isDeliveryType = (value: unknown): value is DeliveryType =>
  value === 'webhook' || value === 'email' || value === 'slack' || value === 'whatsapp';

function parseTrigger(value: unknown): WorkflowTrigger | null {
  if (!isRecord(value) || !isTriggerKind(value.kind) || typeof value.expr !== 'string') {
    return null;
  }

  return {
    kind: value.kind,
    expr: value.expr,
    ...(typeof value.tz === 'string' ? { tz: value.tz } : {}),
  };
}

function parseSteps(value: unknown): WorkflowSteps | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: WorkflowSteps = [];
  for (const step of value) {
    if (!isRecord(step) || !isStepType(step.type)) {
      return null;
    }
    const typedStep: WorkflowSteps[number] = {
      ...step,
      type: step.type,
    };
    parsed.push(typedStep);
  }

  return parsed;
}

function parseDelivery(value: unknown): WorkflowDelivery | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!isRecord(value) || !isDeliveryType(value.type) || typeof value.target !== 'string') {
    return undefined;
  }

  return {
    type: value.type,
    target: value.target,
    ...(isRecord(value.retryPolicy) ? { retryPolicy: value.retryPolicy } : {}),
  };
}

function parseCreatePayload(body: unknown): NewWorkflowDefinition | null {
  if (!isRecord(body) || typeof body.name !== 'string') {
    return null;
  }

  const trigger = parseTrigger(body.trigger);
  const steps = parseSteps(body.steps);
  const delivery = parseDelivery(body.delivery);

  if (!trigger || !steps) {
    return null;
  }

  return {
    name: body.name,
    ...(typeof body.description === 'string' ? { description: body.description } : {}),
    trigger,
    steps,
    ...(delivery !== undefined ? { delivery } : {}),
    ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
    ...(typeof body.agentId === 'string' ? { agentId: body.agentId } : {}),
    ...(typeof body.sessionKey === 'string' ? { sessionKey: body.sessionKey } : {}),
    ...(typeof body.model === 'string' ? { model: body.model } : {}),
  };
}

function parseUpdatePayload(body: unknown): Partial<NewWorkflowDefinition> | null {
  if (!isRecord(body)) {
    return null;
  }

  const patch: Partial<NewWorkflowDefinition> = {};

  if ('name' in body) {
    if (typeof body.name !== 'string') return null;
    patch.name = body.name;
  }

  if ('description' in body) {
    if (typeof body.description !== 'string' && body.description !== null) return null;
    patch.description = typeof body.description === 'string' ? body.description : null;
  }

  if ('trigger' in body) {
    const trigger = parseTrigger(body.trigger);
    if (!trigger) return null;
    patch.trigger = trigger;
  }

  if ('steps' in body) {
    const steps = parseSteps(body.steps);
    if (!steps) return null;
    patch.steps = steps;
  }

  if ('delivery' in body) {
    const delivery = parseDelivery(body.delivery);
    if (delivery === undefined) return null;
    patch.delivery = delivery;
  }

  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') return null;
    patch.enabled = body.enabled;
  }

  if ('agentId' in body) {
    if (typeof body.agentId !== 'string' && body.agentId !== null) return null;
    patch.agentId = typeof body.agentId === 'string' ? body.agentId : null;
  }

  if ('sessionKey' in body) {
    if (typeof body.sessionKey !== 'string' && body.sessionKey !== null) return null;
    patch.sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey : null;
  }

  if ('model' in body) {
    if (typeof body.model !== 'string' && body.model !== null) return null;
    patch.model = typeof body.model === 'string' ? body.model : null;
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }

  return patch;
}

function parsePage(queryValue: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(queryValue ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const WorkflowExecutionSchema = t.Object({
  id: t.String(),
  workflowId: t.String(),
  status: t.String(),
  startedAt: t.Optional(t.Any()),
  completedAt: t.Optional(t.Any()),
  currentStep: t.Optional(t.Number()),
  totalSteps: t.Optional(t.Number()),
  durationMs: t.Optional(t.Number()),
  steps: t.Array(t.Any()),
  error: t.Optional(t.Union([t.String(), t.Null()])),
});

interface OperationRunRow {
  id: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  currentStep: number | null;
  totalSteps: number | null;
  actualDuration: number | null;
  error: string | null;
  stepDetails: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
}

function extractOutcomes(row: OperationRunRow): unknown[] {
  const fromResult = isRecord(row.result) ? row.result.outcomes : undefined;
  if (Array.isArray(fromResult)) return fromResult;
  const fromStepDetails = isRecord(row.stepDetails) ? row.stepDetails.outcomes : undefined;
  return Array.isArray(fromStepDetails) ? fromStepDetails : [];
}

function toWorkflowExecution(row: OperationRunRow, workflowDefinitionId: string) {
  return {
    id: row.id,
    workflowId: workflowDefinitionId,
    status: row.status,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    currentStep: row.currentStep ?? undefined,
    totalSteps: row.totalSteps ?? undefined,
    durationMs: row.actualDuration ?? undefined,
    steps: extractOutcomes(row),
    error: row.error,
  };
}

/**
 * A workflow run has no table of its own — it is an `operations` row whose
 * context.workflowDefinitionId names the definition (see WorkflowExecutorService).
 * Filtering on that key is also the authorization boundary: without it, any run id
 * would be readable through any workflow.
 */
const runsOfWorkflow = (workflowDefinitionId: string) =>
  sql`${operations.context}->>'workflowDefinitionId' = ${workflowDefinitionId}`;

export function registerWorkflowRoutes(
  workflowEngine: WorkflowEngineService,
  workflowExecutor: WorkflowExecutorService
) {
  return new Elysia()
    .group('/api/v1/workflows', (group) => withRequiredAuth(group)
    .get('/', async (ctx) => {
      try {
        const page = parsePage(ctx.query?.page, 1);
        const limit = Math.min(100, parsePage(ctx.query?.limit, 20));
        const offset = (page - 1) * limit;
  
        const db = getControlDb();
        const [items, totalRows] = await Promise.all([
          db
            .select()
            .from(workflowDefinitions)
            .orderBy(desc(workflowDefinitions.createdAt))
            .limit(limit)
            .offset(offset),
          db.select({ value: sql<number>`count(*)` }).from(workflowDefinitions),
        ]);
  
        const total = Number(totalRows[0]?.value ?? 0);
  
        return {
          success: true,
          data: items,
          pagination: {
            page,
            limit,
            total,
            hasMore: offset + limit < total,
          },
        };
      } catch (error) {
        logger.error('Failed to list workflows', { error });
        ctx.set.status = 500;
        return { success: false, error: 'Failed to list workflows' };
      }
    }, {
      query: t.Object({ page: t.Optional(t.String()), limit: t.Optional(t.String()) }),
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Array(WorkflowSchema),
          pagination: t.Object({ page: t.Number(), limit: t.Number(), total: t.Number(), hasMore: t.Boolean() }),
        }),
        500: WorkflowErrorSchema,
      },
    })
  
    .get('/:id', async (ctx) => {
      try {
        const db = getControlDb();
        const [definition] = await db
          .select()
          .from(workflowDefinitions)
          .where(eq(workflowDefinitions.id, ctx.params.id))
          .limit(1);
  
        if (!definition) {
          ctx.set.status = 404;
          return { success: false, error: 'Workflow not found' };
        }
  
        return { success: true, data: definition };
      } catch (error) {
        logger.error('Failed to get workflow', { error, workflowDefinitionId: ctx.params.id });
        ctx.set.status = 500;
        return { success: false, error: 'Failed to get workflow' };
      }
    }, {
      response: {
        200: t.Object({ success: t.Literal(true), data: WorkflowSchema }),
        404: WorkflowErrorSchema,
        500: WorkflowErrorSchema,
      },
    })
  
    .get('/:id/executions', async (ctx) => {
      try {
        const page = parsePage(ctx.query?.page, 1);
        const limit = Math.min(100, parsePage(ctx.query?.limit, 20));
        const offset = (page - 1) * limit;

        const db = getControlDb();
        const rows = await db
          .select()
          .from(operations)
          .where(runsOfWorkflow(ctx.params.id))
          .orderBy(desc(operations.startedAt))
          .limit(limit)
          .offset(offset);

        return {
          success: true,
          data: (rows as unknown as OperationRunRow[]).map((row) =>
            toWorkflowExecution(row, ctx.params.id)
          ),
        };
      } catch (error) {
        logger.error('Failed to list workflow executions', {
          error,
          workflowDefinitionId: ctx.params.id,
        });
        ctx.set.status = 500;
        return { success: false, error: 'Failed to list workflow executions' };
      }
    }, {
      query: t.Object({ page: t.Optional(t.String()), limit: t.Optional(t.String()) }),
      response: {
        200: t.Object({ success: t.Literal(true), data: t.Array(WorkflowExecutionSchema) }),
        500: WorkflowErrorSchema,
      },
    })

    .get('/:id/executions/:executionId', async (ctx) => {
      try {
        const db = getControlDb();
        const [row] = await db
          .select()
          .from(operations)
          .where(and(eq(operations.id, ctx.params.executionId), runsOfWorkflow(ctx.params.id)))
          .limit(1);

        if (!row) {
          ctx.set.status = 404;
          return { success: false, error: 'Workflow execution not found' };
        }

        return {
          success: true,
          data: toWorkflowExecution(row as unknown as OperationRunRow, ctx.params.id),
        };
      } catch (error) {
        logger.error('Failed to get workflow execution', {
          error,
          workflowDefinitionId: ctx.params.id,
          executionId: ctx.params.executionId,
        });
        ctx.set.status = 500;
        return { success: false, error: 'Failed to get workflow execution' };
      }
    }, {
      response: {
        200: t.Object({ success: t.Literal(true), data: WorkflowExecutionSchema }),
        404: WorkflowErrorSchema,
        500: WorkflowErrorSchema,
      },
    })
  )

    // SECURITY BOUNDARY: workflow_definitions has NO owner/organization column, and
    // bash/httpCall steps execute as SYSTEM_USER_ID (workflow_executor_service).
    // Any authenticated caller who can write a definition therefore gets shell
    // execution and SSRF under system identity. Until ownership exists in the
    // schema, mutation and execution are operator-only. Reads stay open above.
    .group('/api/v1/workflows', (group) => withOperatorGuard(group)
    .post('/', async (ctx) => {
      try {
        const payload = parseCreatePayload(ctx.body);
        if (!payload) {
          ctx.set.status = 400;
          return { success: false, error: 'Invalid workflow payload' };
        }

        const db = getControlDb();
        const [created] = await db.insert(workflowDefinitions).values(payload).returning();

        if (created.enabled) {
          await workflowEngine.registerOrUpdate(created);
        }

        ctx.set.status = 201;
        return { success: true, data: created };
      } catch (error) {
        logger.error('Failed to create workflow', { error });
        ctx.set.status = 500;
        return { success: false, error: 'Failed to create workflow' };
      }
    }, {
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        trigger: t.Any(),
        steps: t.Any(),
        delivery: t.Optional(t.Any()),
        enabled: t.Optional(t.Boolean()),
        agentId: t.Optional(t.String()),
        sessionKey: t.Optional(t.String()),
        model: t.Optional(t.String()),
      }),
      response: {
        201: t.Object({ success: t.Literal(true), data: WorkflowSchema }),
        400: WorkflowErrorSchema,
        403: GuardErrorSchema,
        500: WorkflowErrorSchema,
      },
    })

    .put('/:id', async (ctx) => {
      try {
        const patch = parseUpdatePayload(ctx.body);
        if (!patch) {
          ctx.set.status = 400;
          return { success: false, error: 'Invalid workflow payload' };
        }

        const db = getControlDb();
        const [updated] = await db
          .update(workflowDefinitions)
          .set({
            ...patch,
            updatedAt: new Date(),
          })
          .where(eq(workflowDefinitions.id, ctx.params.id))
          .returning();

        if (!updated) {
          ctx.set.status = 404;
          return { success: false, error: 'Workflow not found' };
        }

        if (updated.enabled) {
          await workflowEngine.registerOrUpdate(updated);
        } else {
          await workflowEngine.unregister(updated.id);
        }

        return { success: true, data: updated };
      } catch (error) {
        logger.error('Failed to update workflow', { error, workflowDefinitionId: ctx.params.id });
        ctx.set.status = 500;
        return { success: false, error: 'Failed to update workflow' };
      }
    }, {
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        trigger: t.Optional(t.Any()),
        steps: t.Optional(t.Any()),
        delivery: t.Optional(t.Any()),
        enabled: t.Optional(t.Boolean()),
        agentId: t.Optional(t.Union([t.String(), t.Null()])),
        sessionKey: t.Optional(t.Union([t.String(), t.Null()])),
        model: t.Optional(t.Union([t.String(), t.Null()])),
      }),
      response: {
        200: t.Object({ success: t.Literal(true), data: WorkflowSchema }),
        400: WorkflowErrorSchema,
        403: GuardErrorSchema,
        404: WorkflowErrorSchema,
        500: WorkflowErrorSchema,
      },
    })

    .delete('/:id', async (ctx) => {
      try {
        const db = getControlDb();
        const [removed] = await db
          .delete(workflowDefinitions)
          .where(eq(workflowDefinitions.id, ctx.params.id))
          .returning();

        if (!removed) {
          ctx.set.status = 404;
          return { success: false, error: 'Workflow not found' };
        }

        await workflowEngine.unregister(ctx.params.id);
        return { success: true, data: removed };
      } catch (error) {
        logger.error('Failed to delete workflow', { error, workflowDefinitionId: ctx.params.id });
        ctx.set.status = 500;
        return { success: false, error: 'Failed to delete workflow' };
      }
    }, {
      response: {
        200: t.Object({ success: t.Literal(true), data: WorkflowSchema }),
        403: GuardErrorSchema,
        404: WorkflowErrorSchema,
        500: WorkflowErrorSchema,
      },
    })

    .post('/:id/execute', async (ctx) => {
      try {
        const run = await workflowExecutor.runDefinition(ctx.params.id);

        if (!run) {
          ctx.set.status = 404;
          return { success: false, error: 'Workflow not found' };
        }

        return {
          success: true,
          data: {
            id: run.operationId,
            workflowId: run.workflowDefinitionId,
            status: run.status,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            durationMs: run.durationMs,
            steps: run.outcomes,
            error: null,
          },
        };
      } catch (error) {
        logger.error('Failed to execute workflow', { error, workflowDefinitionId: ctx.params.id });
        ctx.set.status = 500;
        return { success: false, error: 'Failed to execute workflow' };
      }
    }, {
      body: t.Optional(t.Object({ input: t.Optional(t.Any()) })),
      response: {
        200: t.Object({ success: t.Literal(true), data: WorkflowExecutionSchema }),
        403: GuardErrorSchema,
        404: WorkflowErrorSchema,
        500: WorkflowErrorSchema,
      },
    })
  )
}
