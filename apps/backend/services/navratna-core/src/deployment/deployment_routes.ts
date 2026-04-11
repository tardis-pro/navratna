/**
 * Deployment Routes — Elysia REST endpoints for TARDIS deployment management.
 */

import { Elysia } from 'elysia'
import { z } from 'zod'
import { logger } from '@uaip/utils'
import { getControlDb, eq, deployments, deploymentEvents } from '@uaip/shared-services'
import type { DeploymentOrchestrator } from './deployment_orchestrator.js'
import type { DeploymentConfig, DeploymentPlatform } from '@uaip/types'

// ─── AUTH ───────────────────────────────────────────────────────────────

function requireAdmin(headers: Record<string, string | undefined>, request: Request, set: { status?: number | string }): boolean {
  const role = headers['x-user-role'] || request.headers.get('x-user-role')
  if (role !== 'admin') {
    set.status = 403
    return false
  }
  return true
}

// ─── ZOD SCHEMAS ────────────────────────────────────────────────────────

const createDeploymentSchema = z.object({
  appName: z.string().min(1),
  subdomain: z.string().min(1),
  platform: z.string().min(1),
  image: z.string().optional(),
  buildContext: z.string().optional(),
  dockerfile: z.string().optional(),
  repoUrl: z.string().optional(),
  envVars: z.record(z.string()).optional(),
  secrets: z.array(z.string()).optional(),
  healthEndpoint: z.string().optional(),
  port: z.number().optional(),
  scaling: z.object({ min: z.number(), max: z.number() }).optional(),
  region: z.string().optional(),
  resources: z.object({ cpu: z.string(), memory: z.string() }).optional(),
})

const deploySchema = z.object({
  image: z.string().optional(),
})

// ─── ROUTES ─────────────────────────────────────────────────────────────

