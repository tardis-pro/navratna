import { logger } from '@uaip/utils';
import { ToolCategory } from '@uaip/types';
import { McpConnectionError, McpConnectionResolver } from '@uaip/shared-services';
import type { EventBusService } from '@uaip/infra';
import { IntegrationMcpExecutor } from './integration_mcp_executor.js';
import { buildMcpToolRegistration } from '../utils/mcp_tool_key.js';

export interface IntegrationCatalogDiscoveryOptions {
  resolver?: McpConnectionResolver;
  executor?: IntegrationMcpExecutor;
}

export interface IntegrationCatalogDiscoveryResult {
  discovered: string[];
  deferred: string[];
  failed: string[];
  toolCount: number;
}

/**
 * Registers the tools of every DB-registered integration MCP server.
 *
 * These servers are remote and have no process to spawn, so MCPClientService's
 * autoStart path never reaches them and their tools would otherwise never be
 * registered — leaving `callTool` wired to a catalog no agent can see.
 */
export class IntegrationCatalogDiscovery {
  private static instance: IntegrationCatalogDiscovery;

  private readonly resolver: McpConnectionResolver;
  private readonly executor: IntegrationMcpExecutor;

  constructor(options: IntegrationCatalogDiscoveryOptions = {}) {
    this.resolver = options.resolver ?? McpConnectionResolver.getInstance();
    this.executor = options.executor ?? IntegrationMcpExecutor.getInstance();
  }

  static getInstance(): IntegrationCatalogDiscovery {
    if (!IntegrationCatalogDiscovery.instance) {
      IntegrationCatalogDiscovery.instance = new IntegrationCatalogDiscovery();
    }
    return IntegrationCatalogDiscovery.instance;
  }

  async discoverAll(eventBus?: EventBusService): Promise<IntegrationCatalogDiscoveryResult> {
    const result: IntegrationCatalogDiscoveryResult = {
      discovered: [],
      deferred: [],
      failed: [],
      toolCount: 0,
    };

    const servers = await this.resolver.listIntegrationServers();

    for (const server of servers) {
      if (!server.enabled) continue;

      try {
        // oxlint-disable-next-line no-await-in-loop -- each server is an independent remote round trip; sequential keeps boot logs attributable and avoids a burst of outbound connections
        const tools = await this.executor.listCatalogTools(server.serverKey);
        // oxlint-disable-next-line no-await-in-loop -- see above
        await this.registerTools(server.serverKey, tools, eventBus);
        result.discovered.push(server.serverKey);
        result.toolCount += tools.length;
      } catch (error) {
        // A server whose catalog needs a user's own credential is not an error:
        // its tools are discovered when a connection is linked.
        if (
          error instanceof McpConnectionError &&
          error.code === 'catalog_credential_required'
        ) {
          result.deferred.push(server.serverKey);
          continue;
        }
        result.failed.push(server.serverKey);
        logger.warn('Integration catalog discovery failed', {
          serverKey: server.serverKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Integration catalog discovery complete', result);
    return result;
  }

  private async registerTools(
    serverKey: string,
    tools: { name: string; description?: string; inputSchema: Record<string, unknown> }[],
    eventBus?: EventBusService
  ): Promise<void> {
    if (!eventBus) return;

    for (const tool of tools) {
      const registration = buildMcpToolRegistration(serverKey, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });

      // oxlint-disable-next-line no-await-in-loop -- ToolRegistry upserts by name; concurrent publishes of the same server's tools race on that unique constraint
      await eventBus.publish('tool.register', {
        tool: {
          ...registration,
          category: ToolCategory.API,
          version: '1.0.0',
          isEnabled: true,
          requiresApproval: false,
          costEstimate: 0.01,
          executionTimeEstimate: 5000,
          metadata: { ...registration.metadata, inputSchema: registration.parameters },
        },
        source: 'integration-catalog-discovery',
        serverName: serverKey,
      });
    }
  }
}
