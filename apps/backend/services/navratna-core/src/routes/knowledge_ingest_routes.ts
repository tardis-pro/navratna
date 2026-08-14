import { Elysia } from 'elysia'
import { withRequiredAuth } from '@uaip/middleware'
import { DatabaseService, ProjectManagementService } from '@uaip/shared-services'
import { logger } from '@uaip/utils'
import { RepoIngestionService } from '../services/repo_ingestion_service.js'

function parseSourceFromBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null
  }

  if (!('source' in body) || typeof body.source !== 'string') {
    return null
  }

  const source = body.source.trim()
  return source.length > 0 ? source : null
}

function parseProjectIdFromBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null
  }

  if (!('projectId' in body) || typeof body.projectId !== 'string') {
    return null
  }

  const projectId = body.projectId.trim()
  return projectId.length > 0 ? projectId : null
}

/** withRequiredAuth attaches `user`; read defensively like the body parsers above. */
function readUserId(ctx: unknown): string | undefined {
  if (typeof ctx !== 'object' || ctx === null || !('user' in ctx)) return undefined
  const user = (ctx as { user?: unknown }).user
  if (typeof user !== 'object' || user === null || !('id' in user)) return undefined
  const id = (user as { id?: unknown }).id
  return typeof id === 'string' ? id : undefined
}

function isClientInputError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('invalid source') ||
    normalized.includes('does not exist') ||
    normalized.includes('not a directory') ||
    normalized.includes('repository not found') ||
    normalized.includes('could not resolve host')
  )
}

export function registerKnowledgeIngestRoutes() {
  const repoIngestionService = new RepoIngestionService()

  return new Elysia().group('/api/v1/knowledge', (group) => withRequiredAuth(group).post('/ingest', async (ctx) => {
    const source = parseSourceFromBody(ctx.body)
    if (!source) {
      ctx.set.status = 400
      return {
        success: false,
        error: 'source must be a non-empty string',
      }
    }
  
    const projectId = parseProjectIdFromBody(ctx.body)

    /**
     * Verified BEFORE the clone, not after: an unchecked id would tag another
     * project's knowledge with this codebase, which every thread in that project
     * would then retrieve. Checking first also avoids paying for a clone that
     * was never going to be attributable.
     */
    if (projectId) {
      const projectService = new ProjectManagementService(DatabaseService.getInstance())
      await projectService.initialize()
      if (!(await projectService.getProject(projectId, readUserId(ctx)))) {
        ctx.set.status = 404
        return { success: false, error: 'Project not found' }
      }
    }

    try {
      const repoContext = await repoIngestionService.ingest(source, {
        ...(projectId ? { projectId } : {}),
      })
      return {
        success: true,
        data: repoContext,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to ingest repository source'
      logger.error('Knowledge ingest route failed', { source, error: message })
      ctx.set.status = isClientInputError(message) ? 400 : 500
      return {
        success: false,
        error: message,
      }
    }
  })
  )
}
