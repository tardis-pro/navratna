import { Elysia, t } from 'elysia';
import { logger } from '@uaip/utils';
import { MCPClientService } from '../services/mcp_client_service.js';
import { MCPResourceDiscoveryService } from '../services/mcp_resource_discovery_service.js';

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/**
 * Strips all secret fields from in-memory server state before sending to
 * clients. httpHeaders contains live API keys and must NEVER leave the process.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeServerState(s: unknown) {
  const state: Record<string, unknown> = isRecord(s) ? s : {};
  const {
    config,
    httpHeaders: _ignoredHttpHeaders,
    httpSessionId: _ignoredHttpSessionId,
    process: _ignoredProcess,
    ...rest
  } = state;
  const cfg: Record<string, unknown> | undefined = isRecord(config) ? config : undefined;
  return {
    ...rest,
    config: cfg
      ? {
          args: cfg.args,
          cwd: cfg.cwd,
          transportType: cfg.transportType,
          httpUrl: cfg.httpUrl,
          // httpHeaders intentionally omitted — contains API keys
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

const McpSuccessSchema = t.Object({ success: t.Boolean() })
const McpErrorSchema = t.Object({ success: t.Literal(false), error: t.Object({ code: t.String(), message: t.String() }) })
const McpAny = t.Any()

export function registerMCPRoutes() {
  const mcpService = MCPClientService.getInstance();

  logger.info('Registering MCP Elysia routes');

  return new Elysia().group('/api/v1/mcp', (g) =>
    g
      // Simple readiness/test endpoint
      .get('/test', () => ({ success: true, message: 'MCP routes working' }))

      .get('/status', async () => {
        const status = await mcpService.getSystemStatus();
        return { success: true, data: status };
      })

      .get('/test-tools', async () => {
        const tools = mcpService.getAvailableToolsForAgent?.();
        return {
          success: true,
          data: { tools: tools ?? [], count: tools?.length ?? 0 },
        };
      })

      // Aggregated tool list across every running server. The client maps over
      // `tools` unconditionally, so all three fields must always be present.
      .get('/tools', async () => {
        const servers = mcpService.getAllServers();
        const tools = servers.flatMap((s) =>
          (s.tools ?? []).map((tool) => ({
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema ?? {},
            serverName: s.name,
          }))
        );
        return {
          success: true as const,
          data: {
            tools,
            count: tools.length,
            servers: servers.map((s) => s.name),
          },
        };
      }, {
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({
              tools: t.Array(McpAny),
              count: t.Number(),
              servers: t.Array(t.String()),
            }),
          }),
        },
      })

      // Tool recommendations for an agent
      .get('/recommendations/:agentId', async ({ params, query }) => {
        const { agentId } = params;
        const { context, limit } = query;
        const recs = await mcpService.getToolRecommendations(
          agentId,
          context,
          limit ? parseInt(String(limit)) : 5
        );
        return {
          success: true,
          data: { agentId, context, recommendations: recs, totalRecommendations: recs.length },
        };
      }, {
        query: t.Object({ context: t.Optional(t.String()), limit: t.Optional(t.String()) }),
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({ agentId: t.String(), context: t.Optional(t.Any()), recommendations: t.Array(McpAny), totalRecommendations: t.Number() }),
          }),
        },
      })

      // Related tools based on graph relationships
      .get('/tools/:toolId/related', async ({ params, query }) => {
        const { toolId } = params;
        const types = query.relationshipTypes
          ? String(query.relationshipTypes).split(',')
          : undefined;
        const minStrength = query.minStrength ? parseFloat(String(query.minStrength)) : 0.5;
        const limit = query.limit ? parseInt(String(query.limit)) : 10;
        const related = await mcpService.getRelatedTools(toolId, types, minStrength, limit);
        return {
          success: true,
          data: { toolId, relatedTools: related, totalRelated: related.length },
        };
      }, {
        query: t.Object({ relationshipTypes: t.Optional(t.String()), minStrength: t.Optional(t.String()), limit: t.Optional(t.String()) }),
        response: {
          200: t.Object({ success: t.Literal(true), data: t.Object({ toolId: t.String(), relatedTools: t.Array(McpAny), totalRelated: t.Number() }) }),
        },
      })

      // Usage analytics
      .get('/analytics/usage', async ({ query }) => {
        const { toolId, agentId, serverName } = query;
        const analytics = await mcpService.getUsageAnalytics(toolId, agentId, serverName);
        return { success: true, data: { filters: { toolId, agentId, serverName }, analytics } };
      }, {
        query: t.Object({ toolId: t.Optional(t.String()), agentId: t.Optional(t.String()), serverName: t.Optional(t.String()) }),
        response: { 200: t.Object({ success: t.Literal(true), data: McpAny }) },
      })

      // Graph status
      .get('/graph/status', async () => {
        const status = await mcpService.getGraphStatus();
        return { success: true, data: status };
      })

      // Comprehensive discovery and search
      .get('/discover', async ({ query }) => {
        const { serverName } = query;
        const discoveryService = MCPResourceDiscoveryService.getInstance();
        const discovery = await discoveryService.discoverAllResources(serverName);
        return {
          success: true,
          data: {
            ...discovery,
            summary: {
              totalResources: discovery.resources.length,
              totalPrompts: discovery.prompts.length,
              totalTools: discovery.tools.length,
              totalServers: discovery.servers.length,
            },
          },
        };
      }, {
        query: t.Object({ serverName: t.Optional(t.String()) }),
        response: { 200: t.Object({ success: t.Literal(true), data: McpAny }) },
      })

      .get('/search/resources', async ({ query, set }) => {
        const { query: q, serverName, category, mimeType } = query;
        if (!q) {
          set.status = 400;
          return {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Query parameter is required' },
          };
        }
        const discoveryService = MCPResourceDiscoveryService.getInstance();
        const resources = await discoveryService.searchResources(String(q), {
          serverName,
          category,
          mimeType,
        });
        return { success: true, data: { query: q, resources, count: resources.length } };
      }, {
        query: t.Object({ query: t.Optional(t.String()), serverName: t.Optional(t.String()), category: t.Optional(t.String()), mimeType: t.Optional(t.String()) }),
        response: {
          200: t.Object({ success: t.Literal(true), data: t.Object({ query: McpAny, resources: t.Array(McpAny), count: t.Number() }) }),
          400: McpErrorSchema,
        },
      })

      // List servers summary — safe fields only, no secrets
      .get('/servers', async () => {
        const servers = await mcpService.getConfiguredServers();
        return {
          success: true,
          data: servers.map((s) => ({
            name: s.name,
            status: s.status,
            transportType: s.transportType,
            pid: s.pid,
            toolCount: s.tools?.length || 0,
            lastHealthCheck: s.lastHealthCheck,
          })),
        };
      })

      // Server status — sanitized, no httpHeaders
      .get('/servers/:serverName/status', async ({ params, set }) => {
        const st = mcpService.getServerStatus(params.serverName);
        if (!st) {
          set.status = 404;
          return { success: false, error: { code: 'NOT_FOUND', message: 'Server not found' } };
        }
        return { success: true, data: sanitizeServerState(st) };
      }, {
        response: { 200: t.Object({ success: t.Literal(true), data: McpAny }), 404: McpErrorSchema },
      })

      // Server lifecycle — admin only
      .post('/servers/:serverName/start', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }
        await mcpService.startServer(ctx.params.serverName);
        return { success: true };
      }, {
        response: { 200: McpSuccessSchema, 403: McpErrorSchema },
      })
      .post('/servers/:serverName/stop', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }
        await mcpService.stopServer(ctx.params.serverName);
        return { success: true };
      }, {
        response: { 200: McpSuccessSchema, 403: McpErrorSchema },
      })
      .post('/servers/:serverName/restart', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }
        await mcpService.restartServer(ctx.params.serverName);
        return { success: true };
      }, {
        response: { 200: McpSuccessSchema, 403: McpErrorSchema },
      })
      .post('/servers/:serverName/recover', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }
        await mcpService.recoverServer(ctx.params.serverName);
        return { success: true };
      }, {
        response: { 200: McpSuccessSchema, 403: McpErrorSchema },
      })

      // Install / uninstall — admin only
      .post('/servers/:serverName/install', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }

        const body = typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : null;
        if (!body) {
          ctx.set.status = 400;
          return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Body required' } };
        }
        const transportTypeValue = Reflect.get(body, 'transportType');
        const transportType: 'stdio' | 'http' | 'streamable-http' =
          transportTypeValue === 'http' || transportTypeValue === 'streamable-http'
            ? transportTypeValue
            : 'stdio';
        const rawArgs = Reflect.get(body, 'args');
        const installConfig = {
          args: Array.isArray(rawArgs) ? rawArgs.map(String) : [],
          command:
            typeof Reflect.get(body, 'command') === 'string'
              ? Reflect.get(body, 'command')
              : undefined,
          env:
            Reflect.get(body, 'env') && typeof Reflect.get(body, 'env') === 'object'
              ? Reflect.get(body, 'env')
              : undefined,
          cwd:
            typeof Reflect.get(body, 'cwd') === 'string' ? Reflect.get(body, 'cwd') : undefined,
          transportType,
          httpUrl:
            typeof Reflect.get(body, 'httpUrl') === 'string'
              ? Reflect.get(body, 'httpUrl')
              : undefined,
          httpHeaders:
            Reflect.get(body, 'httpHeaders') && typeof Reflect.get(body, 'httpHeaders') === 'object'
              ? Reflect.get(body, 'httpHeaders')
              : undefined,
        };
        await mcpService.installServer(ctx.params.serverName, installConfig);
        return { success: true };
      }, {
        body: t.Object({
          transportType: t.Optional(t.String()),
          args: t.Optional(t.Array(t.String())),
          command: t.Optional(t.String()),
          env: t.Optional(t.Any()),
          cwd: t.Optional(t.String()),
          httpUrl: t.Optional(t.String()),
          httpHeaders: t.Optional(t.Any()),
        }),
        response: { 200: McpSuccessSchema, 400: McpErrorSchema, 403: McpErrorSchema },
      })
      .post('/servers/:serverName/uninstall', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }
        await mcpService.uninstallServer(ctx.params.serverName);
        return { success: true };
      }, {
        response: { 200: McpSuccessSchema, 403: McpErrorSchema },
      })

      // Tools by server
      .get('/servers/:serverName/tools', async ({ params }) => {
        const tools = mcpService.getToolsByServer(params.serverName);
        return {
          success: true,
          data: { serverName: params.serverName, tools, count: tools.length },
        };
      }, {
        response: { 200: t.Object({ success: t.Literal(true), data: t.Object({ serverName: t.String(), tools: t.Array(McpAny), count: t.Number() }) }) },
      })

      // Attach a single tool to agent — admin only
      .post('/agents/:agentId/tools/attach', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }

        const bodyData = typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : null;
        const serverName = bodyData && 'serverName' in bodyData ? bodyData.serverName : undefined;
        const toolName = bodyData && 'toolName' in bodyData ? bodyData.toolName : undefined;
        if (!serverName || !toolName) {
          ctx.set.status = 400;
          return {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'serverName and toolName are required' },
          };
        }
        const result = await mcpService.attachSingleToolToAgent(
          ctx.params.agentId,
          String(serverName || ''),
          String(toolName || '')
        );
        return {
          success: result.success,
          data: {
            agentId: ctx.params.agentId,
            serverName: String(serverName || ''),
            toolName: String(toolName || ''),
            toolId: result.toolId,
            assignment: result.assignment,
          },
        };
      }, {
        body: t.Object({ serverName: t.String(), toolName: t.String() }),
        response: {
          200: t.Object({
            success: t.Boolean(),
            data: t.Object({ agentId: t.String(), serverName: t.String(), toolName: t.String(), toolId: t.String(), assignment: McpAny }),
          }),
          400: McpErrorSchema,
          403: McpErrorSchema,
        },
      })

      // Raw resources and prompts
      .get('/resources', async ({ query }) => {
        const { serverName } = query;
        const data = await mcpService.discoverResources(serverName);
        return { success: true, data: { resources: data, count: data.length } };
      }, {
        query: t.Object({ serverName: t.Optional(t.String()) }),
        response: { 200: t.Object({ success: t.Literal(true), data: t.Object({ resources: t.Array(McpAny), count: t.Number() }) }) },
      })
      .get('/prompts', async ({ query }) => {
        const { serverName } = query;
        const data = await mcpService.discoverPrompts(serverName);
        return { success: true, data: { prompts: data, count: data.length } };
      }, {
        query: t.Object({ serverName: t.Optional(t.String()) }),
        response: { 200: t.Object({ success: t.Literal(true), data: t.Object({ prompts: t.Array(McpAny), count: t.Number() }) }) },
      })
  );
}

export const noop: undefined = undefined;
