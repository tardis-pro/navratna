/**
 * Federation Routes
 *
 * REST API for the TARDIS federation registry — discovering, managing,
 * and querying federated subdomain MCP servers and their tools.
 */

import { Elysia, t } from 'elysia';
import { logger } from '@uaip/utils';
import { FederationRegistryService } from '../services/federation_registry_service.js';

// ---------------------------------------------------------------------------
// Shared response schemas
// ---------------------------------------------------------------------------

const FedErrorSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({ code: t.String(), message: t.String() }),
});
const FedAny = t.Any();

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireAdmin(ctx: { headers: Record<string, string | undefined>; request: Request; set: { status?: number | string } }): boolean {
  const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
  if (role !== 'admin') {
    ctx.set.status = 403;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerFederationRoutes() {
  const federation = FederationRegistryService.getInstance();

  logger.info('Registering Federation Elysia routes');

  return new Elysia().group('/api/v1/federation', (g) =>
    g
      // ── Subdomains ─────────────────────────────────────────────────────

      // List all federated subdomains
      .get('/subdomains', async ({ query }) => {
        const subdomains = await federation.getSubdomains({
          status: query.status as undefined,
          category: query.category,
          search: query.search,
        });
        return {
          success: true,
          data: { subdomains, count: subdomains.length },
        };
      }, {
        query: t.Object({
          status: t.Optional(t.String()),
          category: t.Optional(t.String()),
          search: t.Optional(t.String()),
        }),
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({ subdomains: t.Array(FedAny), count: t.Number() }),
          }),
        },
      })

      // Get subdomain detail + tools
      .get('/subdomains/:id', async ({ params, set }) => {
        const subdomain = await federation.getSubdomainById(params.id);
        if (!subdomain) {
          set.status = 404;
          return {
            success: false as const,
            error: { code: 'NOT_FOUND', message: 'Subdomain not found' },
          };
        }

        const tools = await federation.getSubdomainTools(params.id);
        return {
          success: true,
          data: { subdomain, tools, toolsCount: tools.length },
        };
      }, {
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({ subdomain: FedAny, tools: t.Array(FedAny), toolsCount: t.Number() }),
          }),
          404: FedErrorSchema,
        },
      })

      // Manual registration (admin only)
      .post('/subdomains/register', async (ctx) => {
        if (!requireAdmin(ctx)) {
          return {
            success: false as const,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          };
        }

        try {
          const body = isRecord(ctx.body) ? ctx.body : {};
          const manifest = body.manifest ?? body;

          // Extract registeredBy from header if available
          const userId = ctx.headers['x-user-id'] || ctx.request.headers.get('x-user-id');

          const subdomain = await federation.registerSubdomain(
            manifest as Parameters<typeof federation.registerSubdomain>[0],
            { registeredBy: typeof userId === 'string' ? userId : undefined }
          );

          return {
            success: true,
            data: { subdomain },
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.error('Federation registration failed', { error: msg });
          ctx.set.status = 400;
          return {
            success: false as const,
            error: { code: 'VALIDATION_ERROR', message: msg },
          };
        }
      }, {
        body: t.Any(),
        response: {
          200: t.Object({ success: t.Literal(true), data: t.Object({ subdomain: FedAny }) }),
          400: FedErrorSchema,
          403: FedErrorSchema,
        },
      })

      // Trigger crawl (admin only)
      .post('/subdomains/crawl', async (ctx) => {
        if (!requireAdmin(ctx)) {
          return {
            success: false as const,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          };
        }

        const body = isRecord(ctx.body) ? ctx.body : {};

        if (typeof body.subdomain === 'string') {
          // Crawl a specific subdomain
          const result = await federation.crawlSubdomain(body.subdomain);
          return { success: result.success, data: result };
        }

        // Crawl all
        const result = await federation.crawlAll();
        return { success: true, data: result };
      }, {
        body: t.Optional(t.Object({
          subdomain: t.Optional(t.String()),
        })),
        response: {
          200: t.Object({ success: t.Boolean(), data: FedAny }),
          403: FedErrorSchema,
        },
      })

      // Deregister subdomain (admin only)
      .post('/subdomains/:id/deregister', async (ctx) => {
        if (!requireAdmin(ctx)) {
          return {
            success: false as const,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          };
        }

        await federation.deregisterSubdomain(ctx.params.id);
        return { success: true };
      }, {
        response: {
          200: t.Object({ success: t.Literal(true) }),
          403: FedErrorSchema,
        },
      })

      // ── Tools ──────────────────────────────────────────────────────────

      // List all federated tools (cross-subdomain)
      .get('/tools', async ({ query }) => {
        const tools = await federation.getAllFederatedTools({
          category: query.category,
          activeOnly: query.activeOnly !== 'false',
        });
        return {
          success: true,
          data: { tools, count: tools.length },
        };
      }, {
        query: t.Object({
          category: t.Optional(t.String()),
          activeOnly: t.Optional(t.String()),
        }),
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({ tools: t.Array(FedAny), count: t.Number() }),
          }),
        },
      })

      // Search tools by name/category/tag
      .get('/tools/search', async ({ query, set }) => {
        if (!query.q) {
          set.status = 400;
          return {
            success: false as const,
            error: { code: 'VALIDATION_ERROR', message: 'Query parameter "q" is required' },
          };
        }

        const tools = await federation.searchTools(query.q);
        return {
          success: true,
          data: { query: query.q, tools, count: tools.length },
        };
      }, {
        query: t.Object({
          q: t.Optional(t.String()),
        }),
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({ query: t.String(), tools: t.Array(FedAny), count: t.Number() }),
          }),
          400: FedErrorSchema,
        },
      })

      // ── Health ─────────────────────────────────────────────────────────

      // Federation health summary
      .get('/health', async (_ctx) => {
        const summary = await federation.getHealthSummary();
        return { success: true, data: summary };
      }, {
        response: {
          200: t.Object({ success: t.Literal(true), data: FedAny }),
        },
      })

      // Health check a specific subdomain (admin only)
      .post('/subdomains/:id/health', async (ctx) => {
        if (!requireAdmin(ctx)) {
          return {
            success: false as const,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          };
        }

        const result = await federation.checkHealth(ctx.params.id);
        return { success: true, data: result };
      }, {
        response: {
          200: t.Object({ success: t.Literal(true), data: FedAny }),
          403: FedErrorSchema,
        },
      })

      // Trigger health check on all subdomains (admin only)
      .post('/health/check-all', async (ctx) => {
        if (!requireAdmin(ctx)) {
          return {
            success: false as const,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
          };
        }

        const result = await federation.checkAllHealth();
        return { success: true, data: result };
      }, {
        response: {
          200: t.Object({ success: t.Literal(true), data: FedAny }),
          403: FedErrorSchema,
        },
      })
  );
}
