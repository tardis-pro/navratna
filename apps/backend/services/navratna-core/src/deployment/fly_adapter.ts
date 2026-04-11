/**
 * Fly.io Deployment Adapter
 *
 * Implements DeploymentAdapter using the Fly.io Machines API (REST).
 * API base: https://api.machines.dev/v1/
 * Auth: FLY_API_TOKEN environment variable (Bearer token).
 */

import { logger } from '@uaip/utils'
import type {
  DeploymentAdapter,
  DeploymentConfig,
  DeploymentResult,
  DeploymentHealthStatus,
} from '@uaip/types'

const FLY_API_BASE = 'https://api.machines.dev/v1'
const MACHINE_POLL_INTERVAL_MS = 2_000
const MACHINE_POLL_MAX_ATTEMPTS = 30

function getFlyToken(): string {
  const token = process.env.FLY_API_TOKEN
  if (!token) {
    throw new Error('FLY_API_TOKEN environment variable is not set')
  }
  return token
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getFlyToken()}`,
    'Content-Type': 'application/json',
  }
}

async function flyFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${FLY_API_BASE}${path}`
  const response = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers as Record<string, string> ?? {}) },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '<no body>')
    throw new Error(
      `Fly API ${options.method ?? 'GET'} ${path} returned ${response.status}: ${body}`
    )
  }

  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

interface FlyApp {
  id: string
  name: string
  organization: { slug: string }
  status: string
}

