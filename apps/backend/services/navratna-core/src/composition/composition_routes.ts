/**
 * Composition Routes — Elysia REST endpoints for workflow composition management.
 *
 * PM-274: CRUD, lifecycle (activate/deactivate), execution, and history.
 * Follows the Zod validation pattern from deployment_routes.ts.
 */

import { Elysia } from 'elysia'
import { z } from 'zod'
import { logger } from '@uaip/utils'
import { CompositionDefinitionSchema } from '@uaip/types'
import { WorkflowCompositionService } from './workflow_composition_service.js'

// ─── AUTH ───────────────────────────────────────────────────────────────

function requireAdmin(headers: Record<string, string | undefined>, request: Request, set: { status?: number | string }): boolean {
  const role = headers['x-user-role'] || request.headers.get('x-user-role')
  if (role !== 'admin') {
    set.status = 403
    return false
  }
  return true
}

function getUserId(headers: Record<string, string | undefined>, request: Request): string {
  return headers['x-user-id'] || request.headers.get('x-user-id') || 'anonymous'
}

// ─── ZOD SCHEMAS ────────────────────────────────────────────────────────

const createCompositionSchema = CompositionDefinitionSchema

const updateCompositionSchema = CompositionDefinitionSchema.partial()

const executeSchema = z.object({
  triggerData: z.record(z.unknown()).optional(),
})

const listQuerySchema = z.object({
  category: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  userId: z.string().optional(),
  isPublic: z.enum(['true', 'false']).optional(),
})

const historyQuerySchema = z.object({
  limit: z.string().optional(),
})

// ─── ROUTES ─────────────────────────────────────────────────────────────

