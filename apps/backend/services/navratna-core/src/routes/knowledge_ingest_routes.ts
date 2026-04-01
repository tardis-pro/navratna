import { Elysia } from 'elysia'
import { withNginxAuth } from '@uaip/middleware'
import { logger } from '@uaip/utils'
import { RepoIngestionService } from '../services/repo_ingestion_service.js'

const repoIngestionService = new RepoIngestionService()

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
  return new Elysia().group('/api/v1/knowledge', (group) => withNginxAuth(group).post('/ingest', async (ctx) => {
    const source = parseSourceFromBody(ctx.body)
    if (!source) {
      ctx.set.status = 400
      return {
        success: false,
        error: 'source must be a non-empty string',
      }
    }
  
    try {
      const repoContext = await repoIngestionService.ingest(source)
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
