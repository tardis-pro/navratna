import { logger, AuthenticationError, ExternalServiceError, NotFoundError } from '@uaip/utils';
import { BaseOAuthAdapter, type OAuthConfig, type OAuthTokens } from './base_oauth_adapter.js';
import type { CanvaAdapterConfig } from '@uaip/types';

const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = 'https://www.canva.com/api/oauth/token';
const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

const CANVA_DEFAULT_SCOPES = [
  'design:meta:read',
  'design:content:read',
  'design:content:write',
  'asset:read',
  'asset:write',
  'brandtemplate:content:read',
  'brandtemplate:meta:read',
];

const createDesignSchema = {
  type: 'object',
  required: ['template_id'],
  properties: {
    template_id: {
      type: 'string',
      description: 'Canva template ID to base the new design on',
    },
    content_json: {
      type: 'object',
      description: 'Optional structured content to inject into the design',
    },
    title: {
      type: 'string',
      description: 'Optional title for the new design',
    },
  },
} as const;

const listTemplatesSchema = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      description: 'Template category filter (e.g. "social_media", "presentation", "marketing")',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of templates to return (default 20)',
    },
    continuation: {
      type: 'string',
      description: 'Pagination cursor from a previous response',
    },
  },
} as const;

const exportDesignSchema = {
  type: 'object',
  required: ['design_id', 'format'],
  properties: {
    design_id: {
      type: 'string',
      description: 'Canva design ID to export',
    },
    format: {
      type: 'string',
      enum: ['png', 'pdf', 'mp4'],
      description: 'Export format: "png" | "pdf" | "mp4"',
    },
    pages: {
      type: 'array',
      items: { type: 'number' },
      description: 'Optional page indices to export (1-indexed); defaults to all pages',
    },
  },
} as const;

