// Onboarding Routes — Elysia HTTP endpoints for stack detection and config generation
// POST /api/v1/onboard/detect     — detect stack from a repo URL
// POST /api/v1/onboard/generate   — generate deploy configs from a StackProfile
// POST /api/v1/onboard/full       — detect + generate in one call

import { Elysia } from 'elysia'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { logger } from '@uaip/utils'
import type {
  StackProfile,
  DeployPlatform,
  OnboardingDetectRequest,
  OnboardingGenerateRequest,
  OnboardingFullRequest,
} from '@uaip/types'
import { StackDetector } from './stack_detector.js'
import { ConfigGenerator } from './config_generator.js'

const stackDetector = new StackDetector()
const configGenerator = new ConfigGenerator()

function isValidRepoUrl(url: string): boolean {
  // Accept git SSH, HTTPS, or restricted local paths (tmp only)
  if (/^(https?:\/\/|git@|ssh:\/\/)/.test(url)) return true
  if (url.startsWith('/tmp/') && existsSync(url)) return true
  return false
}

function isValidSubdomain(subdomain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)
}

function isValidPlatform(platform: string): platform is DeployPlatform {
  return ['fly', 'cloudflare-workers', 'cloudflare-pages'].includes(platform)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

async function cloneToTemp(repoUrl: string): Promise<string> {
  const tempDir = join(tmpdir(), `tardis-onboard-${randomUUID()}`)
  mkdirSync(tempDir, { recursive: true })

  logger.info('Cloning repo for stack detection', { repoUrl, tempDir })

  try {
    execSync(`git clone --depth 1 ${shellQuote(repoUrl)} ${shellQuote(tempDir)}`, {
      timeout: 60_000,
      stdio: 'pipe',
    })
    return tempDir
  } catch (error) {
    // Clean up on failure
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to clone repository: ${message}`)
  }
}

function cleanupTemp(tempDir: string): void {
  try {
    rmSync(tempDir, { recursive: true, force: true })
    logger.debug('Cleaned up temp directory', { tempDir })
  } catch (error) {
    logger.warn('Failed to clean up temp directory', { tempDir, error })
  }
}

function extractBody<T>(body: unknown): T {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Request body must be a JSON object')
  }
  return body as T
}

export function registerOnboardingRoutes() {
  return new Elysia().group('/api/v1/onboard', (group) =>
    group
      // POST /api/v1/onboard/detect — clone repo, detect stack, return StackProfile
      .post('/detect', async (ctx) => {
        try {
          const { repoUrl } = extractBody<OnboardingDetectRequest>(ctx.body)

          if (!repoUrl || typeof repoUrl !== 'string') {
            ctx.set.status = 400
            return { success: false, error: 'repoUrl is required and must be a string' }
          }

          if (!isValidRepoUrl(repoUrl)) {
            ctx.set.status = 400
            return { success: false, error: 'Invalid repository URL or path' }
          }

          let repoPath: string
          let isTemp = false

          // If it's a local path, use it directly; otherwise clone
          if (repoUrl.startsWith('/') && existsSync(repoUrl)) {
            repoPath = repoUrl
          } else {
            repoPath = await cloneToTemp(repoUrl)
            isTemp = true
          }

          try {
            const stackProfile = await stackDetector.detect(repoPath)
            return { success: true, data: stackProfile }
          } finally {
            if (isTemp) cleanupTemp(repoPath)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Stack detection failed'
          logger.error('Onboard detect failed', { error: message })
          ctx.set.status = 500
          return { success: false, error: message }
        }
      })

      // POST /api/v1/onboard/generate — generate configs from a StackProfile
      .post('/generate', async (ctx) => {
        try {
          const { stackProfile, platform, subdomain } =
            extractBody<OnboardingGenerateRequest>(ctx.body)

          if (!stackProfile || typeof stackProfile !== 'object') {
            ctx.set.status = 400
            return { success: false, error: 'stackProfile is required' }
          }

          if (!platform || !isValidPlatform(platform)) {
            ctx.set.status = 400
            return {
              success: false,
              error: 'platform must be one of: fly, cloudflare-workers, cloudflare-pages',
            }
          }

          if (!subdomain || !isValidSubdomain(subdomain)) {
            ctx.set.status = 400
            return {
              success: false,
              error: 'subdomain is required and must be a valid DNS-safe name (lowercase alphanumeric and hyphens)',
            }
          }

          const configs = configGenerator.generate(
            stackProfile as StackProfile,
            platform,
            subdomain
          )
          return { success: true, data: configs }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Config generation failed'
          logger.error('Onboard generate failed', { error: message })
          ctx.set.status = 500
          return { success: false, error: message }
        }
      })

      // POST /api/v1/onboard/full — detect + generate in one call
      .post('/full', async (ctx) => {
        try {
          const { repoUrl, platform, subdomain } =
            extractBody<OnboardingFullRequest>(ctx.body)

          if (!repoUrl || typeof repoUrl !== 'string') {
            ctx.set.status = 400
            return { success: false, error: 'repoUrl is required and must be a string' }
          }

          if (!isValidRepoUrl(repoUrl)) {
            ctx.set.status = 400
            return { success: false, error: 'Invalid repository URL or path' }
          }

          if (!platform || !isValidPlatform(platform)) {
            ctx.set.status = 400
            return {
              success: false,
              error: 'platform must be one of: fly, cloudflare-workers, cloudflare-pages',
            }
          }

          if (!subdomain || !isValidSubdomain(subdomain)) {
            ctx.set.status = 400
            return {
              success: false,
              error: 'subdomain is required and must be a valid DNS-safe name',
            }
          }

          let repoPath: string
          let isTemp = false

          if (repoUrl.startsWith('/') && existsSync(repoUrl)) {
            repoPath = repoUrl
          } else {
            repoPath = await cloneToTemp(repoUrl)
            isTemp = true
          }

          try {
            const stackProfile = await stackDetector.detect(repoPath)
            const configs = configGenerator.generate(stackProfile, platform, subdomain)
            return { success: true, data: configs }
          } finally {
            if (isTemp) cleanupTemp(repoPath)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Full onboarding failed'
          logger.error('Onboard full failed', { error: message })
          ctx.set.status = 500
          return { success: false, error: message }
        }
      })
  )
}
