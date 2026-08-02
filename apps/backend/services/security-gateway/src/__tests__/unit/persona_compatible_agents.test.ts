import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /compatible-agents answered `[]` for every user because
 * getCompatibleAgents() was a permanent stub. The endpoint is the persona
 * surface's answer to "which agents are mine?", and the authoritative answer
 * now lives in user_agent_assignments.
 *
 * CROSS-PLANE CONSTRAINT: user_agent_assignments is CONTROL plane and agents
 * is INTELLIGENCE plane — physically separable hosts — so the ids are read
 * from the assignment repository first and hydrated on the intelligence pool
 * second. No statement may reference both tables.
 */

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_ORG_ID = '22222222-2222-4222-8222-222222222222';

const { mockFindById, mockFindAgentIdsForUser, mockIntelligenceDb, intelligenceWhereArgs } =
  vi.hoisted(() => ({
    mockFindById: vi.fn(),
    mockFindAgentIdsForUser: vi.fn(),
    mockIntelligenceDb: vi.fn(),
    intelligenceWhereArgs: [] as unknown[],
  }));

vi.mock('@uaip/shared-services', () => ({
  UserService: {
    getInstance: () => ({
      getUserRepository: () => ({ findById: mockFindById, updateUser: vi.fn() }),
    }),
  },
  DefaultUserLLMProviderSeed: class {
    seedForUser = vi.fn();
  },
  UserAgentAssignmentRepository: class {
    findAgentIdsForUser = mockFindAgentIdsForUser;
  },
  getIntelligenceDb: mockIntelligenceDb,
  agents: {
    id: 'id',
    name: 'name',
    description: 'description',
    role: 'role',
    capabilities: 'capabilities',
    isActive: 'isActive',
  },
  inArray: vi.fn((col, vals) => ({ col, vals, op: 'inArray' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@uaip/middleware', async () => {
  const { t } = await import('elysia');
  const attach = (app: unknown) =>
    (app as { derive: (fn: () => unknown) => unknown }).derive(() => ({
      user: {
        id: TEST_USER_ID,
        email: 'test@example.com',
        role: 'user',
        organizationId: TEST_ORG_ID,
      },
    }));
  return { t, withRequiredAuth: attach, withOptionalAuth: attach };
});

const { registerPersonaRoutes } = await import('../../http/persona_elysia.ts');

const app = registerPersonaRoutes();

function mockAgentRows(rows: Record<string, unknown>[]) {
  intelligenceWhereArgs.length = 0;
  mockIntelligenceDb.mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn((predicate: unknown) => {
          intelligenceWhereArgs.push(predicate);
          return Promise.resolve(rows);
        }),
      }),
    }),
  });
}

const call = async (path: string) => {
  const response = await app.handle(new Request(`http://localhost/api/v1/users/persona${path}`));
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: response.status, body };
};

beforeEach(() => {
  vi.clearAllMocks();
  intelligenceWhereArgs.length = 0;
  mockFindById.mockResolvedValue({
    id: TEST_USER_ID,
    userPersona: { workStyle: 'collaborative' },
    behavioralPatterns: {},
  });
  mockFindAgentIdsForUser.mockResolvedValue([]);
  mockAgentRows([]);
});

describe('GET /compatible-agents', () => {
  it('returns the agents actually assigned to the caller', async () => {
    mockFindAgentIdsForUser.mockResolvedValue(['agent-1', 'agent-2']);
    mockAgentRows([
      {
        id: 'agent-1',
        name: 'Josh',
        description: 'Frontend',
        role: 'EXECUTOR',
        capabilities: ['frontend-development'],
      },
      {
        id: 'agent-2',
        name: 'Keegan',
        description: 'Backend',
        role: 'EXECUTOR',
        capabilities: ['backend-development'],
      },
    ]);

    const res = await call('/compatible-agents');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const names = (res.body as { name: string }[]).map((a) => a.name);
    expect(names).toEqual(['Josh', 'Keegan']);
  });

  it('scopes the assignment lookup to the caller and their organization', async () => {
    mockFindAgentIdsForUser.mockResolvedValue(['agent-1']);
    mockAgentRows([{ id: 'agent-1', name: 'Josh', role: 'EXECUTOR', capabilities: [] }]);

    await call('/compatible-agents');

    expect(mockFindAgentIdsForUser).toHaveBeenCalledWith(TEST_USER_ID, TEST_ORG_ID);
  });

  it('never issues a statement referencing both users and agents', async () => {
    mockFindAgentIdsForUser.mockResolvedValue(['agent-1']);
    mockAgentRows([{ id: 'agent-1', name: 'Josh', role: 'EXECUTOR', capabilities: [] }]);

    await call('/compatible-agents');

    const serialized = JSON.stringify(intelligenceWhereArgs);
    expect(serialized).not.toMatch(/user_agent_assignments/i);
    expect(serialized).toContain('agent-1');
  });

  it('returns an empty list without touching the intelligence plane when nothing is assigned', async () => {
    mockFindAgentIdsForUser.mockResolvedValue([]);

    const res = await call('/compatible-agents');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    // inArray(id, []) is a SQL error in some dialects and a full scan risk in
    // others — an empty grant list must short-circuit before the query.
    expect(mockIntelligenceDb).not.toHaveBeenCalled();
  });

  // Verified against production: a user who finished the conversational
  // interview still has userPersona = null, because only the retired
  // questionnaire ever wrote that column. Gating on it returned 400 to the
  // very users whose grants had just been created.
  it('answers from grants even though the legacy persona column is null', async () => {
    mockFindById.mockResolvedValue({ id: TEST_USER_ID, userPersona: null });
    mockFindAgentIdsForUser.mockResolvedValue(['agent-1']);
    mockAgentRows([
      {
        id: 'agent-1',
        name: 'Josh',
        role: 'EXECUTOR',
        description: 'Frontend',
        capabilities: ['frontend-development'],
        isActive: true,
      },
    ]);

    const res = await call('/compatible-agents');

    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((agent) => agent.id)).toEqual(['agent-1']);
  });
});
