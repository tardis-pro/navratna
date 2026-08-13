import { Elysia, t } from 'elysia';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withRequiredAuth } from '@uaip/middleware';
import { getControlDb } from '@uaip/shared-services';
import { eq, and, desc, asc, sql } from '@uaip/shared-services/drizzle/clients';
import {
  operations,
  operationStates,
  operationCheckpoints,
  stepResults,
} from '@uaip/shared-services/drizzle/control';
import { OperationStatus } from '@uaip/types';
import { logger } from '@uaip/utils';

import type { OrchestrationEngine } from '../orchestration_engine.js';

const DEFAULT_CANCEL_REASON = 'Cancelled by user';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ErrorSchema = t.Object({ success: t.Literal(false), error: t.String() });
const DataSchema = t.Object({ success: t.Literal(true), data: t.Any() });
const ListSchema = t.Object({
  success: t.Literal(true),
  data: t.Array(t.Any()),
  pagination: t.Optional(
    t.Object({ page: t.Number(), limit: t.Number(), total: t.Number(), hasMore: t.Boolean() })
  ),
});

const executionStepSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
  })
  .passthrough();

const executeOperationSchema = z.object({
  agentId: z.string().min(1),
  operationPlan: z
    .object({
      type: z.string().min(1),
      description: z.string().optional(),
      steps: z.array(executionStepSchema).min(1),
      dependencies: z.array(z.string()).optional(),
    })
    .passthrough(),
  executionOptions: z.record(z.unknown()).optional(),
});

const cancelBodySchema = z.object({
  reason: z.string().min(1).optional(),
  compensate: z.boolean().optional(),
  force: z.boolean().optional(),
});

const pauseBodySchema = z.object({ reason: z.string().min(1).optional() });
const resumeBodySchema = z.object({ checkpointId: z.string().min(1).optional() });

interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
}

interface ContextWithUser {
  user: AuthenticatedUser;
}

function isContextWithUser(ctx: unknown): ctx is ContextWithUser {
  if (typeof ctx !== 'object' || ctx === null || !('user' in ctx)) return false;
  const user = (ctx as { user: unknown }).user;
  return (
    typeof user === 'object' && user !== null && typeof (user as { id: unknown }).id === 'string'
  );
}

/**
 * The authenticated caller is the ONLY source of userId. Operation bodies are
 * client-controlled, so reading an owner id from the payload would let any caller
 * execute an operation as another user.
 */
