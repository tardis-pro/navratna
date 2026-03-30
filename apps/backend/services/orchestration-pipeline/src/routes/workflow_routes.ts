import { Elysia } from 'elysia';
import { withNginxAuth } from '@uaip/middleware';
import { getControlDb } from '@uaip/shared-services';
import { eq, desc, sql } from '@uaip/shared-services/drizzle/clients';
import {
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

type WorkflowTrigger = WorkflowDefinition['trigger'];
type WorkflowSteps = WorkflowDefinition['steps'];
type WorkflowDelivery = WorkflowDefinition['delivery'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTriggerKind = (value: unknown): value is TriggerKind =>
  value === 'cron' || value === 'every' || value === 'webhook' || value === 'event';

const isStepType = (value: unknown): value is StepType =>
  value === 'agentTurn' || value === 'bash' || value === 'httpCall';

const isDeliveryType = (value: unknown): value is DeliveryType =>
  value === 'webhook' || value === 'email' || value === 'slack';

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

export function registerWorkflowRoutes<T extends Elysia>(app: T, workflowEngine: WorkflowEngineService): T {
  app.group('/api/v1/workflows', (group: any) =>
    withNginxAuth(group)
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
      })

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
      })
  );

  return app;
}
