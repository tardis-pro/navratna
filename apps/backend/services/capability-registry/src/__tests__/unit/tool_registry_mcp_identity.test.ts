import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mocks } = vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
  return {
    mocks: {
      createTool: vi.fn(),
      updateTool: vi.fn(),
      findToolByName: vi.fn(),
    },
  };
});

vi.mock('@uaip/shared-services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/shared-services')>();
  return {
    ...actual,
    ToolService: {
      getInstance: () => ({
        createTool: mocks.createTool,
        updateTool: mocks.updateTool,
        findToolByName: mocks.findToolByName,
      }),
    },
  };
});

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

const { ToolRegistry } = await import('../../services/tool_registry');

const registryWithStubbedService = () => {
  const registry = new ToolRegistry();
  (registry as unknown as { toolService: unknown }).toolService = {
    createTool: mocks.createTool,
    updateTool: mocks.updateTool,
    findToolByName: mocks.findToolByName,
  };
  return registry;
};

const discoveredTool = (overrides: Record<string, unknown> = {}) => ({
  id: 'mcp-calculator-add',
  name: 'mcp-calculator-add',
  displayName: 'add',
  description: 'Adds two numbers',
  category: 'api',
  version: '1.0.0',
  isEnabled: true,
  parameters: { type: 'object', properties: { a: { type: 'number' } } },
  ...overrides,
});

beforeEach(() => {
  mocks.createTool.mockReset();
  mocks.updateTool.mockReset();
  mocks.findToolByName.mockReset();
  mocks.createTool.mockResolvedValue({ id: 'generated-uuid' });
  mocks.updateTool.mockResolvedValue({ id: 'existing-uuid' });
  mocks.findToolByName.mockResolvedValue(null);
});

describe('tool.register event delivery', () => {
  const busEnvelope = (payload: unknown) => ({
    id: 'evt_1',
    type: 'tool.register',
    source: 'mcp-client-service',
    data: payload,
    timestamp: new Date(),
    version: '1.0.0',
  });

  const handle = async (event: unknown) => {
    const registry = registryWithStubbedService();
    await (
      registry as unknown as { handleToolRegistration: (e: unknown) => Promise<void> }
    ).handleToolRegistration(event);
    return registry;
  };

  it('registers a tool delivered inside the bus envelope', async () => {
    await handle(busEnvelope({ tool: discoveredTool(), source: 'mcp-discovery' }));

    expect(mocks.createTool).toHaveBeenCalledTimes(1);
    expect(mocks.createTool.mock.calls[0][0].name).toBe('mcp-calculator-add');
  });

  it('still accepts a payload passed without an envelope', async () => {
    await handle({ tool: discoveredTool(), source: 'mcp-discovery' });

    expect(mocks.createTool).toHaveBeenCalledTimes(1);
    expect(mocks.createTool.mock.calls[0][0].name).toBe('mcp-calculator-add');
  });

  it('never creates a nameless row when the event carries no tool', async () => {
    await handle(busEnvelope({ source: 'mcp-discovery' }));

    expect(mocks.createTool).not.toHaveBeenCalled();
  });

  it('ignores an event whose tool has no name', async () => {
    await handle(busEnvelope({ tool: { description: 'no name' }, source: 'x' }));

    expect(mocks.createTool).not.toHaveBeenCalled();
  });
});

describe('registerTool — MCP tool identity', () => {
  it('persists the mcp- dispatch key as the row name', async () => {
    await registryWithStubbedService().registerTool(discoveredTool());

    expect(mocks.createTool).toHaveBeenCalledTimes(1);
    expect(mocks.createTool.mock.calls[0][0].name).toBe('mcp-calculator-add');
  });

  it('keeps the raw MCP tool name as the human display name', async () => {
    await registryWithStubbedService().registerTool(discoveredTool());

    expect(mocks.createTool.mock.calls[0][0].displayName).toBe('add');
  });

  it('falls back to name for displayName when none is supplied', async () => {
    await registryWithStubbedService().registerTool(
      discoveredTool({ displayName: undefined })
    );

    expect(mocks.createTool.mock.calls[0][0].displayName).toBe('mcp-calculator-add');
  });

  it('keeps two servers exposing the same tool name distinct', async () => {
    const registry = registryWithStubbedService();

    await registry.registerTool(
      discoveredTool({ id: 'mcp-github-search', name: 'mcp-github-search', displayName: 'search' })
    );
    await registry.registerTool(
      discoveredTool({ id: 'mcp-slack-search', name: 'mcp-slack-search', displayName: 'search' })
    );

    const names = mocks.createTool.mock.calls.map((call) => call[0].name);
    expect(names).toEqual(['mcp-github-search', 'mcp-slack-search']);
    expect(new Set(names).size).toBe(2);
  });
});

describe('registerTool — idempotency', () => {
  it('updates instead of inserting when the tool already exists', async () => {
    mocks.findToolByName.mockResolvedValue({ id: 'existing-uuid', name: 'mcp-calculator-add' });

    const returned = await registryWithStubbedService().registerTool(discoveredTool());

    expect(mocks.createTool).not.toHaveBeenCalled();
    expect(mocks.updateTool).toHaveBeenCalledWith('existing-uuid', expect.any(Object));
    expect(returned).toBe('existing-uuid');
  });

  it('refreshes the schema on re-discovery', async () => {
    mocks.findToolByName.mockResolvedValue({ id: 'existing-uuid' });
    const newSchema = { type: 'object', properties: { b: { type: 'string' } } };

    await registryWithStubbedService().registerTool(
      discoveredTool({ parameters: newSchema, description: 'Updated description' })
    );

    const patch = mocks.updateTool.mock.calls[0][1];
    expect(patch.parameters).toEqual(newSchema);
    expect(patch.description).toBe('Updated description');
  });

  it('survives repeated discovery passes without a unique violation', async () => {
    const registry = registryWithStubbedService();

    await registry.registerTool(discoveredTool());
    mocks.findToolByName.mockResolvedValue({ id: 'generated-uuid' });
    await registry.registerTool(discoveredTool());
    await registry.registerTool(discoveredTool());

    expect(mocks.createTool).toHaveBeenCalledTimes(1);
    expect(mocks.updateTool).toHaveBeenCalledTimes(2);
  });
});
