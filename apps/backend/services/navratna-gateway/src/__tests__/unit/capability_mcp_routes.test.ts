import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, msg: string, public code?: string) { super(msg); }
  },
}));

vi.mock('@uaip/config', () => ({
  config: { jwt: { secret: 'test-secret-32-chars-long-enough', accessTokenExpiry: '15m' } },
}));

vi.mock('@uaip/middleware', () => {
  const mockUser = { id: 'user-uuid-1234', email: 'test@example.com', role: 'admin' };
  const passthrough = (app: Elysia) => app.derive(() => ({ user: mockUser }));
  return {
    withRequiredAuth: passthrough,
    withOptionalAuth: passthrough,
    attachAuth: passthrough,
    requireAuth: (app: Elysia) => app,
  };
});

vi.mock('@uaip/shared-services', () => ({
  EventBusService: {
    getInstance: vi.fn().mockReturnValue({
      publish: vi.fn().mockResolvedValue({}),
    }),
  },
}));

vi.mock('../../../../capability-registry/src/services/mcp_client_service.js', () => ({
  MCPClientService: {
    getInstance: vi.fn().mockReturnValue({
      getSystemStatus: vi.fn().mockResolvedValue({ servers: [], tools: [] }),
      getAvailableToolsForAgent: vi.fn().mockReturnValue([]),
      getAllServers: vi.fn().mockReturnValue([]),
      getServerStatus: vi.fn().mockReturnValue(null),
      getToolsByServer: vi.fn().mockReturnValue([]),
      startServer: vi.fn().mockResolvedValue({}),
      stopServer: vi.fn().mockResolvedValue({}),
      restartServer: vi.fn().mockResolvedValue({}),
      recoverServer: vi.fn().mockResolvedValue({}),
      installServer: vi.fn().mockResolvedValue({}),
      uninstallServer: vi.fn().mockResolvedValue({}),
      getToolRecommendations: vi.fn().mockResolvedValue([]),
      getRelatedTools: vi.fn().mockResolvedValue([]),
      getUsageAnalytics: vi.fn().mockResolvedValue({}),
      getGraphStatus: vi.fn().mockResolvedValue({}),
      discoverResources: vi.fn().mockResolvedValue([]),
      discoverPrompts: vi.fn().mockResolvedValue([]),
      attachSingleToolToAgent: vi.fn().mockResolvedValue({ success: true, toolId: 'tool-1', assignment: {} }),
    }),
  },
}));

vi.mock('../../../../capability-registry/src/services/mcp_resource_discovery_service.js', () => ({
  MCPResourceDiscoveryService: {
    getInstance: vi.fn().mockReturnValue({
      discoverAllResources: vi.fn().mockResolvedValue({
        resources: [], prompts: [], tools: [], servers: [],
      }),
      searchResources: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('../../../../capability-registry/src/controllers/capability_controller.js', () => ({
  CapabilityController: vi.fn().mockImplementation(() => ({
    listCapabilities: vi.fn().mockResolvedValue({ success: true, data: { capabilities: [], totalCount: 0 }, meta: { timestamp: new Date(), service: 'test' } }),
    searchCapabilities: vi.fn().mockResolvedValue({ success: true, data: { capabilities: [] }, meta: { timestamp: new Date(), service: 'test' } }),
    getCapability: vi.fn().mockResolvedValue({ success: true, data: { capability: null } }),
    registerCapability: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateCapability: vi.fn().mockResolvedValue({ success: true, data: { capability: { id: 'c1' } } }),
    deleteCapability: vi.fn().mockResolvedValue({ success: true }),
    executeCapability: vi.fn().mockResolvedValue({ success: true, data: { execution: {} } }),
    validateCapability: vi.fn().mockResolvedValue({ success: true, data: { validationResult: { valid: true, issues: [], recommendations: [] } } }),
    getCategories: vi.fn().mockResolvedValue({ success: true, data: { categories: [] }, meta: { timestamp: new Date(), service: 'test' } }),
    getRecommendations: vi.fn().mockResolvedValue({ success: true, data: { recommendations: [] }, meta: { timestamp: new Date(), service: 'test' } }),
    getCapabilityDependencies: vi.fn().mockResolvedValue({ success: true, data: { dependencies: [] } }),
  })),
}));

import { registerCapabilityRoutes } from '../../../../capability-registry/src/routes/capability_routes.js';
import { registerMCPRoutes } from '../../../../capability-registry/src/routes/mcp_routes.js';

function buildCapabilityApp() {
  return new Elysia().use(registerCapabilityRoutes());
}

function buildMCPApp() {
  return new Elysia().use(registerMCPRoutes());
}

function authHeader() {
  return { Authorization: 'Bearer test-token' };
}

describe('Capability Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/capabilities', () => {
    it('returns capability list', async () => {
      const app = buildCapabilityApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/capabilities/', { headers: authHeader() })
      );
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/v1/capabilities/inject', () => {
    it('returns 400 when required fields missing', async () => {
      const app = buildCapabilityApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/capabilities/inject', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: 'A tool without a name' }),
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 400 when inputSchema.type is not object', async () => {
      const app = buildCapabilityApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/capabilities/inject', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'my-tool',
            description: 'Does stuff',
            inputSchema: { type: 'string' },
          }),
        })
      );
      expect(res.status).toBe(400);
    });

    it('registers capability and returns success', async () => {
      const app = buildCapabilityApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/capabilities/inject', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'my-tool',
            description: 'Does great things',
            inputSchema: { type: 'object', properties: {} },
          }),
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});

describe('MCP Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/mcp/test', () => {
    it('returns MCP test response', async () => {
      const app = buildMCPApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/mcp/test')
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/v1/mcp/servers', () => {
    it('returns empty server list', async () => {
      const app = buildMCPApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/mcp/servers')
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/mcp/servers/:serverName/status', () => {
    it('returns 404 when server not found', async () => {
      const app = buildMCPApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/mcp/servers/nonexistent/status')
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('POST /api/v1/mcp/servers/:serverName/start', () => {
    it('returns 403 when caller is not admin', async () => {
      const app = buildMCPApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/mcp/servers/my-server/start', {
          method: 'POST',
          headers: { 'x-user-role': 'user', 'Content-Type': 'application/json' },
        })
      );
      expect(res.status).toBe(403);
    });

    it('returns 200 when admin starts server', async () => {
      const app = buildMCPApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/mcp/servers/my-server/start', {
          method: 'POST',
          headers: { 'x-user-role': 'admin', 'Content-Type': 'application/json' },
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/v1/mcp/search/resources', () => {
    it('returns 400 when query param is missing', async () => {
      const app = buildMCPApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/mcp/search/resources')
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });
});
