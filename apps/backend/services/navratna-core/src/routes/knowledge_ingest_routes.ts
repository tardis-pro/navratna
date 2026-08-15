import { Elysia } from 'elysia'
import { timingSafeEqual } from 'node:crypto'
import { withOptionalAuth } from '@uaip/middleware'
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

const SERVICE_TOKEN_HEADER = 'x-navratna-service-token'

/**
 * Strip any `user:password@` from a URL before it reaches a log.
 *
 * Deliberately string-based rather than URL-parsed: a malformed URL is exactly
 * the case that reaches the error path, and `new URL()` throwing there would
 * either lose the log line or fall back to printing the raw value — which is
 * the thing being prevented.
 */
function redactUrlCredentials(value: string): string {
  return value.replace(/\/\/[^/@\s]*@/g, '//<redacted>@')
}

/**
 * A caller that is a machine rather than a person.
 *
 * Ingest had exactly one door and it needed a human session behind it, which
 * meant `tardis init` could register a project and then never hand over its
 * repository: the provisioner has no user to be. Every project on the platform
 * was therefore linked and empty, and the knowledge graph held tool definitions
 * and not one line of anybody's code.
 *
 * This is the same shape as the provisioning route in security-gateway
 * (`verifyServiceToken`, `project_provision_elysia.ts`) and deliberately so —
 * the edge lets the request through and the HANDLER does the checking. It is
 * reimplemented rather than imported because navratna-core does not depend on
 * security-gateway and should not start; twelve lines duplicated is cheaper than
 * a new coupling between two deployable services.
 *
 * Fails closed when the token is unset, and compares in constant time. Length is
 * checked first because timingSafeEqual throws on a mismatch and the throw would
 * itself leak length.
 */
function isServiceCall(ctx: unknown): boolean {
  const expected = process.env.PROJECT_PROVISION_TOKEN
  if (!expected) return false
  if (typeof ctx !== 'object' || ctx === null || !('request' in ctx)) return false
  const request = (ctx as { request?: Request }).request
  const presented = request?.headers?.get(SERVICE_TOKEN_HEADER)
  if (!presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** withOptionalAuth attaches `user`; read defensively like the body parsers above. */
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

  return new Elysia().group('/api/v1/knowledge', (group) => withOptionalAuth(group).post('/ingest', async (ctx) => {
    // withOptionalAuth attaches a session when there is one but refuses nobody,
    // so this handler is now the wall: a caller must be either an authenticated
    // person or the platform itself. Neither means 401, exactly as before.
    const userId = readUserId(ctx)
    const service = isServiceCall(ctx)
    if (!userId && !service) {
      ctx.set.status = 401
      return { success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' }
    }

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
      // A person is scoped to the projects they can see. The platform is not
      // scoped to anyone — it provisions every project on the box, so its own
      // ingest must be able to name any of them — and the service token IS that
      // authorisation. The existence check still runs either way: it is what
      // stops one project's knowledge being tagged onto another, which is a
      // mistake no credential should be able to make.
      if (!(await projectService.getProject(projectId, service ? undefined : userId))) {
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
      // REDACTED BEFORE LOGGING, and this is not hypothetical caution.
      //
      // `source` is a clone URL, and the obvious way to make a private repo
      // clonable is https://user:token@host/... — which would work immediately
      // and put the credential in this log line on the FIRST failure. Failed
      // clones are exactly what you get while ingest is being set up, so the
      // credential would reach the logs before the feature ever reached working.
      //
      // Stripping userinfo here means that trap cannot be sprung by a later
      // change somewhere else. The clone credential itself must NOT travel in
      // the URL at all — it goes as an http.extraHeader — but a log line is the
      // wrong place to rely on that being remembered.
      logger.error('Knowledge ingest route failed', { source: redactUrlCredentials(source), error: message })
      ctx.set.status = isClientInputError(message) ? 400 : 500
      return {
        success: false,
        error: message,
      }
    }
  })
  )
}
