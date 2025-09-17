import { logger } from '@uaip/utils';
import { MCPClientService } from '../services/mcpClientService.js';
import { MCPResourceDiscoveryService } from '../services/mcpResourceDiscoveryService.js';

// Minimal Elysia route group for MCP endpoints
export function registerMCPRoutes(app: any) {
  const mcpService = MCPClientService.getInstance();

  logger.info('Registering MCP Elysia routes');

  app.group('/api/v1/mcp', (g: any) =>
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
        const tools = await (mcpService as any).getAvailableTools?.();
        return {
          success: true,
          data: { tools: tools ?? [], count: tools?.length ?? 0 }
        };
      })

      // Tool recommendations for an agent
      .get('/recommendations/:agentId', async ({ params, query }: any) => {
        const { agentId } = params as any;
        const { context, limit } = query as any;
        const recs = await mcpService.getToolRecommendations(agentId, context, limit ? parseInt(String(limit)) : 5);
        return { success: true, data: { agentId, context, recommendations: recs, totalRecommendations: recs.length } };
      })

      // Related tools based on graph relationships
      .get('/tools/:toolId/related', async ({ params, query }: any) => {
        const { toolId } = params as any;
        const types = query.relationshipTypes ? String(query.relationshipTypes).split(',') : undefined;
        const minStrength = query.minStrength ? parseFloat(String(query.minStrength)) : 0.5;
        const limit = query.limit ? parseInt(String(query.limit)) : 10;
        const related = await mcpService.getRelatedTools(toolId, types, minStrength, limit);
        return { success: true, data: { toolId, relatedTools: related, totalRelated: related.length } };
      })

      // Usage analytics
      .get('/analytics/usage', async ({ query }: any) => {
        const { toolId, agentId, serverName } = query as any;
        const analytics = await mcpService.getUsageAnalytics(toolId, agentId, serverName);
        return { success: true, data: { filters: { toolId, agentId, serverName }, analytics } };
      })

      // Graph status
      .get('/graph/status', async () => {
        const status = await mcpService.getGraphStatus();
        return { success: true, data: status };
      })

      // Comprehensive discovery and search
      .get('/discover', async ({ query }: any) => {
        const { serverName } = query as any;
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
              totalServers: discovery.servers.length
            }
          }
        };
      })

      .get('/search/resources', async ({ query, set }: any) => {
        const { query: q, serverName, category, mimeType } = query as any;
        if (!q) {
          set.status = 400;
          return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Query parameter is required' } };
        }
        const discoveryService = MCPResourceDiscoveryService.getInstance();
        const resources = await discoveryService.searchResources(String(q), { serverName, category, mimeType });
        return { success: true, data: { query: q, resources, count: resources.length } };
      })

      // List servers summary
      .get('/servers', async () => {
        const servers = mcpService.getAllServers();
        return {
          success: true,
          data: servers.map((s: any) => ({
            name: s.name,
            status: s.status,
            pid: s.pid,
            toolCount: s.tools?.length || 0,
            lastHealthCheck: s.lastHealthCheck
          }))
        };
      })

      // Server status
      .get('/servers/:serverName/status', async ({ params, set }: any) => {
        const st = mcpService.getServerStatus(params.serverName);
        if (!st) {
          set.status = 404;
          return { success: false, error: { code: 'NOT_FOUND', message: 'Server not found' } };
        }
        return { success: true, data: st };
      })

      // Server lifecycle
      .post('/servers/:serverName/start', async ({ params }: any) => {
        await mcpService.startServer(params.serverName);
        return { success: true };
      })
      .post('/servers/:serverName/stop', async ({ params }: any) => {
        await mcpService.stopServer(params.serverName);
        return { success: true };
      })
      .post('/servers/:serverName/restart', async ({ params }: any) => {
        await mcpService.restartServer(params.serverName);
        return { success: true };
      })
      .post('/servers/:serverName/recover', async ({ params }: any) => {
        await mcpService.recoverServer(params.serverName);
        return { success: true };
      })

      // Tools by server
      .get('/servers/:serverName/tools', async ({ params }: any) => {
        const tools = mcpService.getToolsByServer(params.serverName);
        return { success: true, data: { serverName: params.serverName, tools, count: tools.length } };
      })

      // Attach a single tool to agent
      .post('/agents/:agentId/tools/attach', async ({ params, body, set }: any) => {
        const { serverName, toolName } = body || {};
        if (!serverName || !toolName) {
          set.status = 400;
          return { success: false, error: { code: 'VALIDATION_ERROR', message: 'serverName and toolName are required' } };
        }
        const result = await mcpService.attachSingleToolToAgent(params.agentId, serverName, toolName);
        return {
          success: result.success,
          data: {
            agentId: params.agentId,
            serverName,
            toolName,
            toolId: result.toolId,
            assignment: result.assignment
          }
        };
      })

      // Raw resources and prompts
      .get('/resources', async ({ query }: any) => {
        const { serverName } = query as any;
        const data = await mcpService.discoverResources(serverName);
        return { success: true, data: { resources: data, count: data.length } };
      })
      .get('/prompts', async ({ query }: any) => {
        const { serverName } = query as any;
        const data = await mcpService.discoverPrompts(serverName);
        return { success: true, data: { prompts: data, count: data.length } };
      })
  );

  return app;
}

export const noop = undefined;
