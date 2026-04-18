import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { withRequiredAuth } from '@uaip/middleware';
import { CanvaAdapter } from '../adapters/canva_adapter.js';

const ExportFormatSchema = z.enum(['png', 'pdf', 'mp4']);

const CreateDesignBodySchema = z.object({
  template_id: z.string().min(1),
  content_json: z.record(z.unknown()).optional(),
  title: z.string().optional(),
});

const ListTemplatesQuerySchema = z.object({
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  continuation: z.string().optional(),
});

const ExportDesignBodySchema = z.object({
  design_id: z.string().min(1),
  format: ExportFormatSchema,
  pages: z.array(z.number().int().min(1)).optional(),
});

const UpdateBrandKitBodySchema = z.object({
  brand_kit_data: z.record(z.unknown()),
});

const OAuthCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

let adapterSingleton: CanvaAdapter | null = null;

function getAdapter(): CanvaAdapter {
  if (!adapterSingleton) adapterSingleton = new CanvaAdapter();
  return adapterSingleton;
}

function getTokensFromContext(context: Record<string, unknown>) {
  const headers = context.headers as Record<string, string> | undefined;
  const bearer = headers?.['x-canva-access-token'];
  if (!bearer || typeof bearer !== 'string') return null;
  return { accessToken: bearer };
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerCanvaRoutes() {
  return new Elysia().group('/api/v1/canva', (app) =>
    withRequiredAuth(app)
      .get('/oauth/authorize', (ctx) => {
        try {
          const adapter = getAdapter();
          const url = adapter.getAuthorizationUrl();
          logger.info('Canva OAuth authorize URL generated');
          return { success: true, url };
        } catch (err) {
          logger.error('Canva authorize failed', { error: getErrorMessage(err) });
          ctx.set.status = 500;
          return { success: false, error: 'Failed to generate Canva authorization URL' };
        }
      })

      .get('/oauth/callback', async (ctx) => {
        try {
          const query = OAuthCallbackQuerySchema.parse(ctx.query);
          const adapter = getAdapter();
          const tokens = await adapter.exchangeCodeForTokens(query.code);
          logger.info('Canva OAuth callback handled', { hasRefreshToken: !!tokens.refreshToken });
          return {
            success: true,
            message: 'Canva OAuth connection established. Store tokens securely.',
            expires_at: tokens.expiresAt?.toISOString(),
            scope: tokens.scope,
          };
        } catch (err) {
          logger.error('Canva OAuth callback failed', { error: getErrorMessage(err) });
          ctx.set.status = 400;
          return { success: false, error: getErrorMessage(err) };
        }
      })

      .post('/tools/create-design', async (ctx) => {
        try {
          const body = CreateDesignBodySchema.parse(ctx.body);
          const tokens = getTokensFromContext(ctx as unknown as Record<string, unknown>);
          if (!tokens) {
            ctx.set.status = 401;
            return { success: false, error: 'Missing X-Canva-Access-Token header' };
          }
          const adapter = getAdapter();
          const result = await adapter.executeOperation('canva_create_design', body, tokens);
          return { success: true, data: result };
        } catch (err) {
          logger.error('canva_create_design failed', { error: getErrorMessage(err) });
          ctx.set.status = 422;
          return { success: false, error: getErrorMessage(err) };
        }
      })

      .get('/tools/list-templates', async (ctx) => {
        try {
          const query = ListTemplatesQuerySchema.parse(ctx.query);
          const tokens = getTokensFromContext(ctx as unknown as Record<string, unknown>);
          if (!tokens) {
            ctx.set.status = 401;
            return { success: false, error: 'Missing X-Canva-Access-Token header' };
          }
          const adapter = getAdapter();
          const result = await adapter.executeOperation('canva_list_templates', query, tokens);
          return { success: true, data: result };
        } catch (err) {
          logger.error('canva_list_templates failed', { error: getErrorMessage(err) });
          ctx.set.status = 422;
          return { success: false, error: getErrorMessage(err) };
        }
      })

      .post('/tools/export-design', async (ctx) => {
        try {
          const body = ExportDesignBodySchema.parse(ctx.body);
          const tokens = getTokensFromContext(ctx as unknown as Record<string, unknown>);
          if (!tokens) {
            ctx.set.status = 401;
            return { success: false, error: 'Missing X-Canva-Access-Token header' };
          }
          const adapter = getAdapter();
          const result = await adapter.executeOperation('canva_export_design', body, tokens);
          return { success: true, data: result };
        } catch (err) {
          logger.error('canva_export_design failed', { error: getErrorMessage(err) });
          ctx.set.status = 422;
          return { success: false, error: getErrorMessage(err) };
        }
      })

      .post('/tools/update-brand-kit', async (ctx) => {
        try {
          const body = UpdateBrandKitBodySchema.parse(ctx.body);
          const tokens = getTokensFromContext(ctx as unknown as Record<string, unknown>);
          if (!tokens) {
            ctx.set.status = 401;
            return { success: false, error: 'Missing X-Canva-Access-Token header' };
          }
          const adapter = getAdapter();
          const result = await adapter.executeOperation('canva_update_brand_kit', body, tokens);
          return { success: true, data: result };
        } catch (err) {
          logger.error('canva_update_brand_kit failed', { error: getErrorMessage(err) });
          ctx.set.status = 422;
          return { success: false, error: getErrorMessage(err) };
        }
      })

      .get('/tools', () => {
        const adapter = getAdapter();
        const tools = adapter.getMcpToolDefinitions();
        return { success: true, tools };
      })
  );
}