export function registerDeploymentRoutes(orchestrator: DeploymentOrchestrator | null) {
  return new Elysia()

    // ─── CREATE ───────────────────────────────────────────────────────
    .post('/api/v1/deployments', async ({ body, set, headers, request }) => {
      if (!requireAdmin(headers, request, set)) {
        return { success: false, error: 'Admin access required' }
      }
      const parsed = createDeploymentSchema.safeParse(body)
      if (!parsed.success) {
        set.status = 400
        return { error: 'Validation Error', details: parsed.error.flatten() }
      }
      const data = parsed.data

      try {
        const db = getControlDb()

        const record = await db
          .insert(deployments)
          .values({
            subdomainName: data.subdomain,
            repoUrl: data.repoUrl ?? null,
            platform: data.platform,
            appName: data.appName,
            status: 'provisioned',
            healthEndpoint: data.healthEndpoint ?? '/health',
            url: `https://${data.subdomain}.fly.dev`,
            config: {
              envVars: data.envVars ?? {},
              secrets: data.secrets ?? [],
              port: data.port ?? 3000,
              scaling: data.scaling,
              region: data.region,
              resources: data.resources,
              image: data.image,
              buildContext: data.buildContext,
              dockerfile: data.dockerfile,
            } as Record<string, unknown>,
          })
          .returning()

        await db.insert(deploymentEvents).values({
          deploymentId: record[0].id,
          eventType: 'created',
          details: { platform: data.platform, appName: data.appName },
          triggeredBy: 'user',
        })

        logger.info('deployment: created', { id: record[0].id, appName: data.appName })
        return { success: true, data: record[0] }
      } catch (error) {
        logger.error('deployment: create failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create deployment' }
      }
    })

    // ─── LIST ─────────────────────────────────────────────────────────
    .get('/api/v1/deployments', async ({ set }) => {
      try {
        const db = getControlDb()
        const records = await db.select().from(deployments)
        return { success: true, data: records }
      } catch (error) {
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to list deployments' }
      }
    })

    // ─── GET BY ID ────────────────────────────────────────────────────
    .get('/api/v1/deployments/:id', async ({ params, set }) => {
      try {
        const db = getControlDb()
        const records = await db.select().from(deployments).where(eq(deployments.id, params.id))

        if (records.length === 0) {
          set.status = 404
          return { success: false, error: 'Deployment not found' }
        }

        const events = await db.select().from(deploymentEvents).where(eq(deploymentEvents.deploymentId, params.id))
        return { success: true, data: { ...records[0], events } }
      } catch (error) {
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get deployment' }
      }
    })

    // ─── TRIGGER DEPLOY ───────────────────────────────────────────────
    .post('/api/v1/deployments/:id/deploy', async ({ params, body, set, headers, request }) => {
      if (!requireAdmin(headers, request, set)) {
        return { success: false, error: 'Admin access required' }
      }
      if (!orchestrator) {
        set.status = 503
        return { success: false, error: 'Deployment orchestrator not available' }
      }

      const parsed = deploySchema.safeParse(body)
      const requestImage = parsed.success ? parsed.data.image : undefined

      try {
        const db = getControlDb()
        const records = await db.select().from(deployments).where(eq(deployments.id, params.id))

        if (records.length === 0) {
          set.status = 404
          return { success: false, error: 'Deployment not found' }
        }

        const record = records[0]
        const storedConfig = (record.config ?? {}) as Record<string, unknown>
        const image = requestImage ?? storedConfig.image as string | undefined

        if (!image) {
          set.status = 400
          return { success: false, error: 'No image specified in request or stored config' }
        }

        const config: DeploymentConfig = {
          appName: record.appName,
          subdomain: record.subdomainName,
          platform: record.platform as DeploymentPlatform,
          image,
          envVars: (storedConfig.envVars as Record<string, string>) ?? {},
          secrets: (storedConfig.secrets as string[]) ?? [],
          healthEndpoint: record.healthEndpoint ?? '/health',
          port: (storedConfig.port as number) ?? 3000,
          scaling: storedConfig.scaling as DeploymentConfig['scaling'],
          region: storedConfig.region as string | undefined,
          resources: storedConfig.resources as DeploymentConfig['resources'],
        }

        await db.update(deployments).set({ status: 'deploying', updatedAt: new Date() }).where(eq(deployments.id, params.id))

        const result = await orchestrator.deploy(config, {
          skipProvision: false,
          previousVersion: record.currentVersion ?? undefined,
        })

        await db.update(deployments).set({
          status: result.status,
          currentVersion: image,
          previousVersion: record.currentVersion,
          url: result.url,
          lastDeployAt: new Date(),
          lastHealthCheck: new Date(),
          updatedAt: new Date(),
        }).where(eq(deployments.id, params.id))

        await db.insert(deploymentEvents).values({
          deploymentId: params.id,
          eventType: 'deployed',
          details: { version: image, status: result.status, healthCheckPassed: result.healthCheckPassed } as Record<string, unknown>,
          triggeredBy: 'user',
        })

        return { success: true, data: result }
      } catch (error) {
        logger.error('deployment: deploy failed', { id: params.id, error: error instanceof Error ? error.message : String(error) })
        try {
          const db = getControlDb()
          await db.update(deployments).set({ status: 'failed', updatedAt: new Date() }).where(eq(deployments.id, params.id))
        } catch { /* swallow */ }
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Deploy failed' }
      }
    })

    // ─── ROLLBACK ─────────────────────────────────────────────────────
    .post('/api/v1/deployments/:id/rollback', async ({ params, set, headers, request }) => {
      if (!requireAdmin(headers, request, set)) {
        return { success: false, error: 'Admin access required' }
      }
      if (!orchestrator) {
        set.status = 503
        return { success: false, error: 'Deployment orchestrator not available' }
      }

      try {
        const db = getControlDb()
        const records = await db.select().from(deployments).where(eq(deployments.id, params.id))

        if (records.length === 0) {
          set.status = 404
          return { success: false, error: 'Deployment not found' }
        }

        const record = records[0]
        if (!record.previousVersion) {
          set.status = 400
          return { success: false, error: 'No previous version to roll back to' }
        }

        const result = await orchestrator.rollback(record.appName, record.platform, record.previousVersion)

        await db.update(deployments).set({
          status: result.status,
          currentVersion: record.previousVersion,
          previousVersion: record.currentVersion,
          lastDeployAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(deployments.id, params.id))

        await db.insert(deploymentEvents).values({
          deploymentId: params.id,
          eventType: 'rolled_back',
          details: { fromVersion: record.currentVersion, toVersion: record.previousVersion } as Record<string, unknown>,
          triggeredBy: 'user',
        })

        return { success: true, data: result }
      } catch (error) {
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Rollback failed' }
      }
    })

    // ─── DESTROY ──────────────────────────────────────────────────────
    .delete('/api/v1/deployments/:id', async ({ params, set, headers, request }) => {
      if (!requireAdmin(headers, request, set)) {
        return { success: false, error: 'Admin access required' }
      }
      if (!orchestrator) {
        set.status = 503
        return { success: false, error: 'Deployment orchestrator not available' }
      }

      try {
        const db = getControlDb()
        const records = await db.select().from(deployments).where(eq(deployments.id, params.id))

        if (records.length === 0) {
          set.status = 404
          return { success: false, error: 'Deployment not found' }
        }

        const record = records[0]
        await orchestrator.destroy(record.appName, record.platform)

        await db.update(deployments).set({ status: 'down', updatedAt: new Date() }).where(eq(deployments.id, params.id))
        await db.insert(deploymentEvents).values({
          deploymentId: params.id,
          eventType: 'destroyed',
          details: { appName: record.appName } as Record<string, unknown>,
          triggeredBy: 'user',
        })

        return { success: true }
      } catch (error) {
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Destroy failed' }
      }
    })

    // ─── LOGS ─────────────────────────────────────────────────────────
    .get('/api/v1/deployments/:id/logs', async ({ params, query, set }) => {
      if (!orchestrator) {
        set.status = 503
        return { success: false, error: 'Deployment orchestrator not available' }
      }

      try {
        const db = getControlDb()
        const records = await db.select().from(deployments).where(eq(deployments.id, params.id))

        if (records.length === 0) {
          set.status = 404
          return { success: false, error: 'Deployment not found' }
        }

        const record = records[0]
        const rawQuery = query as Record<string, string | undefined>
        const lines = rawQuery.lines ? parseInt(rawQuery.lines, 10) : 100
        const logs = await orchestrator.getLogs(record.appName, record.platform, lines)

        return { success: true, data: { logs } }
      } catch (error) {
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get logs' }
      }
    })

    // ─── HEALTH ───────────────────────────────────────────────────────
    .get('/api/v1/deployments/:id/health', async ({ params, set }) => {
      if (!orchestrator) {
        set.status = 503
        return { success: false, error: 'Deployment orchestrator not available' }
      }

      try {
        const db = getControlDb()
        const records = await db.select().from(deployments).where(eq(deployments.id, params.id))

        if (records.length === 0) {
          set.status = 404
          return { success: false, error: 'Deployment not found' }
        }

        const record = records[0]
        if (!record.url) {
          set.status = 400
          return { success: false, error: 'Deployment has no URL' }
        }

        const health = await orchestrator.healthCheck(record.appName, record.platform, record.url, record.healthEndpoint ?? '/health')

        await db.update(deployments).set({
          lastHealthCheck: new Date(),
          status: health.healthy ? 'healthy' : 'degraded',
          updatedAt: new Date(),
        }).where(eq(deployments.id, params.id))

        return { success: true, data: health }
      } catch (error) {
        set.status = 500
        return { success: false, error: error instanceof Error ? error.message : 'Health check failed' }
      }
    })
}
