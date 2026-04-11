/**
 * Deployment Orchestrator
 *
 * Coordinates multi-platform deployments through registered DeploymentAdapters.
 * Handles provision → deploy → health-check → rollback lifecycle.
 * Emits events to the BullMQ event bus for audit / downstream consumers.
 */

import { logger } from '@uaip/utils'
import type { EventBusService } from '@uaip/shared-services'
import type {
  DeploymentAdapter,
  DeploymentConfig,
  DeploymentResult,
} from '@uaip/types'

const HEALTH_CHECK_RETRIES = 3
const HEALTH_CHECK_INTERVAL_MS = 10_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class DeploymentOrchestrator {
  private adapters: Map<string, DeploymentAdapter> = new Map()
  private eventBus: EventBusService | null = null

  setEventBus(eventBus: EventBusService): void {
    this.eventBus = eventBus
  }

  registerAdapter(platform: string, adapter: DeploymentAdapter): void {
    this.adapters.set(platform, adapter)
    logger.info('deployment-orchestrator: adapter registered', { platform })
  }

  private getAdapter(platform: string): DeploymentAdapter {
    const adapter = this.adapters.get(platform)
    if (!adapter) {
      throw new Error(`No deployment adapter registered for platform: ${platform}`)
    }
    return adapter
  }

  /**
   * Full deployment lifecycle:
   * 1. Provision (if new)
   * 2. Deploy image
   * 3. Health-check with retries
   * 4. Rollback on failure
   * 5. Emit event
   */
  async deploy(
    config: DeploymentConfig,
    options?: { skipProvision?: boolean; previousVersion?: string }
  ): Promise<DeploymentResult> {
    const adapter = this.getAdapter(config.platform)
    const image = config.image
    if (!image) {
      throw new Error('DeploymentConfig.image is required for deploy()')
    }

    let result: DeploymentResult

    try {
      // 1. Provision if needed
      if (!options?.skipProvision) {
        try {
          result = await adapter.provision(config)
          logger.info('deployment-orchestrator: provisioned', {
            appName: config.appName,
            platform: config.platform,
          })
        } catch (error) {
          // If app already exists, that's fine — continue to deploy
          const msg = error instanceof Error ? error.message : String(error)
          if (msg.includes('already exists') || msg.includes('409')) {
            logger.info('deployment-orchestrator: app already exists, skipping provision', {
              appName: config.appName,
            })
          } else {
            throw error
          }
        }
      }

      // 2. Deploy image
      result = await adapter.deploy(config, image)
      logger.info('deployment-orchestrator: deployed', {
        appName: config.appName,
        version: result.version,
      })

      // 3. Health check with retries
      let healthy = false
      for (let attempt = 1; attempt <= HEALTH_CHECK_RETRIES; attempt++) {
        await sleep(HEALTH_CHECK_INTERVAL_MS)
        const health = await adapter.healthCheck(result.url, config.healthEndpoint)
        if (health.healthy) {
          healthy = true
          logger.info('deployment-orchestrator: health check passed', {
            appName: config.appName,
            attempt,
            responseTimeMs: health.responseTimeMs,
          })
          break
        }
        logger.warn('deployment-orchestrator: health check failed', {
          appName: config.appName,
          attempt,
          statusCode: health.statusCode,
        })
      }

      if (!healthy) {
        // 4. Rollback
        logger.error('deployment-orchestrator: all health checks failed, rolling back', {
          appName: config.appName,
        })

        if (options?.previousVersion) {
          const rollbackResult = await adapter.rollback(config.appName, options.previousVersion)
          await this.emitEvent('deployment.failed', {
            appName: config.appName,
            platform: config.platform,
            version: result.version,
            reason: 'health_check_failed',
            rolledBackTo: options.previousVersion,
          })
          return { ...rollbackResult, status: 'rolled_back', healthCheckPassed: false }
        }

        result.status = 'failed'
        result.healthCheckPassed = false
        await this.emitEvent('deployment.failed', {
          appName: config.appName,
          platform: config.platform,
          version: result.version,
          reason: 'health_check_failed',
        })
        throw new Error(
          `Deployment of ${config.appName} failed: health check did not pass after ${HEALTH_CHECK_RETRIES} attempts`
        )
      }

      // 5. Success
      result.status = 'healthy'
      result.healthCheckPassed = true
      await this.emitEvent('deployment.completed', {
        appName: config.appName,
        platform: config.platform,
        version: result.version,
        url: result.url,
      })

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('deployment-orchestrator: deploy failed', {
        appName: config.appName,
        error: message,
      })
      await this.emitEvent('deployment.failed', {
        appName: config.appName,
        platform: config.platform,
        error: message,
      })
      throw error
    }
  }

  async rollback(appName: string, platform: string, version: string): Promise<DeploymentResult> {
    const adapter = this.getAdapter(platform)
    const result = await adapter.rollback(appName, version)

    await this.emitEvent('deployment.rolledback', {
      appName,
      platform,
      version,
    })

    return result
  }

  async destroy(appName: string, platform: string): Promise<void> {
    const adapter = this.getAdapter(platform)
    await adapter.destroy(appName)

    await this.emitEvent('deployment.destroyed', {
      appName,
      platform,
    })
  }

  async getStatus(appName: string, platform: string): Promise<DeploymentResult> {
    const adapter = this.getAdapter(platform)
    return adapter.getStatus(appName)
  }

  async getLogs(appName: string, platform: string, lines?: number): Promise<string[]> {
    const adapter = this.getAdapter(platform)
    return adapter.getLogs(appName, lines)
  }

  async scale(appName: string, platform: string, replicas: number): Promise<void> {
    const adapter = this.getAdapter(platform)
    await adapter.scale(appName, replicas)

    await this.emitEvent('deployment.scaled', {
      appName,
      platform,
      replicas,
    })
  }

  async healthCheck(
    appName: string,
    platform: string,
    url: string,
    endpoint: string
  ): Promise<{ healthy: boolean; statusCode: number; responseTimeMs: number }> {
    const adapter = this.getAdapter(platform)
    return adapter.healthCheck(url, endpoint)
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private async emitEvent(
    eventType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.eventBus) return
    try {
      await this.eventBus.publish(eventType, {
        ...data,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      logger.warn('deployment-orchestrator: failed to emit event', {
        eventType,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
