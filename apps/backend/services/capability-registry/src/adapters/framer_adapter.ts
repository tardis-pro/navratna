import { logger } from '@uaip/utils'
import { BaseOAuthAdapter, type OAuthConfig, type OAuthTokens, type ToolOperation } from './base_oauth_adapter.js'
import type {
  FramerAdapterConfig,
  FramerProject,
  FramerComponent,
  FramerStyleTokens,
  FramerPrototypeRequest,
  FramerPrototypeResult,
} from '@uaip/types'

const FRAMER_API_BASE = 'https://api.framer.com/v1'

export class FramerAdapter extends BaseOAuthAdapter {
  private readonly teamId?: string

  constructor(adapterConfig: FramerAdapterConfig) {
    const oauthConfig: OAuthConfig = {
      clientId: process.env.FRAMER_CLIENT_ID ?? '',
      clientSecret: process.env.FRAMER_CLIENT_SECRET ?? '',
      redirectUri: `${process.env.APP_BASE_URL ?? 'http://localhost:3002'}/api/v1/oauth/framer/callback`,
      scope: ['projects:read', 'projects:write', 'components:read', 'components:write'],
      authUrl: 'https://framer.com/api/oauth/authorize',
      tokenUrl: 'https://framer.com/api/oauth/token',
      apiBaseUrl: FRAMER_API_BASE,
    }
    super(oauthConfig)
    this.teamId = adapterConfig.teamId
  }

  protected setupOperations(): void {
    this.operations.set('framer_create_project', {
      id: 'framer_create_project',
      name: 'Create Framer Project',
      description: 'Creates a new Framer project',
      parameters: { name: 'string', description: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const { name, description } = params as { name: string; description: string }
        return this.createProject(name, description, tokens)
      },
    })

    this.operations.set('framer_generate_component', {
      id: 'framer_generate_component',
      name: 'Generate Framer Component',
      description: 'Generates a component from description and style tokens',
      parameters: { projectId: 'string', name: 'string', description: 'string', styleTokens: 'object' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const { projectId, name, description, styleTokens } = params as {
          projectId: string
          name: string
          description: string
          styleTokens?: FramerStyleTokens
        }
        return this.generateComponent(projectId, name, description, styleTokens, tokens)
      },
    })

    this.operations.set('framer_publish', {
      id: 'framer_publish',
      name: 'Publish Framer Project',
      description: 'Publishes a Framer project',
      parameters: { projectId: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const { projectId } = params as { projectId: string }
        return this.publishProject(projectId, tokens)
      },
    })

    this.operations.set('framer_get_preview_url', {
      id: 'framer_get_preview_url',
      name: 'Get Preview URL',
      description: 'Gets the preview URL for a Framer project',
      parameters: { projectId: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const { projectId } = params as { projectId: string }
        return this.getProject(projectId, tokens)
      },
    })
  }

  // ─── Project operations ────────────────────────────────────────────────

  private async createProject(
    name: string,
    description: string,
    tokens: OAuthTokens
  ): Promise<FramerProject> {
    const response = await this.makeApiRequest(
      `${FRAMER_API_BASE}/projects`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, teamId: this.teamId }),
      },
      tokens
    )
    return (await response.json()) as FramerProject
  }

  private async getProject(projectId: string, tokens: OAuthTokens): Promise<FramerProject> {
    const response = await this.makeApiRequest(
      `${FRAMER_API_BASE}/projects/${projectId}`,
      { method: 'GET' },
      tokens
    )
    return (await response.json()) as FramerProject
  }

  private async generateComponent(
    projectId: string,
    name: string,
    description: string,
    styleTokens: FramerStyleTokens | undefined,
    tokens: OAuthTokens
  ): Promise<FramerComponent> {
    const response = await this.makeApiRequest(
      `${FRAMER_API_BASE}/projects/${projectId}/components/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, styleTokens }),
      },
      tokens
    )
    return (await response.json()) as FramerComponent
  }

  private async publishProject(
    projectId: string,
    tokens: OAuthTokens
  ): Promise<{ publishedUrl: string }> {
    const response = await this.makeApiRequest(
      `${FRAMER_API_BASE}/projects/${projectId}/publish`,
      { method: 'POST' },
      tokens
    )
    return (await response.json()) as { publishedUrl: string }
  }

  // ─── Prototype generation orchestration ────────────────────────────────

  async generatePrototype(
    request: FramerPrototypeRequest,
    tokens: OAuthTokens
  ): Promise<FramerPrototypeResult> {
    const startTime = Date.now()

    try {
      const project = await this.createProject(request.name, request.description, tokens)
      logger.info('Framer project created for prototype', { projectId: project.id })

      const components: FramerComponent[] = []
      for (const spec of request.components) {
        const component = await this.generateComponent(
          project.id,
          spec.name,
          spec.description,
          request.styleTokens,
          tokens
        )
        components.push(component)
      }

      const publishResult = await this.publishProject(project.id, tokens)

      logger.info('Framer prototype generated', {
        projectId: project.id,
        componentCount: components.length,
        durationMs: Date.now() - startTime,
      })

      return {
        projectId: project.id,
        previewUrl: project.previewUrl ?? publishResult.publishedUrl,
        publishedUrl: publishResult.publishedUrl,
        components,
        generatedAt: new Date().toISOString(),
        status: 'ready',
      }
    } catch (error) {
      logger.error('Framer prototype generation failed', {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      })

      return {
        projectId: '',
        previewUrl: '',
        components: [],
        generatedAt: new Date().toISOString(),
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  extractStyleTokensFromTailwind(tailwindConfig: Record<string, unknown>): FramerStyleTokens {
    const theme = (tailwindConfig.theme ?? {}) as Record<string, unknown>
    const extend = (theme.extend ?? {}) as Record<string, unknown>
    const colors = (extend.colors ?? theme.colors ?? {}) as Record<string, string>
    const fontFamily = (extend.fontFamily ?? theme.fontFamily ?? {}) as Record<string, string[]>
    const spacing = (extend.spacing ?? theme.spacing ?? {}) as Record<string, string>
    const borderRadius = (extend.borderRadius ?? theme.borderRadius ?? {}) as Record<string, string>

    const flatColors: Record<string, string> = {}
    for (const [key, value] of Object.entries(colors)) {
      if (typeof value === 'string') {
        flatColors[key] = value
      }
    }

    const primaryFont = Object.values(fontFamily)[0]

    return {
      colors: flatColors,
      fontFamily: Array.isArray(primaryFont) ? primaryFont[0] : undefined,
      fontSize: undefined,
      spacing: typeof spacing === 'object' ? spacing : undefined,
      borderRadius: typeof borderRadius === 'object' ? borderRadius : undefined,
    }
  }
}
