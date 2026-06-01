import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolGraphDatabase } from '../../database/tool_graph_database';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

type NodeRecord = {
  id: string;
  tenantId: string;
  name?: string;
  label: string;
};
type OwnsRecord = { tenantId: string; nodeId: string; nodeLabel: string };
type TenantRecord = { id: string; name: string };

type InMemoryStore = {
  nodes: NodeRecord[];
  owns: OwnsRecord[];
  tenants: TenantRecord[];
};

const makeNeo4jMock = () => {
  const store: InMemoryStore = {
    nodes: [],
    owns: [],
    tenants: [],
  };

  const sessionRun = vi.fn(async (cypher: string, params: Record<string, unknown> = {}) => {
    const q = cypher.replace(/\s+/g, ' ').trim();

    if (q === 'RETURN 1 as test') {
      return { records: [{ get: (k: string) => (k === 'test' ? 1 : null) }] };
    }

    if (q.includes('MERGE (t:Tenant {id: $orgId})')) {
      const orgId = String(params.orgId);
      const orgName = String(params.orgName);
      const existing = store.tenants.find((t) => t.id === orgId);
      if (existing) {
        existing.name = orgName;
      } else {
        store.tenants.push({ id: orgId, name: orgName });
      }
      return { records: [] };
    }

    if (q.includes('MATCH (t:Tenant {id: $orgId})') && q.includes('MERGE (t)-[:OWNS]->(n)')) {
      const orgId = String(params.orgId);
      const nodeId = String(params.nodeId);
      const labelMatch = q.match(/MATCH \(n:(\w+) \{id: \$nodeId\}\)/);
      const nodeLabel = labelMatch?.[1] ?? 'Unknown';
      const alreadyOwned = store.owns.some(
        (o) => o.tenantId === orgId && o.nodeId === nodeId && o.nodeLabel === nodeLabel
      );
      if (!alreadyOwned) {
        store.owns.push({ tenantId: orgId, nodeId, nodeLabel });
      }
      return { records: [] };
    }

    if (q.includes('MERGE (t:Tool {id: $id})')) {
      const id = String(params.id);
      const tenantId = String(params.tenantId);
      const name = params.name ? String(params.name) : '';
      const existing = store.nodes.findIndex((n) => n.id === id && n.label === 'Tool');
      if (existing >= 0) {
        store.nodes[existing] = { id, tenantId, name, label: 'Tool' };
      } else {
        store.nodes.push({ id, tenantId, name, label: 'Tool' });
      }
      return { records: [] };
    }

    if (q.includes('MERGE (s:MCPServer {id: $id})')) {
      const id = String(params.id);
      const tenantId = String(params.tenantId);
      const name = params.name ? String(params.name) : '';
      const existing = store.nodes.findIndex((n) => n.id === id && n.label === 'MCPServer');
      if (existing >= 0) {
        store.nodes[existing] = { id, tenantId, name, label: 'MCPServer' };
      } else {
        store.nodes.push({ id, tenantId, name, label: 'MCPServer' });
      }
      return { records: [] };
    }

    if (q.includes('MERGE (a:Agent {id: $id})')) {
      const id = String(params.id);
      const tenantId = String(params.tenantId);
      const name = params.name ? String(params.name) : '';
      const existing = store.nodes.findIndex((n) => n.id === id && n.label === 'Agent');
      if (existing >= 0) {
        store.nodes[existing] = { id, tenantId, name, label: 'Agent' };
      } else {
        store.nodes.push({ id, tenantId, name, label: 'Agent' });
      }
      return { records: [] };
    }

    if (q.includes('-[r')  && q.includes(']-(t2:Tool)') && q.includes('t1.tenantId = $tenantId')) {
      const tenantId = String(params.tenantId);
      const toolId = String(params.toolId ?? '');
      const matches = store.nodes
        .filter((n) => n.label === 'Tool' && n.tenantId === tenantId && n.id !== toolId)
        .map((n) => ({ get: (k: string) => (n as Record<string, unknown>)[k] ?? null }));
      return { records: matches };
    }

    return { records: [] };
  });

  const session = {
    run: sessionRun,
    close: vi.fn().mockResolvedValue(undefined),
  };

  const driver = {
    session: vi.fn().mockReturnValue(session),
    close: vi.fn().mockResolvedValue(undefined),
    verifyConnectivity: vi.fn().mockResolvedValue(undefined),
  };

  return { store, session, driver, sessionRun };
};

