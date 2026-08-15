import { describe, expect, it, vi, beforeEach } from 'vitest';

// @uaip/config throws FATAL at module-eval time when these are absent, and it is
// pulled in transitively by feature.ts. Set them before any dynamic import runs.
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.DELETION_HASH_SALT ??= 'test-deletion-hash-salt';

/**
 * Regression guard for the production outage where every MCP persistence call
 * failed with "MCP repository not initialized".
 *
 * capabilityFeature.initialize() used to call
 *   MCPClientService.getInstance().initialize(deps?.eventBusService)
 * passing only the event bus — so MCPClientService.mcpRepo stayed undefined and
 * installServer/updateServerConfig/loadServerConfig/autoStartServers all bailed.
 * Live symptom: POST /api/v1/mcp/servers/:name/install -> 500, and
 * "MCP repository not initialized, skipping auto-start" on every boot.
 *
 * The feature MUST hand MCPClientService a McpRepository (and the database
 * service) so MCP servers can actually be persisted and auto-started.
 */

const initializeSpy = vi.fn().mockResolvedValue(undefined);

vi.mock('../../services/mcp_client_service.js', () => ({
  MCPClientService: {
    getInstance: (): { initialize: typeof initializeSpy } => ({ initialize: initializeSpy }),
  },
}));

vi.mock('../../services/federation_registry_service.js', () => ({
  FederationRegistryService: {
    getInstance: (): { initialize: () => Promise<void> } => ({
      initialize: async (): Promise<void> => undefined,
    }),
  },
}));

vi.mock('../../services/tool_execution_coordinator_service.js', () => ({
  ToolExecutionCoordinator: {
    getInstance: (): { initialize: () => Promise<void> } => ({
      initialize: async (): Promise<void> => undefined,
    }),
  },
}));

vi.mock('../../services/unified_tool_registry.js', () => ({
  UnifiedToolRegistry: class {
    async initialize(): Promise<void> {
      return undefined;
    }
    async registerTool(): Promise<void> {
      return undefined;
    }
    getTool(): undefined {
      return undefined;
    }
  },
}));

vi.mock('../../services/oauth_capability_discovery.js', () => ({
  OAuthCapabilityDiscovery: {
    getInstance: (): { initialize: () => Promise<void> } => ({
      initialize: async (): Promise<void> => undefined,
    }),
  },
}));

vi.mock('@uaip/shared-services', () => ({
  getControlDb: (): Record<string, never> => ({}),
  // ToolRegistry resolves this in its constructor, which feature.initialize() now
  // runs so that tool.register actually has a subscriber.
  ToolService: {
    getInstance: (): Record<string, never> => ({}),
  },
  McpConnectionResolver: {
    getInstance: (): { listIntegrationServers: () => Promise<never[]> } => ({
      listIntegrationServers: async (): Promise<never[]> => [],
    }),
  },
  McpConnectionError: class extends Error {},
  // IntegrationCatalogDiscovery resolves this in its constructor. Without it the
  // construction throws, feature.initialize() swallows it, and the subscription
  // silently never happens — exactly the failure mode these tests guard.
  AgentMcpToolAssignmentService: {
    getInstance: (): { assign: () => Promise<number>; unassignServer: () => Promise<number> } => ({
      assign: async (): Promise<number> => 0,
      unassignServer: async (): Promise<number> => 0,
    }),
  },
  // capabilityFeature.initialize() runs this before anything touches the DB, so
  // the mcp_servers.project_id column exists for McpConnectionResolver. Stubbed
  // to a no-op — these tests have no Postgres.
  EnsureMcpServerProjectScope: class {
    async run(): Promise<void> {}
  },
  // registerNativeTools() asserts at boot that every statically-known tool id has a
  // danger_tool_list classification, and reads these two lists to do it. The real
  // values matter — mocking them empty would make the assertion vacuous here.
  PROJECT_TASK_TOOL_IDS: [
    'project-list',
    'project-get',
    'task-list',
    'task-get',
    'task-create',
    'task-update',
    'task-stats',
  ],
  CALENDAR_TOOL_IDS: [
    'calendar-list',
    'calendar-events-list',
    'calendar-event-get',
    'calendar-event-create',
    'calendar-event-update',
    'calendar-event-delete',
    'calendar-freebusy',
  ],
}));

class FakeMcpRepository {}

vi.mock('../../database/mcp_repository.js', () => ({
  McpRepository: FakeMcpRepository,
  McpDatabaseError: class extends Error {},
}));

vi.mock('@uaip/infra', () => ({
  getRedisClient: (): null => null,
}));

describe('capabilityFeature MCP wiring', () => {
  beforeEach(() => {
    initializeSpy.mockClear();
  });

  it('passes an McpRepository to MCPClientService.initialize so MCP persistence works', async () => {
    const { capabilityFeature } = await import('../../feature.js');
    const { McpRepository } = await import('../../database/mcp_repository.js');

    await capabilityFeature.initialize?.({
      // The feature only reads `.subscribe`/`.publish` off this in the paths under test.
      eventBusService: {
        subscribe: async (): Promise<void> => undefined,
        publish: async (): Promise<void> => undefined,
      } as unknown as Parameters<NonNullable<typeof capabilityFeature.initialize>>[0]['eventBusService'],
    });

    expect(initializeSpy).toHaveBeenCalledTimes(1);

    const mcpRepositoryArg = initializeSpy.mock.calls[0]?.[2];
    expect(
      mcpRepositoryArg,
      'MCPClientService.initialize() must receive an McpRepository as its 3rd argument, ' +
        'otherwise every MCP persistence call fails with "MCP repository not initialized"'
    ).toBeInstanceOf(McpRepository);
  });

  /**
   * Regression guard for a second silent outage: ToolRegistry only subscribes to
   * tool.register when it is constructed WITH an event bus, and production built
   * it in tool_routes.ts without one. Every discovered MCP tool was published to
   * zero consumers and never persisted.
   */
  it('subscribes a ToolRegistry to tool.register so discovered tools are persisted', async () => {
    const { capabilityFeature } = await import('../../feature.js');
    const subscribedTopics: string[] = [];

    await capabilityFeature.initialize?.({
      eventBusService: {
        subscribe: async (topic: string): Promise<void> => {
          subscribedTopics.push(topic);
        },
        publish: async (): Promise<void> => undefined,
      } as unknown as Parameters<NonNullable<typeof capabilityFeature.initialize>>[0]['eventBusService'],
    });

    expect(
      subscribedTopics,
      'nothing subscribes to tool.register, so every discovered MCP tool is published into the void'
    ).toContain('tool.register');
  });

  it('subscribes to integration.connection.linked so linked providers get discovered', async () => {
    const { capabilityFeature } = await import('../../feature.js');
    const subscribedTopics: string[] = [];

    await capabilityFeature.initialize?.({
      eventBusService: {
        subscribe: async (topic: string): Promise<void> => {
          subscribedTopics.push(topic);
        },
        publish: async (): Promise<void> => undefined,
      } as unknown as Parameters<NonNullable<typeof capabilityFeature.initialize>>[0]['eventBusService'],
    });

    expect(subscribedTopics).toContain('integration.connection.linked');
  });
});