export function registerCompositionRoutes() {
  return new Elysia()

    // ─── CREATE ───────────────────────────────────────────────────────
    .post('/api/v1/compositions', async ({ body, set, headers, request }) => {
      if (!requireAdmin(headers, request, set)) {
        return { success: false, error: 'Admin access required' }
      }

      const parsed = createCompositionSchema.safeParse(body)
      if (!parsed.success) {
        set.status = 400
        return { success: false, error: 'Validation Error', details: parsed.error.flatten() }
      }

      try {
        const userId = getUserId(headers, request)
        const service = WorkflowCompositionService.getInstance()
        const record = await service.create(parsed.data, userId)

        logger.info('composition: created', { id: record.id, name: record.name })
        return { success: true, data: record }
      } catch (error) {
        logger.error('composition: create failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create composition' }
      }
    })

    // ─── LIST ─────────────────────────────────────────────────────────
    .get('/api/v1/compositions', async ({ query, set }) => {
      try {
        const rawQuery = query as Record<string, string | undefined>
        const parsed = listQuerySchema.safeParse(rawQuery)
        const filters = parsed.success ? {
          category: parsed.data.category,
          isActive: parsed.data.isActive === 'true' ? true : parsed.data.isActive === 'false' ? false : undefined,
          userId: parsed.data.userId,
          isPublic: parsed.data.isPublic === 'true' ? true : parsed.data.isPublic === 'false' ? false : undefined,
        } : undefined

        const service = WorkflowCompositionService.getInstance()
        const records = await service.list(filters)

        return { success: true, data: records }
      } catch (error) {
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to list compositions' }
      }
    })

    // ─── GET BY ID ────────────────────────────────────────────────────
    .get('/api/v1/compositions/:id', async ({ params, set }) => {
      try {
        const service = WorkflowCompositionService.getInstance()
        const record = await service.get(params.id)

        if (!record) {
          set.status = 404
          return { success: false, error: 'Composition not found' }
        }

        return { success: true, data: record }
      } catch (error) {
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get composition' }
      }
    })

    // ─── UPDATE ───────────────────────────────────────────────────────
    .put('/api/v1/compositions/:id', async ({ params, body, set, headers, request }) => {
      if (!requireAdmin(headers, request, set)) {
        return { success: false, error: 'Admin access required' }
      }

      const parsed = updateCompositionSchema.safeParse(body)
      if (!parsed.success) {
        set.status = 400
        return { success: false, error: 'Validation Error', details: parsed.error.flatten() }
      }

      try {
        const userId = getUserId(headers, request)
        const service = WorkflowCompositionService.getInstance()
        const record = await service.update(params.id, parsed.data, userId)

        logger.info('composition: updated', { id: record.id })
        return { success: true, data: record }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          set.status = 404
          return { success: false, error: error.message }
        }
        logger.error('composition: update failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update composition' }
      }
    })

    // ─── ACTIVATE ─────────────────────────────────────────────────────
    .post('/api/v1/compositions/:id/activate', async ({ params, set, headers, request }) => {
      if (!requireAdmin(headers, request, set)) {
        return { success: false, error: 'Admin access required' }
      }

      try {
        const userId = getUserId(headers, request)
        const service = WorkflowCompositionService.getInstance()
        const result = await service.activate(params.id, userId)

        if (!result.valid) {
          set.status = 422
        }

        return { success: result.valid, data: result }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          set.status = 404
          return { success: false, error: error.message }
        }
        logger.error('composition: activate failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to activate composition' }
      }
    })

    // ─── DEACTIVATE ───────────────────────────────────────────────────
    .post('/api/v1/compositions/:id/deactivate', async ({ params, set, headers, request }) => {
      if (!requireAdmin(headers, request, set)) {
        return { success: false, error: 'Admin access required' }
      }

      try {
        const userId = getUserId(headers, request)
        const service = WorkflowCompositionService.getInstance()
        await service.deactivate(params.id, userId)

        return { success: true }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          set.status = 404
          return { success: false, error: error.message }
        }
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to deactivate composition' }
      }
    })

    // ─── EXECUTE ──────────────────────────────────────────────────────
    .post('/api/v1/compositions/:id/execute', async ({ params, body, set, headers, request }) => {
      const parsed = executeSchema.safeParse(body ?? {})
      if (!parsed.success) {
        set.status = 400
        return { success: false, error: 'Validation Error', details: parsed.error.flatten() }
      }

      try {
        const userId = getUserId(headers, request)
        const service = WorkflowCompositionService.getInstance()
        const instance = await service.execute(params.id, parsed.data.triggerData, userId)

        return { success: true, data: instance }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          set.status = 404
          return { success: false, error: error.message }
        }
        if (error instanceof Error && error.message.includes('inactive')) {
          set.status = 409
          return { success: false, error: error.message }
        }
        logger.error('composition: execute failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to execute composition' }
      }
    })

    // ─── EXECUTION HISTORY ────────────────────────────────────────────
    .get('/api/v1/compositions/:id/history', async ({ params, query, set }) => {
      try {
        const rawQuery = query as Record<string, string | undefined>
        const parsed = historyQuerySchema.safeParse(rawQuery)
        const limit = parsed.success && parsed.data.limit ? parseInt(parsed.data.limit, 10) : 50

        const service = WorkflowCompositionService.getInstance()

        // Verify composition exists
        const composition = await service.get(params.id)
        if (!composition) {
          set.status = 404
          return { success: false, error: 'Composition not found' }
        }

        const instances = await service.getExecutionHistory(params.id, limit)

        return { success: true, data: instances }
      } catch (error) {
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get execution history' }
      }
    })

    // ─── DELETE ───────────────────────────────────────────────────────
    .delete('/api/v1/compositions/:id', async ({ params, set, headers, request }) => {
      if (!requireAdmin(headers, request, set)) {
        return { success: false, error: 'Admin access required' }
      }

      try {
        const userId = getUserId(headers, request)
        const service = WorkflowCompositionService.getInstance()
        await service.delete(params.id, userId)

        return { success: true }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          set.status = 404
          return { success: false, error: error.message }
        }
        if (error instanceof Error && error.message.includes('active')) {
          set.status = 409
          return { success: false, error: error.message }
        }
        logger.error('composition: delete failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete composition' }
      }
    })
}
