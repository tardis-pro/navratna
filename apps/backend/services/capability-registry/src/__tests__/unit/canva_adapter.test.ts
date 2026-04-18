import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CanvaAdapter } from '../../adapters/canva_adapter.js';
import { AuthenticationError } from '@uaip/utils';

const MOCK_TOKEN = { accessToken: 'test-access-token', refreshToken: 'test-refresh-token' };

const makeOkResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const makeErrorResponse = (status: number, statusText: string) =>
  new Response(null, { status, statusText });

describe('CanvaAdapter', () => {
  let adapter: CanvaAdapter;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.CANVA_CLIENT_ID = 'test-client-id';
    process.env.CANVA_CLIENT_SECRET = 'test-client-secret';
    process.env.CANVA_REDIRECT_URI = 'http://localhost:3002/api/v1/canva/oauth/callback';
    adapter = new CanvaAdapter();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CANVA_CLIENT_ID;
    delete process.env.CANVA_CLIENT_SECRET;
    delete process.env.CANVA_REDIRECT_URI;
  });

  describe('getAuthorizationUrl', () => {
    it('includes correct Canva auth URL and required query params', () => {
      const url = adapter.getAuthorizationUrl('random-state');
      expect(url).toContain('https://www.canva.com/api/oauth/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=');
      expect(url).toContain('design%3Acontent%3Awrite');
    });

    it('includes the provided state parameter', () => {
      const url = adapter.getAuthorizationUrl('my-state-123');
      expect(url).toContain('state=my-state-123');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('returns OAuthTokens on success', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          scope: 'design:content:read design:content:write',
        })
      );

      const tokens = await adapter.exchangeCodeForTokens('auth-code');

      expect(tokens.accessToken).toBe('new-access-token');
      expect(tokens.refreshToken).toBe('new-refresh-token');
      expect(tokens.expiresAt).toBeInstanceOf(Date);
      expect(tokens.scope).toEqual(['design:content:read', 'design:content:write']);
    });

    it('uses Basic auth header (not form params)', async () => {
      let capturedRequest: RequestInit | undefined;
      fetchSpy.mockImplementationOnce(async (_url, init) => {
        capturedRequest = init;
        return makeOkResponse({ access_token: 'tok', expires_in: 3600 });
      });

      await adapter.exchangeCodeForTokens('code');

      const headers = capturedRequest?.headers as Record<string, string>;
      expect(headers?.['Authorization']).toMatch(/^Basic /);
      const decoded = Buffer.from(headers['Authorization'].replace('Basic ', ''), 'base64').toString();
      expect(decoded).toBe('test-client-id:test-client-secret');
    });

    it('throws AuthenticationError on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(makeErrorResponse(401, 'Unauthorized'));

      await expect(adapter.exchangeCodeForTokens('bad-code')).rejects.toThrow(AuthenticationError);
    });
  });

  describe('refreshTokens', () => {
    it('returns updated tokens on success', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse({
          access_token: 'refreshed-token',
          refresh_token: 'new-refresh',
          expires_in: 7200,
        })
      );

      const tokens = await adapter.refreshTokens('old-refresh-token');

      expect(tokens.accessToken).toBe('refreshed-token');
      expect(tokens.refreshToken).toBe('new-refresh');
    });

    it('falls back to original refresh token if none returned', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse({ access_token: 'refreshed', expires_in: 3600 })
      );

      const tokens = await adapter.refreshTokens('original-refresh');

      expect(tokens.refreshToken).toBe('original-refresh');
    });

    it('uses grant_type=refresh_token in request body', async () => {
      let capturedBody: string | undefined;
      fetchSpy.mockImplementationOnce(async (_url, init) => {
        capturedBody = init?.body?.toString();
        return makeOkResponse({ access_token: 'tok', expires_in: 3600 });
      });

      await adapter.refreshTokens('rtoken');

      expect(capturedBody).toContain('grant_type=refresh_token');
      expect(capturedBody).toContain('refresh_token=rtoken');
    });

    it('throws AuthenticationError on failure', async () => {
      fetchSpy.mockResolvedValueOnce(makeErrorResponse(403, 'Forbidden'));

      await expect(adapter.refreshTokens('bad-token')).rejects.toThrow(AuthenticationError);
    });
  });

  describe('getMcpToolDefinitions', () => {
    it('returns all four Canva MCP tools', () => {
      const tools = adapter.getMcpToolDefinitions();
      const names = tools.map((t) => t.name);

      expect(names).toContain('canva_create_design');
      expect(names).toContain('canva_list_templates');
      expect(names).toContain('canva_export_design');
      expect(names).toContain('canva_update_brand_kit');
    });

    it('each tool has name, description, and inputSchema', () => {
      const tools = adapter.getMcpToolDefinitions();
      for (const tool of tools) {
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });

    it('canva_create_design schema requires template_id', () => {
      const tools = adapter.getMcpToolDefinitions();
      const createDesign = tools.find((t) => t.name === 'canva_create_design');
      expect(createDesign?.inputSchema.required).toContain('template_id');
    });

    it('canva_export_design schema requires design_id and format', () => {
      const tools = adapter.getMcpToolDefinitions();
      const exportDesign = tools.find((t) => t.name === 'canva_export_design');
      expect(exportDesign?.inputSchema.required).toContain('design_id');
      expect(exportDesign?.inputSchema.required).toContain('format');
    });
  });

  describe('executeOperation — canva_create_design', () => {
    it('calls POST /designs and returns design_id + edit_url', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse({
          design: {
            id: 'design-xyz',
            title: 'My Design',
            urls: { edit_url: 'https://www.canva.com/design/design-xyz/edit' },
            created_at: '2026-04-18T00:00:00Z',
          },
        })
      );

      const result = await adapter.executeOperation(
        'canva_create_design',
        { template_id: 'tmpl-001', title: 'My Design' },
        MOCK_TOKEN
      );

      expect(result).toMatchObject({
        design_id: 'design-xyz',
        edit_url: 'https://www.canva.com/design/design-xyz/edit',
        title: 'My Design',
      });
    });

    it('throws NotFoundError when template_id is missing', async () => {
      await expect(
        adapter.executeOperation('canva_create_design', {}, MOCK_TOKEN)
      ).rejects.toThrow();
    });
  });

  describe('executeOperation — canva_list_templates', () => {
    it('returns template list with pagination cursor', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse({
          items: [
            {
              id: 'tmpl-001',
              title: 'Landing Page',
              urls: { edit_url: 'https://www.canva.com/design/tmpl-001/edit' },
              thumbnail: { url: 'https://thumbnail.url/tmpl-001.png' },
              type: 'landing_page',
            },
          ],
          continuation: 'cursor-next',
        })
      );

      const result = await adapter.executeOperation(
        'canva_list_templates',
        { category: 'landing_page', limit: 1 },
        MOCK_TOKEN
      );

      const typed = result as { templates: unknown[]; continuation: string };
      expect(typed.templates).toHaveLength(1);
      expect(typed.continuation).toBe('cursor-next');
    });
  });

  describe('executeOperation — canva_export_design', () => {
    it('initiates export job and polls for result', async () => {
      fetchSpy
        .mockResolvedValueOnce(makeOkResponse({ job: { id: 'job-123', status: 'PROCESSING' } }))
        .mockResolvedValueOnce(
          makeOkResponse({
            job: {
              id: 'job-123',
              status: 'SUCCESS',
              urls: ['https://cdn.canva.com/export/design.png'],
            },
          })
        );

      const result = await adapter.executeOperation(
        'canva_export_design',
        { design_id: 'design-abc', format: 'png' },
        MOCK_TOKEN
      );

      const typed = result as { export_url: string; format: string; design_id: string };
      expect(typed.export_url).toBe('https://cdn.canva.com/export/design.png');
      expect(typed.format).toBe('png');
      expect(typed.design_id).toBe('design-abc');
    });

    it('rejects unsupported export format', async () => {
      await expect(
        adapter.executeOperation(
          'canva_export_design',
          { design_id: 'design-abc', format: 'gif' },
          MOCK_TOKEN
        )
      ).rejects.toThrow();
    });
  });

  describe('executeOperation — canva_update_brand_kit', () => {
    it('posts brand kit data and returns brand_kit_id', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse({
          brand_kit: {
            id: 'bk-001',
            name: 'ACME Brand',
            updated_at: '2026-04-18T00:00:00Z',
          },
        })
      );

      const result = await adapter.executeOperation(
        'canva_update_brand_kit',
        {
          brand_kit_data: {
            name: 'ACME Brand',
            colors: [{ name: 'Primary', color: '#FF0000' }],
          },
        },
        MOCK_TOKEN
      );

      const typed = result as { brand_kit_id: string; name: string };
      expect(typed.brand_kit_id).toBe('bk-001');
      expect(typed.name).toBe('ACME Brand');
    });
  });
});
