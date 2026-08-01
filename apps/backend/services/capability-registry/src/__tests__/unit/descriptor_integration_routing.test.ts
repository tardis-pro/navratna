import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
});

const { mocks } = vi.hoisted(() => ({
  mocks: {
    integrationServers: [] as { serverKey: string; credentialMode: string; enabled: boolean }[],
    listError: null as Error | null,
    meshConfig: null as Record<string, unknown> | null,
    listCalls: 0,
  },
}));

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock('@uaip/shared-services', () => ({
  McpConnectionResolver: {
    getInstance: () => ({
      listIntegrationServers: async () => {
        mocks.listCalls += 1;
        if (mocks.listError) throw mocks.listError;
        return mocks.integrationServers;
      },
    }),
  },
}));

vi.mock('../../services/mcp_client_service.js', () => ({
  MCPClientService: {
    getInstance: () => ({
      getMeshServerConfig: async () => mocks.meshConfig,
    }),
  },
}));

const httpServerConfig = {
  transportType: 'streamable-http',
  args: [],
  httpUrl: 'https://mcp.example.com/mcp',
};

/**
 * The descriptor module caches caller-bound server keys in module scope for 30s.
 * A shared import would leak the first test's cache into every later test, so each
 * test loads a fresh module instance.
 */
const loadDescriptor = async (): Promise<
  typeof import('../../services/execution_mesh/descriptor')
> => {
  vi.resetModules();
  return await import('../../services/execution_mesh/descriptor');
};

beforeEach(() => {
  mocks.integrationServers = [];
  mocks.listError = null;
  mocks.meshConfig = httpServerConfig;
  mocks.listCalls = 0;
});

describe('caller-bound integration tools stay off the worker tier', () => {
  it('keeps a caller_connection server native so its credential is not dropped', async () => {
    mocks.integrationServers = [
      { serverKey: 'github-a', credentialMode: 'caller_connection', enabled: true },
    ];

    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('mcp-github-a-create_issue');

    expect(descriptor).toEqual({});
  });

  it('matches a server key containing a hyphen, which a positional split misses', async () => {
    mocks.integrationServers = [
      { serverKey: 'github-copilot-b', credentialMode: 'caller_connection', enabled: true },
    ];

    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('mcp-github-copilot-b-create_issue');

    expect(descriptor).toEqual({});
  });

  it('still routes a non-integration http MCP server to the worker tier', async () => {
    mocks.integrationServers = [
      { serverKey: 'other-c', credentialMode: 'caller_connection', enabled: true },
    ];

    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('mcp-legacy-d-search');

    expect(descriptor.runtime).toBe('worker');
  });

  it('routes a catalog-credential server to the worker tier (no per-caller secret)', async () => {
    mocks.integrationServers = [
      { serverKey: 'docs-e', credentialMode: 'catalog', enabled: true },
    ];

    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('mcp-docs-e-search');

    expect(descriptor.runtime).toBe('worker');
  });

  it('fails CLOSED to native when the credential mode cannot be read', async () => {
    mocks.listError = new Error('control plane unavailable');

    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('mcp-unknown-f-search');

    expect(descriptor).toEqual({});
  });

  it('never asks the MCP client for a caller-bound server config', async () => {
    mocks.integrationServers = [
      { serverKey: 'slack-g', credentialMode: 'caller_connection', enabled: true },
    ];
    mocks.meshConfig = { ...httpServerConfig, transportType: 'stdio', command: 'x' };

    const { resolveToolDescriptor } = await loadDescriptor();
    const descriptor = await resolveToolDescriptor('mcp-slack-g-post_message');

    expect(descriptor.runtime).toBeUndefined();
    expect(descriptor.sandbox).toBeUndefined();
  });
});