function getAuthUserId(ctx: unknown): string | null {
  return isContextWithUser(ctx) ? ctx.user.id : null;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

interface HistoryEntry {
  kind: 'state' | 'checkpoint';
  id: string;
  createdAt: Date | null;
  data: Record<string, unknown> | null;
}

interface OperationStateRow {
  id: string;
  createdAt: Date | null;
  state: Record<string, unknown> | null;
}

interface OperationCheckpointRow {
  id: string;
  createdAt: Date | null;
  data: Record<string, unknown> | null;
}

interface StatsGroupRow {
  status: string;
  type: string;
  count: number | string;
  avgDuration: number | string;
}

/**
 * SECURITY BOUNDARY. `operations` has no row-level security, so every read and
 * every lifecycle action must be scoped by `operations.userId`. Child tables
 * (operation_states, operation_checkpoints, step_results) hold no owner column
 * at all, so they can only be authorized through their parent operation —
 * querying them by operationId alone is a cross-tenant read.
 */
async function findOwnedOperation(
  operationId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const db = getControlDb();
  const [row] = await db
    .select()
    .from(operations)
    .where(and(eq(operations.id, operationId), eq(operations.userId, userId)))
    .limit(1);
  return (row as Record<string, unknown> | undefined) ?? null;
}

function rejectMalformedOperationId(
  operationId: string,
  set: { status?: number | string }
): { success: false; error: string } | null {
  if (UUID_PATTERN.test(operationId)) return null;
  set.status = 400;
  return { success: false, error: 'Invalid operation id' };
}

export function registerOperationRoutes(engine: OrchestrationEngine | undefined) {
  return new Elysia().group('/api/v1/operations', (group) =>
    withRequiredAuth(group)
      .post('/', async (ctx) => {
        if (!engine) {
          ctx.set.status = 503;
          return { success: false, error: 'Orchestration engine unavailable' };
        }

        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        const parsed = executeOperationSchema.safeParse(ctx.body);
        if (!parsed.success) {
          ctx.set.status = 400;
          return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' };
        }

        const { agentId, operationPlan } = parsed.data;
        const operationId = randomUUID();

        try {
          const workflowInstanceId = await engine.executeOperation({
            id: operationId,
            type: operationPlan.type,
            status: OperationStatus.PENDING,
            agentId,
            userId,
            steps: operationPlan.steps,
            executionPlan: { steps: operationPlan.steps },
            context: {},
            plan: {
              description: operationPlan.description ?? '',
              dependencies: operationPlan.dependencies ?? [],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          } as never);

          ctx.set.status = 201;
          return { success: true, data: { operationId, workflowInstanceId } };
        } catch (error) {
          logger.error('Failed to execute operation', {
            error: error instanceof Error ? error.message : String(error),
            operationId,
          });
          ctx.set.status = 500;
          return { success: false, error: 'Failed to execute operation' };
        }
      }, {
        response: {
          201: DataSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          500: ErrorSchema,
          503: ErrorSchema,
        },
      })

      .get('/', async (ctx) => {
        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        try {
          const page = parsePositiveInt(ctx.query?.page, 1);
          const limit = Math.min(100, parsePositiveInt(ctx.query?.limit, 20));
          const offset = (page - 1) * limit;

          const filters = [eq(operations.userId, userId)];
          if (typeof ctx.query?.status === 'string') {
            filters.push(eq(operations.status, ctx.query.status as OperationStatus));
          }
          if (typeof ctx.query?.type === 'string') {
            filters.push(eq(operations.type, ctx.query.type));
          }

          const db = getControlDb();
          const rows = await db
            .select()
            .from(operations)
            .where(and(...filters))
            .orderBy(desc(operations.createdAt))
            .limit(limit)
            .offset(offset);

          const [totalRow] = (await db
            .select({ total: sql<number>`count(*)` })
            .from(operations)
            .where(and(...filters))) as unknown as { total: number | string }[];
          const total = Number(totalRow?.total ?? 0);

          return {
            success: true,
            data: rows,
            pagination: { page, limit, total, hasMore: offset + rows.length < total },
          };
        } catch (error) {
          logger.error('Failed to list operations', {
            error: error instanceof Error ? error.message : String(error),
          });
          ctx.set.status = 500;
          return { success: false, error: 'Failed to list operations' };
        }
      }, {
        query: t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          status: t.Optional(t.String()),
          type: t.Optional(t.String()),
        }),
        response: { 200: ListSchema, 500: ErrorSchema },
      })

      // Registered before '/:id' — Elysia would otherwise bind 'stats' as an id.
      .get('/stats', async (ctx) => {
        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        try {
          const days = Math.min(365, parsePositiveInt(ctx.query?.days, 30));
          const db = getControlDb();
          const rows = (await db
            .select({
              status: operations.status,
              type: operations.type,
              count: sql<number>`count(*)`,
              avgDuration: sql<number>`coalesce(avg(${operations.actualDuration}), 0)`,
            })
            .from(operations)
            .where(
              and(
                eq(operations.userId, userId),
                sql`${operations.createdAt} >= now() - make_interval(days => ${days})`
              )
            )
            .groupBy(operations.status, operations.type)) as unknown as StatsGroupRow[];

          const operationsByStatus: Record<string, number> = {};
          const operationsByType: Record<string, number> = {};
          let totalOperations = 0;
          let weightedDuration = 0;

          for (const row of rows) {
            const count = Number(row.count ?? 0);
            totalOperations += count;
            operationsByStatus[row.status] = (operationsByStatus[row.status] ?? 0) + count;
            operationsByType[row.type] = (operationsByType[row.type] ?? 0) + count;
            weightedDuration += Number(row.avgDuration ?? 0) * count;
          }

          return {
            success: true,
            data: {
              totalOperations,
              completedOperations: operationsByStatus[OperationStatus.COMPLETED] ?? 0,
              failedOperations: operationsByStatus[OperationStatus.FAILED] ?? 0,
              averageExecutionTime: totalOperations > 0 ? weightedDuration / totalOperations : 0,
              operationsByStatus,
              operationsByType,
            },
          };
        } catch (error) {
          logger.error('Failed to compute operation stats', {
            error: error instanceof Error ? error.message : String(error),
          });
          ctx.set.status = 500;
          return { success: false, error: 'Failed to compute operation stats' };
        }
      }, {
        query: t.Object({ days: t.Optional(t.String()) }),
        response: { 200: DataSchema, 500: ErrorSchema },
      })

      .get('/:id', async (ctx) => {
        const invalidId = rejectMalformedOperationId(ctx.params.id, ctx.set);
        if (invalidId) return invalidId;

        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        try {
          const row = await findOwnedOperation(ctx.params.id, userId);

          if (!row) {
            ctx.set.status = 404;
            return { success: false, error: 'Operation not found' };
          }
          return { success: true, data: row };
        } catch (error) {
          logger.error('Failed to get operation', {
            error: error instanceof Error ? error.message : String(error),
            operationId: ctx.params.id,
          });
          ctx.set.status = 500;
          return { success: false, error: 'Failed to get operation' };
        }
      }, {
        response: { 200: DataSchema, 400: ErrorSchema, 404: ErrorSchema, 500: ErrorSchema },
      })

      .get('/:id/status', async (ctx) => {
        const invalidId = rejectMalformedOperationId(ctx.params.id, ctx.set);
        if (invalidId) return invalidId;

        if (!engine) {
          ctx.set.status = 503;
          return { success: false, error: 'Orchestration engine unavailable' };
        }

        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        try {
          if (!(await findOwnedOperation(ctx.params.id, userId))) {
            ctx.set.status = 404;
            return { success: false, error: 'Operation not found' };
          }

          const status = await engine.getOperationStatus(ctx.params.id);
          if (!status) {
            ctx.set.status = 404;
            return { success: false, error: 'Operation not found' };
          }
          return { success: true, data: status };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('Failed to get operation status', {
            error: message,
            operationId: ctx.params.id,
          });
          ctx.set.status = /not found/i.test(message) ? 404 : 500;
          return { success: false, error: 'Failed to get operation status' };
        }
      }, {
        response: { 200: DataSchema, 400: ErrorSchema, 404: ErrorSchema, 500: ErrorSchema, 503: ErrorSchema },
      })

      .post('/:id/pause', async (ctx) => {
        const invalidId = rejectMalformedOperationId(ctx.params.id, ctx.set);
        if (invalidId) return invalidId;

        if (!engine) {
          ctx.set.status = 503;
          return { success: false, error: 'Orchestration engine unavailable' };
        }

        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        const parsed = pauseBodySchema.safeParse(ctx.body ?? {});
        if (!parsed.success) {
          ctx.set.status = 400;
          return { success: false, error: 'Invalid payload' };
        }

        try {
          if (!(await findOwnedOperation(ctx.params.id, userId))) {
            ctx.set.status = 404;
            return { success: false, error: 'Operation not found' };
          }

          await engine.pauseOperation(ctx.params.id, parsed.data.reason);
          return { success: true, data: { id: ctx.params.id, paused: true } };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('Failed to pause operation', { error: message, operationId: ctx.params.id });
          ctx.set.status = /not found/i.test(message) ? 404 : 500;
          return { success: false, error: 'Failed to pause operation' };
        }
      }, {
        response: {
          200: DataSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
          503: ErrorSchema,
        },
      })

      .post('/:id/resume', async (ctx) => {
        const invalidId = rejectMalformedOperationId(ctx.params.id, ctx.set);
        if (invalidId) return invalidId;

        if (!engine) {
          ctx.set.status = 503;
          return { success: false, error: 'Orchestration engine unavailable' };
        }

        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        const parsed = resumeBodySchema.safeParse(ctx.body ?? {});
        if (!parsed.success) {
          ctx.set.status = 400;
          return { success: false, error: 'Invalid payload' };
        }

        try {
          if (!(await findOwnedOperation(ctx.params.id, userId))) {
            ctx.set.status = 404;
            return { success: false, error: 'Operation not found' };
          }

          await engine.resumeOperation(ctx.params.id, parsed.data.checkpointId);
          return { success: true, data: { id: ctx.params.id, resumed: true } };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('Failed to resume operation', { error: message, operationId: ctx.params.id });
          ctx.set.status = /not found/i.test(message) ? 404 : 500;
          return { success: false, error: 'Failed to resume operation' };
        }
      }, {
        response: {
          200: DataSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
          503: ErrorSchema,
        },
      })

      .post('/:id/cancel', async (ctx) => {
        const invalidId = rejectMalformedOperationId(ctx.params.id, ctx.set);
        if (invalidId) return invalidId;

        if (!engine) {
          ctx.set.status = 503;
          return { success: false, error: 'Orchestration engine unavailable' };
        }

        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        const parsed = cancelBodySchema.safeParse(ctx.body ?? {});
        if (!parsed.success) {
          ctx.set.status = 400;
          return { success: false, error: 'Invalid payload' };
        }

        try {
          if (!(await findOwnedOperation(ctx.params.id, userId))) {
            ctx.set.status = 404;
            return { success: false, error: 'Operation not found' };
          }

          // cancelOperation takes a REQUIRED reason; a bodyless request must still
          // supply one or the engine records an unexplained cancellation.
          await engine.cancelOperation(
            ctx.params.id,
            parsed.data.reason ?? DEFAULT_CANCEL_REASON,
            parsed.data.compensate ?? true,
            parsed.data.force ?? false
          );
          return { success: true, data: { id: ctx.params.id, cancelled: true } };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('Failed to cancel operation', { error: message, operationId: ctx.params.id });
          ctx.set.status = /not found/i.test(message) ? 404 : 500;
          return { success: false, error: 'Failed to cancel operation' };
        }
      }, {
        response: {
          200: DataSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
          503: ErrorSchema,
        },
      })

      .get('/:id/history', async (ctx) => {
        const invalidId = rejectMalformedOperationId(ctx.params.id, ctx.set);
        if (invalidId) return invalidId;

        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        try {
          if (!(await findOwnedOperation(ctx.params.id, userId))) {
            ctx.set.status = 404;
            return { success: false, error: 'Operation not found' };
          }

          const db = getControlDb();
          const [states, checkpoints] = await Promise.all([
            db
              .select()
              .from(operationStates)
              .where(eq(operationStates.operationId, ctx.params.id))
              .orderBy(desc(operationStates.createdAt)),
            db
              .select()
              .from(operationCheckpoints)
              .where(eq(operationCheckpoints.operationId, ctx.params.id))
              .orderBy(desc(operationCheckpoints.createdAt)),
          ]);

          const entries: HistoryEntry[] = [
            ...(states as unknown as OperationStateRow[]).map((row) => ({
              kind: 'state' as const,
              id: row.id,
              createdAt: row.createdAt,
              data: row.state,
            })),
            ...(checkpoints as unknown as OperationCheckpointRow[]).map((row) => ({
              kind: 'checkpoint' as const,
              id: row.id,
              createdAt: row.createdAt,
              data: row.data,
            })),
          ].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

          return { success: true, data: entries };
        } catch (error) {
          logger.error('Failed to get operation history', {
            error: error instanceof Error ? error.message : String(error),
            operationId: ctx.params.id,
          });
          ctx.set.status = 500;
          return { success: false, error: 'Failed to get operation history' };
        }
      }, {
        response: { 200: ListSchema, 400: ErrorSchema, 500: ErrorSchema },
      })

      .get('/:id/logs', async (ctx) => {
        const invalidId = rejectMalformedOperationId(ctx.params.id, ctx.set);
        if (invalidId) return invalidId;

        const userId = getAuthUserId(ctx);
        if (!userId) {
          ctx.set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        try {
          if (!(await findOwnedOperation(ctx.params.id, userId))) {
            ctx.set.status = 404;
            return { success: false, error: 'Operation not found' };
          }

          const db = getControlDb();
          const rows = await db
            .select()
            .from(stepResults)
            .where(eq(stepResults.operationId, ctx.params.id))
            .orderBy(asc(stepResults.stepIndex));

          return { success: true, data: rows };
        } catch (error) {
          logger.error('Failed to get operation logs', {
            error: error instanceof Error ? error.message : String(error),
            operationId: ctx.params.id,
          });
          ctx.set.status = 500;
          return { success: false, error: 'Failed to get operation logs' };
        }
      }, {
        response: { 200: ListSchema, 400: ErrorSchema, 500: ErrorSchema },
      })
  );
}