vi.mock('neo4j-driver', () => {
  let currentDriver: ReturnType<typeof makeNeo4jMock>['driver'] | null = null;

  const neo4j = {
    driver: vi.fn((_uri: unknown, _auth: unknown, _opts: unknown) => {
      if (!currentDriver) {
        throw new Error('Test driver not initialised — call setCurrentDriver first');
      }
      return currentDriver;
    }),
    auth: {
      basic: vi.fn().mockReturnValue({ scheme: 'basic', principal: 'test', credentials: 'test' }),
    },
    setCurrentDriver: (d: ReturnType<typeof makeNeo4jMock>['driver']) => {
      currentDriver = d;
    },
  };
  return { default: neo4j };
});

async function makeDb(driver: ReturnType<typeof makeNeo4jMock>['driver']): Promise<ToolGraphDatabase> {
  const neo4j = await import('neo4j-driver');
  (neo4j.default as unknown as { setCurrentDriver: (d: unknown) => void }).setCurrentDriver(driver);

  const db = new ToolGraphDatabase({
    uri: 'bolt://mock:7687',
    user: 'test',
    password: 'test',
    database: 'neo4j',
    maxConnectionPoolSize: 10,
    connectionTimeout: 1000,
  });

  (db as unknown as { isConnected: boolean }).isConnected = true;
  return db;
}

describe('Neo4j tenant isolation', () => {
  let mock: ReturnType<typeof makeNeo4jMock>;
  let db: ToolGraphDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    mock = makeNeo4jMock();
    db = await makeDb(mock.driver);
  });

  it('T1: tool created under tenantA is invisible to tenantB queries', async () => {
    await db.createToolNode(
      {
        id: 'tool-alpha',
        name: 'Alpha',
        category: 'api' as never,
        tags: [],
        securityLevel: 'safe' as never,
        description: '',
        version: '1.0.0',
        parameters: {},
        returnType: {},
        examples: [],
        requiresApproval: false,
        dependencies: [],
        isEnabled: true,
        executionTimeEstimate: 0,
        costEstimate: 0,
        author: 'test',
      },
      TENANT_A
    );

    const resultsB = await db.getRelatedTools('tool-alpha', TENANT_B);
    expect(resultsB).toHaveLength(0);
  });

  it('T2: tools created under tenantA are found when querying tenantA', async () => {
    await Promise.all(
      ['tool-1', 'tool-2'].map((id) =>
        db.createToolNode(
          {
            id,
            name: `Tool ${id}`,
            category: 'api' as never,
            tags: [],
            securityLevel: 'safe' as never,
            description: '',
            version: '1.0.0',
            parameters: {},
            returnType: {},
            examples: [],
            requiresApproval: false,
            dependencies: [],
            isEnabled: true,
            executionTimeEstimate: 0,
            costEstimate: 0,
            author: 'test',
          },
          TENANT_A
        )
      )
    );

    const toolNodes = mock.store.nodes.filter(
      (n) => n.label === 'Tool' && n.tenantId === TENANT_A
    );
    expect(toolNodes.length).toBeGreaterThanOrEqual(2);
  });

  it('T3: createTenantNode creates a :Tenant node in the store', async () => {
    await db.createTenantNode(TENANT_A, 'Tenant Alpha');

    const tenant = mock.store.tenants.find((t) => t.id === TENANT_A);
    expect(tenant).toBeDefined();
    expect(tenant?.name).toBe('Tenant Alpha');
  });

  it('T4: createToolNode triggers OWNS relationship between :Tenant and :Tool', async () => {
    await db.createTenantNode(TENANT_A, 'Tenant Alpha');
    await db.createToolNode(
      {
        id: 'owned-tool',
        name: 'Owned Tool',
        category: 'api' as never,
        tags: [],
        securityLevel: 'safe' as never,
        description: '',
        version: '1.0.0',
        parameters: {},
        returnType: {},
        examples: [],
        requiresApproval: false,
        dependencies: [],
        isEnabled: true,
        executionTimeEstimate: 0,
        costEstimate: 0,
        author: 'test',
      },
      TENANT_A
    );

    const owns = mock.store.owns.find(
      (o) => o.tenantId === TENANT_A && o.nodeId === 'owned-tool' && o.nodeLabel === 'Tool'
    );
    expect(owns).toBeDefined();
  });

  it('T5: createToolNode without tenantId is a TypeScript compile error (type-level assertion)', () => {
    type CreateToolNodeParams = Parameters<typeof db.createToolNode>;
    type TenantIdParam = CreateToolNodeParams[1];

    const isRequiredString: TenantIdParam extends string ? true : false = true;
    expect(isRequiredString).toBe(true);

    const paramCount: CreateToolNodeParams['length'] extends 2 ? true : false = true;
    expect(paramCount).toBe(true);
  });
});
