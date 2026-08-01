import { logger } from '@uaip/utils';
import {
  INTEGRATION_CONNECTION_LINKED_EVENT,
  INTEGRATION_CONNECTION_UNLINKED_EVENT,
  ToolCategory,
  type IntegrationConnectionLinkedEvent,
  type IntegrationConnectionUnlinkedEvent,
} from '@uaip/types';
import {
  AgentMcpToolAssignmentService,
  McpConnectionError,
  McpConnectionResolver,
} from '@uaip/shared-services';
import type { EventBusService } from '@uaip/infra';
import { IntegrationMcpExecutor } from './integration_mcp_executor.js';
import { buildMcpToolRegistration, mcpToolKey } from '../utils/mcp_tool_key.js';

export interface IntegrationCatalogDiscoveryOptions {
  resolver?: McpConnectionResolver;
  executor?: IntegrationMcpExecutor;
  assignments?: AgentMcpToolAssignmentService;
}

export type IntegrationConnectionLinkedPayload = IntegrationConnectionLinkedEvent;

function extractLinkedPayload(event: unknown): IntegrationConnectionLinkedPayload | null {
  if (typeof event !== 'object' || event === null) return null;

  // The bus delivers an envelope with the published payload under `data`; reading
  // the top level instead is exactly what silently broke tool.register.
  const envelope = event as { data?: unknown };
  const source =
    typeof envelope.data === 'object' && envelope.data !== null ? envelope.data : event;
  const candidate = source as Partial<IntegrationConnectionLinkedPayload>;

  if (
    typeof candidate.serverKey !== 'string' ||
    typeof candidate.projectId !== 'string' ||
    typeof candidate.agentId !== 'string' ||
    typeof candidate.actorUserId !== 'string'
  ) {
    return null;
  }

  return {
    serverKey: candidate.serverKey,
    projectId: candidate.projectId,
    agentId: candidate.agentId,
    actorUserId: candidate.actorUserId,
  };
}

function extractUnlinkedPayload(event: unknown): IntegrationConnectionUnlinkedEvent | null {
  if (typeof event !== 'object' || event === null) return null;

  const envelope = event as { data?: unknown };
  const source =
    typeof envelope.data === 'object' && envelope.data !== null ? envelope.data : event;
  const candidate = source as Partial<IntegrationConnectionUnlinkedEvent>;

  if (
    typeof candidate.serverKey !== 'string' ||
    typeof candidate.projectId !== 'string' ||
    typeof candidate.agentId !== 'string'
  ) {
    return null;
  }

  return {
    serverKey: candidate.serverKey,
    projectId: candidate.projectId,
    agentId: candidate.agentId,
  };
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
  private readonly assignments: AgentMcpToolAssignmentService;

  constructor(options: IntegrationCatalogDiscoveryOptions = {}) {
    this.resolver = options.resolver ?? McpConnectionResolver.getInstance();
    this.executor = options.executor ?? IntegrationMcpExecutor.getInstance();
    this.assignments = options.assignments ?? AgentMcpToolAssignmentService.getInstance();
  }

  static getInstance(): IntegrationCatalogDiscovery {
    if (!IntegrationCatalogDiscovery.instance) {
      IntegrationCatalogDiscovery.instance = new IntegrationCatalogDiscovery();
    }
    return IntegrationCatalogDiscovery.instance;
  }

  /**
   * A caller_connection server has no catalog until someone links a credential, so
   * boot-time discovery defers it. This subscription is the other half: it runs a
   * credential-scoped tools/list the moment a connection is linked, which is the
   * only point at which those providers' tools can be registered at all.
   */
  async initialize(eventBus?: EventBusService): Promise<void> {
    if (!eventBus) {
      logger.warn(
        'eventBusService not provided — integration tools will never be registered for providers that need a user connection'
      );
      return;
    }

    await eventBus.subscribe(INTEGRATION_CONNECTION_LINKED_EVENT, async (event) => {
      const payload = extractLinkedPayload(event);
      if (!payload) {
        logger.warn('Ignoring malformed integration.connection.linked event');
        return;
      }
      await this.discoverForConnection(payload, eventBus);
    });

    await eventBus.subscribe(INTEGRATION_CONNECTION_UNLINKED_EVENT, async (event) => {
      const payload = extractUnlinkedPayload(event);
      if (!payload) {
        logger.warn('Ignoring malformed integration.connection.unlinked event');
        return;
      }
      await this.withdrawForConnection(payload);
    });
  }

  /**
   * Removes a provider's tools from the agent's assigned set once its binding is
   * gone. Leaving them would keep offering the model tools whose credential no
   * longer resolves, so every such call would fail at execution instead.
   */
  async withdrawForConnection(event: IntegrationConnectionUnlinkedEvent): Promise<number> {
    const removed = await this.assignments.unassignServer(event.agentId, event.serverKey);

    logger.info('Withdrew integration tools from an unlinked connection', {
      serverKey: event.serverKey,
      agentId: event.agentId,
      removed,
    });
    return removed;
  }

  /**
   * Discovers a server's tools using the credential bound to this
   * (project, agent, provider), which is what makes a caller_connection provider
   * visible to agents at all.
   */
  async discoverForConnection(
    request: IntegrationConnectionLinkedPayload,
    eventBus?: EventBusService
  ): Promise<number> {
    try {
      // The event names an actor, but a bus payload is a notification, not a grant.
      // The authoritative answer is the user recorded on the stored binding, so a
      // forged or replayed event cannot drive discovery under someone else's identity.
      const actorUserId = await this.resolver.findBindingActor(
        request.serverKey,
        request.projectId,
        request.agentId
      );

      if (!actorUserId) {
        logger.warn('Ignoring a linked-connection event with no matching binding', {
          serverKey: request.serverKey,
        });
        return 0;
      }

      const tools = await this.executor.listTools({
        serverKey: request.serverKey,
        projectId: request.projectId,
        agentId: request.agentId,
        actorUserId,
      });

      await this.registerTools(request.serverKey, tools, eventBus);

      // Registering a tool only makes it EXIST. Agent chat builds its toolset from
      // agents.assigned_mcp_tools, so without this the provider the user just linked
      // stays invisible to the very agent it was linked to.
      const assigned = await this.assignments.assign(
        request.agentId,
        tools.map((tool) => ({
          toolId: mcpToolKey(request.serverKey, tool.name),
          toolName: mcpToolKey(request.serverKey, tool.name),
          serverName: request.serverKey,
        }))
      );

      logger.info('Integration tools registered from a linked connection', {
        serverKey: request.serverKey,
        toolCount: tools.length,
        assignedToAgent: assigned,
      });
      return tools.length;
    } catch (error) {
      // A failure here must not fail the link itself: the connection is already
      // stored, and discovery retries the next time it is linked or re-linked.
      logger.warn('Discovery for a linked connection failed', {
        serverKey: request.serverKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
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