interface FlyMachine {
  id: string
  name: string
  state: string
  image_ref?: { repository: string; tag: string; digest: string }
  instance_id?: string
  config?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export class FlyAdapter implements DeploymentAdapter {
  readonly platform = 'fly'

  async provision(config: DeploymentConfig): Promise<DeploymentResult> {
    logger.info('fly: provisioning app', { appName: config.appName, region: config.region })

    // 1. Create Fly app
    const org = process.env.FLY_ORG ?? 'personal'
    const app = await flyFetch<FlyApp>('/apps', {
      method: 'POST',
      body: JSON.stringify({
        app_name: config.appName,
        org_slug: org,
      }),
    })

    // 2. Set secrets (env vars marked as secrets)
    if (config.secrets.length > 0) {
      const secretsPayload: Record<string, string> = {}
      for (const key of config.secrets) {
        if (config.envVars[key]) {
          secretsPayload[key] = config.envVars[key]
        }
      }
      if (Object.keys(secretsPayload).length > 0) {
        await flyFetch(`/apps/${config.appName}/secrets`, {
          method: 'POST',
          body: JSON.stringify(secretsPayload),
        })
      }
    }

    logger.info('fly: app provisioned', { appName: app.name })

    return {
      id: app.id ?? config.appName,
      status: 'provisioned',
      url: `https://${config.subdomain}.fly.dev`,
      version: '0',
      deployedAt: new Date(),
      healthCheckPassed: false,
    }
  }

  async deploy(config: DeploymentConfig, image: string): Promise<DeploymentResult> {
    logger.info('fly: deploying', { appName: config.appName, image })

    // Check for existing machines
    const existingMachines = await flyFetch<FlyMachine[]>(
      `/apps/${config.appName}/machines`
    )

    const machineConfig = this.buildMachineConfig(config, image)
    let machine: FlyMachine

    if (existingMachines && existingMachines.length > 0) {
      // Update existing machine
      machine = await flyFetch<FlyMachine>(
        `/apps/${config.appName}/machines/${existingMachines[0].id}`,
        {
          method: 'POST',
          body: JSON.stringify({ config: machineConfig }),
        }
      )
      logger.info('fly: updated existing machine', { machineId: machine.id })
    } else {
      // Create new machine
      machine = await flyFetch<FlyMachine>(
        `/apps/${config.appName}/machines`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: `${config.appName}-web`,
            region: config.region ?? 'iad',
            config: machineConfig,
          }),
        }
      )
      logger.info('fly: created new machine', { machineId: machine.id })
    }

    // Wait for machine to reach 'started' state
    await this.waitForMachineState(config.appName, machine.id, 'started')

    const version = machine.instance_id ?? machine.id

    return {
      id: machine.id,
      status: 'deploying',
      url: `https://${config.subdomain}.fly.dev`,
      version,
      deployedAt: new Date(),
      healthCheckPassed: false,
    }
  }

  async healthCheck(url: string, endpoint: string): Promise<DeploymentHealthStatus> {
    const fullUrl = `${url}${endpoint}`
    const startMs = performance.now()
    const checkedAt = new Date()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10_000)

      const response = await fetch(fullUrl, { signal: controller.signal })
      clearTimeout(timeoutId)

      const responseTimeMs = Math.round(performance.now() - startMs)
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = undefined
      }

      return {
        healthy: response.ok,
        statusCode: response.status,
        responseTimeMs,
        body,
        checkedAt,
      }
    } catch (error) {
      const responseTimeMs = Math.round(performance.now() - startMs)
      logger.warn('fly: health check failed', {
        url: fullUrl,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        healthy: false,
        statusCode: 0,
        responseTimeMs,
        checkedAt,
      }
    }
  }

  async rollback(appName: string, version: string): Promise<DeploymentResult> {
    logger.info('fly: rolling back', { appName, version })

    // Get current machines
    const machines = await flyFetch<FlyMachine[]>(`/apps/${appName}/machines`)
    if (!machines || machines.length === 0) {
      throw new Error(`No machines found for app ${appName}`)
    }

    // Update machine to the previous image version
    const machine = machines[0]
    const currentConfig = machine.config ?? {}
    const updatedConfig = {
      ...currentConfig,
      image: version,
    }

    const updatedMachine = await flyFetch<FlyMachine>(
      `/apps/${appName}/machines/${machine.id}`,
      {
        method: 'POST',
        body: JSON.stringify({ config: updatedConfig }),
      }
    )

    await this.waitForMachineState(appName, updatedMachine.id, 'started')

    return {
      id: updatedMachine.id,
      status: 'rolled_back',
      url: `https://${appName}.fly.dev`,
      version,
      deployedAt: new Date(),
      healthCheckPassed: false,
    }
  }

  async destroy(appName: string): Promise<void> {
    logger.info('fly: destroying app', { appName })
    await flyFetch(`/apps/${appName}`, { method: 'DELETE' })
    logger.info('fly: app destroyed', { appName })
  }

  async getLogs(appName: string, lines = 100): Promise<string[]> {
    // The Fly Machines API log endpoint returns ndjson
    try {
      const url = `${FLY_API_BASE}/apps/${appName}/machines`
      const machines = await flyFetch<FlyMachine[]>(`/apps/${appName}/machines`)
      if (!machines || machines.length === 0) return []

      // Fetch logs from the first machine via the logs endpoint
      const logsUrl = `https://api.machines.dev/v1/apps/${appName}/machines/${machines[0].id}/logs?limit=${lines}`
      const response = await fetch(logsUrl, { headers: headers() })
      if (!response.ok) {
        logger.warn('fly: failed to fetch logs', { appName, status: response.status })
        return []
      }

      const text = await response.text()
      return text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(-lines)
    } catch (error) {
      logger.warn('fly: getLogs failed', {
        appName,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  async scale(appName: string, replicas: number): Promise<void> {
    logger.info('fly: scaling', { appName, replicas })

    const machines = await flyFetch<FlyMachine[]>(`/apps/${appName}/machines`)
    const currentCount = machines?.length ?? 0

    if (replicas > currentCount && machines && machines.length > 0) {
      // Scale up: clone the first machine
      const template = machines[0]
      for (let i = currentCount; i < replicas; i++) {
        await flyFetch(`/apps/${appName}/machines`, {
          method: 'POST',
          body: JSON.stringify({
            name: `${appName}-web-${i}`,
            region: 'iad',
            config: template.config,
          }),
        })
      }
    } else if (replicas < currentCount && machines) {
      // Scale down: destroy excess machines (keep first N)
      const toRemove = machines.slice(replicas)
      for (const m of toRemove) {
        await flyFetch(`/apps/${appName}/machines/${m.id}`, { method: 'DELETE' })
      }
    }

    logger.info('fly: scaled', { appName, from: currentCount, to: replicas })
  }

  async getStatus(appName: string): Promise<DeploymentResult> {
    const machines = await flyFetch<FlyMachine[]>(`/apps/${appName}/machines`)

    if (!machines || machines.length === 0) {
      return {
        id: appName,
        status: 'down',
        url: `https://${appName}.fly.dev`,
        version: 'unknown',
        deployedAt: new Date(),
        healthCheckPassed: false,
      }
    }

    const primary = machines[0]
    const allStarted = machines.every((m) => m.state === 'started')
    const anyStarted = machines.some((m) => m.state === 'started')

    let status: DeploymentResult['status'] = 'down'
    if (allStarted) status = 'healthy'
    else if (anyStarted) status = 'degraded'

    const imageTag = primary.image_ref?.tag ?? primary.image_ref?.digest ?? 'unknown'

    return {
      id: primary.id,
      status,
      url: `https://${appName}.fly.dev`,
      version: imageTag,
      deployedAt: primary.updated_at ? new Date(primary.updated_at) : new Date(),
      healthCheckPassed: allStarted,
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private buildMachineConfig(
    config: DeploymentConfig,
    image: string
  ): Record<string, unknown> {
    // Filter out secret keys from env — they are set via /secrets endpoint
    const envVars = { ...config.envVars }
    for (const key of config.secrets) {
      delete envVars[key]
    }

    const machineConfig: Record<string, unknown> = {
      image,
      env: envVars,
      services: [
        {
          ports: [
            { port: 443, handlers: ['tls', 'http'] },
            { port: 80, handlers: ['http'] },
          ],
          protocol: 'tcp',
          internal_port: config.port,
          checks: [
            {
              type: 'http',
              port: config.port,
              method: 'GET',
              path: config.healthEndpoint,
              interval: '15s',
              timeout: '5s',
            },
          ],
        },
      ],
      guest: this.buildGuestSpec(config),
    }

    return machineConfig
  }

  private buildGuestSpec(config: DeploymentConfig): Record<string, unknown> {
    const guest: Record<string, unknown> = {
      cpu_kind: 'shared',
      cpus: 1,
      memory_mb: 256,
    }

    if (config.resources) {
      // Parse cpu string like "1" or "2"
      const cpuCount = parseInt(config.resources.cpu, 10)
      if (!isNaN(cpuCount) && cpuCount > 0) {
        guest.cpus = cpuCount
        guest.cpu_kind = cpuCount >= 2 ? 'performance' : 'shared'
      }
      // Parse memory string like "512mb" or "1gb"
      const memStr = config.resources.memory.toLowerCase()
      if (memStr.endsWith('gb')) {
        guest.memory_mb = parseFloat(memStr) * 1024
      } else if (memStr.endsWith('mb')) {
        guest.memory_mb = parseFloat(memStr)
      }
    }

    return guest
  }

  private async waitForMachineState(
    appName: string,
    machineId: string,
    targetState: string
  ): Promise<void> {
    for (let attempt = 0; attempt < MACHINE_POLL_MAX_ATTEMPTS; attempt++) {
      const machine = await flyFetch<FlyMachine>(
        `/apps/${appName}/machines/${machineId}`
      )
      if (machine.state === targetState) {
        logger.info('fly: machine reached target state', {
          machineId,
          state: targetState,
          attempts: attempt + 1,
        })
        return
      }
      if (machine.state === 'failed' || machine.state === 'destroyed') {
        throw new Error(
          `Machine ${machineId} entered terminal state: ${machine.state}`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, MACHINE_POLL_INTERVAL_MS))
    }
    throw new Error(
      `Machine ${machineId} did not reach state '${targetState}' within ${MACHINE_POLL_MAX_ATTEMPTS * MACHINE_POLL_INTERVAL_MS / 1000}s`
    )
  }
}
