import { Elysia } from 'elysia';
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
function sanitizeServerState(s: unknown) {
  const state = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
  const { config, _httpHeaders: _ignoredHttpHeaders, ...rest } = state;
  const cfg = (config && typeof config === 'object' ? config : undefined) as
    | Record<string, unknown>
    | undefined;
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

export function registerMCPRoutes() {
  const mcpService = MCPClientService.getInstance();

  logger.info('Registering MCP Elysia routes');

  return new Elysia().group('/api/v1/mcp', (g) =>
    g
      // Simple readiness/test endpoint
      .get('/test', () => ({ success: true, message: 'MCP routes working' }))

      // Summarized system status
      .get('/status', async () => {
        const status = await mcpService.getSystemStatus();
        return { success: true, data: status };
      })

      // Optional tools snapshot if available
      .get('/test-tools', async () => {
        const tools = mcpService.getAvailableToolsForAgent?.();
        return {
          success: true,
          data: { tools: tools ?? [], count: tools?.length ?? 0 },
        };
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
      })

      // Usage analytics
      .get('/analytics/usage', async ({ query }) => {
        const { toolId, agentId, serverName } = query;
        const analytics = await mcpService.getUsageAnalytics(toolId, agentId, serverName);
        return { success: true, data: { filters: { toolId, agentId, serverName }, analytics } };
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
      })

      // List servers summary — safe fields only, no secrets
      .get('/servers', async () => {
        const servers = mcpService.getAllServers();
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
      })
      .post('/servers/:serverName/stop', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }
        await mcpService.stopServer(ctx.params.serverName);
        return { success: true };
      })
      .post('/servers/:serverName/restart', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }
        await mcpService.restartServer(ctx.params.serverName);
        return { success: true };
      })
      .post('/servers/:serverName/recover', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }
        await mcpService.recoverServer(ctx.params.serverName);
        return { success: true };
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
        const installConfig = {
          args: Array.isArray(Reflect.get(body, 'args')) ? Reflect.get(body, 'args').map(String) : [],
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
      })
      .post('/servers/:serverName/uninstall', async (ctx) => {
        const role = ctx.headers['x-user-role'] || ctx.request.headers.get('x-user-role');
        if (role !== 'admin') {
          ctx.set.status = 403;
          return { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required for MCP server management' } };
        }
        await mcpService.uninstallServer(ctx.params.serverName);
        return { success: true };
      })

      // Tools by server
      .get('/servers/:serverName/tools', async ({ params }) => {
        const tools = mcpService.getToolsByServer(params.serverName);
        return {
          success: true,
          data: { serverName: params.serverName, tools, count: tools.length },
        };
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
      })

      // Raw resources and prompts
      .get('/resources', async ({ query }) => {
        const { serverName } = query;
        const data = await mcpService.discoverResources(serverName);
        return { success: true, data: { resources: data, count: data.length } };
      })
      .get('/prompts', async ({ query }) => {
        const { serverName } = query;
        const data = await mcpService.discoverPrompts(serverName);
        return { success: true, data: { prompts: data, count: data.length } };
      })
  );
}

export const noop: undefined = undefined;
