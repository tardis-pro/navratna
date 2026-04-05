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

function toRecord(v: unknown): Record<string, unknown> {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    // @ts-expect-error -- structural narrowing: object is Record<string, unknown> after null/array checks
    return v
  }
  return {}
}

function isFramerStyleTokens(v: unknown): v is FramerStyleTokens {
  const r = toRecord(v)
  return typeof r.colors === 'object' && r.colors !== null
}

function mapToFramerProject(data: Record<string, unknown>): FramerProject {
  return {
    id: typeof data.id === 'string' ? data.id : '',
    name: typeof data.name === 'string' ? data.name : '',
    url: typeof data.url === 'string' ? data.url : '',
    previewUrl: typeof data.previewUrl === 'string' ? data.previewUrl : undefined,
    publishedUrl: typeof data.publishedUrl === 'string' ? data.publishedUrl : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
  }
}

function mapToFramerComponent(data: Record<string, unknown>): FramerComponent {
  return {
    id: typeof data.id === 'string' ? data.id : '',
    projectId: typeof data.projectId === 'string' ? data.projectId : '',
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    styleTokens: isFramerStyleTokens(data.styleTokens) ? data.styleTokens : undefined,
  }
}

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
        const p = toRecord(params)
        const name = typeof p.name === 'string' ? p.name : ''
        const description = typeof p.description === 'string' ? p.description : ''
        return this.createProject(name, description, tokens)
      },
    })

    this.operations.set('framer_generate_component', {
      id: 'framer_generate_component',
      name: 'Generate Framer Component',
      description: 'Generates a component from description and style tokens',
      parameters: { projectId: 'string', name: 'string', description: 'string', styleTokens: 'object' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = toRecord(params)
        const projectId = typeof p.projectId === 'string' ? p.projectId : ''
        const name = typeof p.name === 'string' ? p.name : ''
        const description = typeof p.description === 'string' ? p.description : ''
        const styleTokens = isFramerStyleTokens(p.styleTokens) ? p.styleTokens : undefined
        return this.generateComponent(projectId, name, description, styleTokens, tokens)
      },
    })

    this.operations.set('framer_publish', {
      id: 'framer_publish',
      name: 'Publish Framer Project',
      description: 'Publishes a Framer project',
      parameters: { projectId: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = toRecord(params)
        const projectId = typeof p.projectId === 'string' ? p.projectId : ''
        return this.publishProject(projectId, tokens)
      },
    })

    this.operations.set('framer_get_preview_url', {
      id: 'framer_get_preview_url',
      name: 'Get Preview URL',
      description: 'Gets the preview URL for a Framer project',
      parameters: { projectId: 'string' },
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = toRecord(params)
        const projectId = typeof p.projectId === 'string' ? p.projectId : ''
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
    const projectData = toRecord(await response.json())
    return mapToFramerProject(projectData)
  }

  private async getProject(projectId: string, tokens: OAuthTokens): Promise<FramerProject> {
    const response = await this.makeApiRequest(
      `${FRAMER_API_BASE}/projects/${projectId}`,
      { method: 'GET' },
      tokens
    )
    const projectData = toRecord(await response.json())
    return mapToFramerProject(projectData)
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
    const componentData = toRecord(await response.json())
    return mapToFramerComponent(componentData)
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
    const data = toRecord(await response.json())
    return { publishedUrl: typeof data.publishedUrl === 'string' ? data.publishedUrl : '' }
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
    const theme = toRecord(tailwindConfig.theme)
    const extend = toRecord(theme.extend)
    const colorsRaw = toRecord(extend.colors ?? theme.colors)
    const fontFamilyRaw = toRecord(extend.fontFamily ?? theme.fontFamily)
    const spacingRaw = toRecord(extend.spacing ?? theme.spacing)
    const borderRadiusRaw = toRecord(extend.borderRadius ?? theme.borderRadius)

    const colors: Record<string, string> = {}
    for (const [k, v] of Object.entries(colorsRaw)) {
      if (typeof v === 'string') colors[k] = v
    }
    const fontFamily: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(fontFamilyRaw)) {
      if (Array.isArray(v)) fontFamily[k] = v.filter((s): s is string => typeof s === 'string')
    }
    const spacing: Record<string, string> = {}
    for (const [k, v] of Object.entries(spacingRaw)) {
      if (typeof v === 'string') spacing[k] = v
    }
    const borderRadius: Record<string, string> = {}
    for (const [k, v] of Object.entries(borderRadiusRaw)) {
      if (typeof v === 'string') borderRadius[k] = v
    }

    const primaryFont = Object.values(fontFamily)[0]

    return {
      colors,
      fontFamily: Array.isArray(primaryFont) ? primaryFont[0] : undefined,
      fontSize: undefined,
      spacing: Object.keys(spacing).length > 0 ? spacing : undefined,
      borderRadius: Object.keys(borderRadius).length > 0 ? borderRadius : undefined,
    }
  }
}
