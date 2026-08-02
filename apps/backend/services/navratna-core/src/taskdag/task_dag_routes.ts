import { Elysia, t } from 'elysia'
import { z } from 'zod'
import { withNginxAuth } from '@uaip/middleware'
import type { TaskDAGService } from '@uaip/shared-services'
import { logger } from '@uaip/utils'

const TaskDAGSchema = t.Object({
  id: t.String(),
  goal: t.String(),
  nodes: t.Array(t.Any()),
  edges: t.Array(t.Any()),
  status: t.String(),
  createdAt: t.Any(),
  completedAt: t.Optional(t.Any()),
  metadata: t.Optional(t.Any()),
})
const TaskDAGErrorSchema = t.Object({ success: t.Literal(false), error: t.String() })

const goalSchema = z.string().trim().min(1).max(8000)
const dagIdSchema = z.string().trim().min(1).max(128)

const SERVICE_UNAVAILABLE_ERROR = 'TaskDAG service not initialized'

type StatusSetter = { set: { status?: number | string } }

function serviceUnavailable(ctx: StatusSetter) {
  ctx.set.status = 503
  return { success: false as const, error: SERVICE_UNAVAILABLE_ERROR }
}

export function registerTaskDAGRoutes(taskDAGService: TaskDAGService | undefined) {
  return new Elysia().group('/api/v1/task-dags', (group) =>
    withNginxAuth(group)
      .post(
        '/decompose',
        async (ctx) => {
          if (!taskDAGService) return serviceUnavailable(ctx)
          const parsedGoal = goalSchema.safeParse(ctx.body.goal)
          if (!parsedGoal.success) {
            ctx.set.status = 400
            return { success: false as const, error: 'goal must be a non-empty string (max 8000 chars)' }
          }
          try {
            const dag = await taskDAGService.decompose(parsedGoal.data)
            ctx.set.status = 201
            return { success: true as const, data: dag }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to decompose goal'
            logger.error('TaskDAG decompose route failed', { error: message })
            ctx.set.status = 500
            return { success: false as const, error: message }
          }
        },
        {
          body: t.Object({ goal: t.String({ minLength: 1 }) }),
          response: {
            201: t.Object({ success: t.Literal(true), data: TaskDAGSchema }),
            400: TaskDAGErrorSchema,
            500: TaskDAGErrorSchema,
            503: TaskDAGErrorSchema,
          },
        }
      )
      .get('/', async (ctx) => {
        if (!taskDAGService) return serviceUnavailable(ctx)
        try {
          return { success: true as const, data: taskDAGService.getAllDAGs() }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to list DAGs'
          logger.error('TaskDAG list route failed', { error: message })
          ctx.set.status = 500
          return { success: false as const, error: message }
        }
      })
      // /stats MUST be registered before /:id or Elysia matches 'stats' as an :id
      .get('/stats', async (ctx) => {
        if (!taskDAGService) return serviceUnavailable(ctx)
        try {
          return { success: true as const, data: taskDAGService.getStats() }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to read DAG stats'
          logger.error('TaskDAG stats route failed', { error: message })
          ctx.set.status = 500
          return { success: false as const, error: message }
        }
      })
      .get(
        '/:id',
        async (ctx) => {
          if (!taskDAGService) return serviceUnavailable(ctx)
          const parsedId = dagIdSchema.safeParse(ctx.params.id)
          if (!parsedId.success) {
            ctx.set.status = 400
            return { success: false as const, error: 'id must be a non-empty string (max 128 chars)' }
          }
          try {
            const dag = taskDAGService.getDAG(parsedId.data)
            if (!dag) {
              ctx.set.status = 404
              return { success: false as const, error: `Task DAG ${parsedId.data} not found` }
            }
            return { success: true as const, data: dag }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read DAG'
            logger.error('TaskDAG get route failed', { dagId: ctx.params.id, error: message })
            ctx.set.status = 500
            return { success: false as const, error: message }
          }
        },
        { params: t.Object({ id: t.String({ minLength: 1 }) }) }
      )
      .post(
        '/:id/execute',
        async (ctx) => {
          if (!taskDAGService) return serviceUnavailable(ctx)
          const parsedId = dagIdSchema.safeParse(ctx.params.id)
          if (!parsedId.success) {
            ctx.set.status = 400
            return { success: false as const, error: 'id must be a non-empty string (max 128 chars)' }
          }
          try {
            const dag = taskDAGService.getDAG(parsedId.data)
            if (!dag) {
              ctx.set.status = 404
              return { success: false as const, error: `Task DAG ${parsedId.data} not found` }
            }
            // Long-running (LLM-backed) execution: run in background and let the
            // client follow progress over the Socket.IO bridge. 202 Accepted.
            void taskDAGService.executeDAG(dag).catch((error: unknown) => {
              logger.error('TaskDAG background execution failed', {
                dagId: parsedId.data,
                error: error instanceof Error ? error.message : String(error),
              })
            })
            ctx.set.status = 202
            return { success: true as const, data: dag }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to start DAG execution'
            logger.error('TaskDAG execute route failed', { dagId: ctx.params.id, error: message })
            ctx.set.status = 500
            return { success: false as const, error: message }
          }
        },
        { params: t.Object({ id: t.String({ minLength: 1 }) }) }
      )
  )
}