const updateBrandKitSchema = {
  type: 'object',
  required: ['brand_kit_data'],
  properties: {
    brand_kit_data: {
      type: 'object',
      description: 'Brand kit payload (name, colors, fonts, logos)',
      properties: {
        name: { type: 'string' },
        colors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              color: { type: 'string', description: 'Hex color code' },
            },
          },
        },
        fonts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

interface CanvaDesignResult {
  design_id: string;
  edit_url: string;
  title: string;
  created_at: string;
}

interface CanvaTemplate {
  id: string;
  title: string;
  thumbnail_url: string;
  edit_url: string;
  category: string;
}

interface CanvaTemplateListResult {
  templates: CanvaTemplate[];
  continuation?: string;
}

interface CanvaExportResult {
  export_url: string;
  format: string;
  design_id: string;
  expires_at: string;
}

interface CanvaBrandKitResult {
  brand_kit_id: string;
  name: string;
  updated_at: string;
}

interface CreateDesignParams {
  template_id: string;
  content_json?: Record<string, unknown>;
  title?: string;
}

interface ListTemplatesParams {
  category?: string;
  limit?: number;
  continuation?: string;
}

interface ExportDesignParams {
  design_id: string;
  format: 'png' | 'pdf' | 'mp4';
  pages?: number[];
}

interface UpdateBrandKitParams {
  brand_kit_data: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertRecord(v: unknown, label: string): Record<string, unknown> {
  if (!isRecord(v)) throw new Error(`${label} must be an object`);
  return v;
}

export class CanvaAdapter extends BaseOAuthAdapter {
  constructor(_adapterConfig?: CanvaAdapterConfig) {
    const oauthConfig: OAuthConfig = {
      clientId: process.env.CANVA_CLIENT_ID ?? '',
      clientSecret: process.env.CANVA_CLIENT_SECRET ?? '',
      redirectUri:
        process.env.CANVA_REDIRECT_URI ??
        `${process.env.APP_BASE_URL ?? 'http://localhost:3002'}/api/v1/canva/oauth/callback`,
      scope: CANVA_DEFAULT_SCOPES,
      authUrl: CANVA_AUTH_URL,
      tokenUrl: CANVA_TOKEN_URL,
      apiBaseUrl: CANVA_API_BASE,
    };
    super(oauthConfig);
  }

  protected setupOperations(): void {
    this.operations.set('canva_create_design', {
      id: 'canva_create_design',
      name: 'canva_create_design',
      description:
        'Create a new Canva design from a template with optional injected content. Returns the design ID and edit URL.',
      parameters: createDesignSchema,
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = assertRecord(params, 'canva_create_design params') as unknown as CreateDesignParams;
        return this.createDesign(p, tokens);
      },
    });

    this.operations.set('canva_list_templates', {
      id: 'canva_list_templates',
      name: 'canva_list_templates',
      description:
        'List available Canva templates, optionally filtered by category. Returns template metadata including IDs and thumbnail URLs.',
      parameters: listTemplatesSchema,
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = (isRecord(params) ? params : {}) as ListTemplatesParams;
        return this.listTemplates(p, tokens);
      },
    });

    this.operations.set('canva_export_design', {
      id: 'canva_export_design',
      name: 'canva_export_design',
      description:
        'Export a Canva design to PNG, PDF, or MP4. Returns a time-limited download URL for the exported asset.',
      parameters: exportDesignSchema,
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = assertRecord(params, 'canva_export_design params') as unknown as ExportDesignParams;
        return this.exportDesign(p, tokens);
      },
    });

    this.operations.set('canva_update_brand_kit', {
      id: 'canva_update_brand_kit',
      name: 'canva_update_brand_kit',
      description:
        'Create or update a Canva Brand Kit with colors, fonts, and logos. Returns the brand kit ID.',
      parameters: updateBrandKitSchema,
      execute: async (params: unknown, tokens: OAuthTokens) => {
        const p = assertRecord(params, 'canva_update_brand_kit params') as unknown as UpdateBrandKitParams;
        return this.updateBrandKit(p, tokens);
      },
    });
  }

  private async createDesign(
    params: CreateDesignParams,
    tokens: OAuthTokens
  ): Promise<CanvaDesignResult> {
    if (!params.template_id) {
      throw new NotFoundError('template_id is required for canva_create_design');
    }

    const body: Record<string, unknown> = {
      asset_type: 'TEMPLATE',
      asset_id: params.template_id,
    };
    if (params.title) {
      body.title = params.title;
    }
    if (params.content_json) {
      body.content = params.content_json;
    }

    const response = await this.makeApiRequest(
      `${CANVA_API_BASE}/designs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      tokens
    );

    const data = await response.json();
    const design = isRecord(data) && isRecord(data.design) ? data.design : data;

    logger.info('Canva design created', {
      designId: design.id,
      templateId: params.template_id,
    });

    return {
      design_id: typeof design.id === 'string' ? design.id : String(design.id ?? ''),
      edit_url: typeof design.urls?.edit_url === 'string' ? design.urls.edit_url : '',
      title: typeof design.title === 'string' ? design.title : (params.title ?? ''),
      created_at: typeof design.created_at === 'string' ? design.created_at : new Date().toISOString(),
    };
  }

  private async listTemplates(
    params: ListTemplatesParams,
    tokens: OAuthTokens
  ): Promise<CanvaTemplateListResult> {
    const query = new URLSearchParams();
    if (params.category) query.set('query', params.category);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.continuation) query.set('continuation', params.continuation);

    const url = `${CANVA_API_BASE}/autofill/datasets?${query.toString()}`;

    const templateUrl = params.category
      ? `${CANVA_API_BASE}/designs?owner=market&type=${encodeURIComponent(params.category)}&limit=${params.limit ?? 20}`
      : `${CANVA_API_BASE}/designs?owner=market&limit=${params.limit ?? 20}`;

    let response: Response;
    try {
      response = await this.makeApiRequest(url, { method: 'GET' }, tokens);
    } catch {
      response = await this.makeApiRequest(templateUrl, { method: 'GET' }, tokens);
    }

    const data = await response.json();
    const items: unknown[] = Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.designs)
        ? data.designs
        : [];

    const templates: CanvaTemplate[] = items.map((item) => {
      const t = isRecord(item) ? item : {};
      const urls = isRecord(t.urls) ? t.urls : {};
      const thumbnail = isRecord(t.thumbnail) ? t.thumbnail : {};
      return {
        id: typeof t.id === 'string' ? t.id : '',
        title: typeof t.title === 'string' ? t.title : '',
        thumbnail_url: typeof thumbnail.url === 'string' ? thumbnail.url : '',
        edit_url: typeof urls.edit_url === 'string' ? urls.edit_url : '',
        category: typeof t.type === 'string' ? t.type : (params.category ?? ''),
      };
    });

    logger.info('Canva templates listed', { count: templates.length, category: params.category });

    return {
      templates,
      continuation:
        typeof data.continuation === 'string' ? data.continuation : undefined,
    };
  }

  private async exportDesign(
    params: ExportDesignParams,
    tokens: OAuthTokens
  ): Promise<CanvaExportResult> {
    if (!params.design_id) {
      throw new NotFoundError('design_id is required for canva_export_design');
    }
    if (!['png', 'pdf', 'mp4'].includes(params.format)) {
      throw new ExternalServiceError(`Unsupported export format: ${params.format}`);
    }

    const body: Record<string, unknown> = {
      format: params.format.toUpperCase(),
    };
    if (params.pages && params.pages.length > 0) {
      body.pages = params.pages;
    }

    const startResponse = await this.makeApiRequest(
      `${CANVA_API_BASE}/designs/${params.design_id}/exports`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      tokens
    );

    const startData = await startResponse.json();
    const startRecord = isRecord(startData) ? startData : {};
    const startJob = isRecord(startRecord.job) ? startRecord.job : {};
    const jobId =
      typeof startJob.id === 'string'
        ? startJob.id
        : typeof startRecord.id === 'string'
          ? startRecord.id
          : '';

    if (!jobId) {
      throw new ExternalServiceError('Canva export did not return a job ID');
    }

    const exportUrl = await this.pollExportJob(params.design_id, jobId, tokens);

    logger.info('Canva design exported', {
      designId: params.design_id,
      format: params.format,
      exportUrl,
    });

    return {
      export_url: exportUrl,
      format: params.format,
      design_id: params.design_id,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  private async pollExportJob(
    designId: string,
    jobId: string,
    tokens: OAuthTokens,
    maxAttempts = 10
  ): Promise<string> {
    const pollUrl = `${CANVA_API_BASE}/designs/${designId}/exports/${jobId}`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await this.makeApiRequest(pollUrl, { method: 'GET' }, tokens);
      const data = await response.json();
      const job = isRecord(data) && isRecord(data.job) ? data.job : isRecord(data) ? data : {};

      const status = typeof job.status === 'string' ? job.status : '';

      if (status === 'SUCCESS' || status === 'COMPLETE') {
        const urls: unknown[] = Array.isArray(job.urls) ? job.urls : [];
        const firstUrl = urls.find((u) => typeof u === 'string');
        if (typeof firstUrl === 'string') return firstUrl;
        const urlObj = isRecord(job.url) ? job.url : {};
        if (typeof urlObj.url === 'string') return urlObj.url;
        if (typeof job.export_url === 'string') return job.export_url;
        throw new ExternalServiceError('Canva export succeeded but no URL returned');
      }

      if (status === 'FAILED' || status === 'ERROR') {
        throw new ExternalServiceError(
          `Canva export job failed: ${typeof job.error === 'string' ? job.error : 'unknown'}`
        );
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 3000));
    }

    throw new ExternalServiceError('Canva export job timed out after polling');
  }

  private async updateBrandKit(
    params: UpdateBrandKitParams,
    tokens: OAuthTokens
  ): Promise<CanvaBrandKitResult> {
    const response = await this.makeApiRequest(
      `${CANVA_API_BASE}/brand-kits`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params.brand_kit_data),
      },
      tokens
    );

    const data = await response.json();
    const brandKit =
      isRecord(data) && isRecord(data.brand_kit) ? data.brand_kit : isRecord(data) ? data : {};

    logger.info('Canva brand kit updated', { brandKitId: brandKit.id });

    return {
      brand_kit_id: typeof brandKit.id === 'string' ? brandKit.id : '',
      name: typeof brandKit.name === 'string' ? brandKit.name : '',
      updated_at:
        typeof brandKit.updated_at === 'string' ? brandKit.updated_at : new Date().toISOString(),
    };
  }

  override async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const credentials = btoa(`${this.config.clientId}:${this.config.clientSecret}`);

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
        code_verifier: '',
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '<unreadable>');
      logger.error('Canva token exchange failed', { status: response.status, body });
      throw new AuthenticationError(`Canva token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: typeof data.access_token === 'string' ? data.access_token : '',
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
      expiresAt: typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      scope: typeof data.scope === 'string' ? data.scope.split(' ') : this.config.scope,
    };
  }

  override async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const credentials = btoa(`${this.config.clientId}:${this.config.clientSecret}`);

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '<unreadable>');
      logger.error('Canva token refresh failed', { status: response.status, body });
      throw new AuthenticationError(`Canva token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      accessToken: typeof data.access_token === 'string' ? data.access_token : '',
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : refreshToken,
      expiresAt: typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      scope: typeof data.scope === 'string' ? data.scope.split(' ') : this.config.scope,
    };
  }

  getMcpToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return Array.from(this.operations.values()).map((op) => ({
      name: op.name,
      description: op.description,
      inputSchema: op.parameters as Record<string, unknown>,
    }));
  }
}

export default CanvaAdapter;
