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
});
