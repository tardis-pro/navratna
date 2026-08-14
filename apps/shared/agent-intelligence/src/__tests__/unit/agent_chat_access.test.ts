import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /agents/:agentId/chat only proved the agent EXISTED — it never proved the
 * caller could reach it. canAccessAgent was imported in the same file and applied
 * to @-mentioned agents, but not to the primary one, so any authenticated user
 * could drive an unassigned agent all the way into LLM generation: that agent's
 * system prompt and tools running under someone else's identity, on your tokens.
 *
 * GET /agents/:agentId/chat/messages had the same hole in a milder form: it
 * returned a successful empty page for an agent the caller cannot see, which
 * confirms the agent exists.
 *
 * Both must answer 404 (not 403) to match GET /agents/:id, so an unreachable
 * agent is indistinguishable from one that does not exist.
 */

const AGENT_ID = '2b96e509-b412-4264-8d3e-b54042a5e3d5';
const USER_ID = '3cc7f2d1-7e20-4455-8a2f-0e2bf635532a';

const { canAccessAgentMock, generateAgentResponseMock, loadHistoryMock } = vi.hoisted(() => ({
  canAccessAgentMock: vi.fn(async () => true),
  generateAgentResponseMock: vi.fn(async () => ({
    agentId: '2b96e509-b412-4264-8d3e-b54042a5e3d5',
    response: 'hello',
    confidence: 1,
    model: 'test-model',
  })),
  loadHistoryMock: vi.fn(async () => [{ id: 'm1', role: 'user', content: 'prior turn' }]),
}));

vi.mock('@uaip/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@uaip/utils')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@uaip/shared-services', () => ({
  canAccessAgent: canAccessAgentMock,
}));

vi.mock('@uaip/middleware', async () => {
  const { t } = await import('elysia');
  const user = {
    id: USER_ID,
    email: 'uat@test.local',
    role: 'user',
    organizationId: '00000000-0000-0000-0000-000000000001',
  };
  return {
    t,
    withNginxAuth: (app: { derive: (fn: () => unknown) => unknown }) => app.derive(() => ({ user })),
    getNginxUser: () => user,
  };
});

const { registerAgentChatRoutes } = await import('../../routes/agent_chat_routes.js');

const agent = {
  id: AGENT_ID,
  name: 'UAT Agent',
  role: 'assistant',
  isActive: true,
  assignedMCPTools: [],
  organizationId: '00000000-0000-0000-0000-000000000001',
};

const makeApp = (options: { agentExists?: boolean } = {}) => {
  const agentIntelligenceService = {
    getAgent: vi.fn(async () => (options.agentExists === false ? null : agent)),
  } as unknown as Parameters<typeof registerAgentChatRoutes>[0];

  const userLLMService = {
    generateAgentResponse: generateAgentResponseMock,
  } as unknown as Parameters<typeof registerAgentChatRoutes>[1];

  const securityService = {
    getApprovalWorkflowRepository: vi.fn(),
    getApprovalDecisionRepository: vi.fn(),
  } as unknown as Parameters<typeof registerAgentChatRoutes>[2];

  // Implements the whole AgentChatPersistence surface — a partial double makes
  // the handler throw and return 500, which would mask the 404 under test.
  const chatPersistence = {
    beginTurn: vi.fn(async () => ({
      conversationId: 'conv-1',
      userMessageId: 'msg-1',
      processingToken: 'tok-1',
      replayedAssistantContent: null,
      history: [],
    })),
    completeTurn: vi.fn(async () => 'assistant-1'),
    completeTurnWithReplies: vi.fn(async () => ['assistant-1']),
    failTurn: vi.fn(async () => undefined),
    loadHistory: loadHistoryMock,
    findOwnedConversation: vi.fn(async () => 'conv-1'),
    findThreadProjectId: vi.fn(async () => null),
    listThreads: vi.fn(async () => []),
    updateOwnedThread: vi.fn(async () => true),
    ensureThreadTitle: vi.fn(async () => undefined),
    ensureParticipants: vi.fn(async () => undefined),
  } as unknown as Parameters<typeof registerAgentChatRoutes>[5];

  return registerAgentChatRoutes(
    agentIntelligenceService,
    userLLMService,
    securityService,
    undefined,
    undefined,
    chatPersistence
  );
};

const call = async (
  path: string,
  init?: { method?: string; body?: unknown; agentExists?: boolean }
) => {
  const app = makeApp({ agentExists: init?.agentExists });
  const hasBody = init?.body !== undefined;
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: init?.method ?? 'GET',
      ...(hasBody
        ? { body: JSON.stringify(init?.body), headers: { 'content-type': 'application/json' } }
        : {}),
    })
  );
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
  canAccessAgentMock.mockReset();
  canAccessAgentMock.mockResolvedValue(true);
  generateAgentResponseMock.mockClear();
  loadHistoryMock.mockClear();
});

describe('POST /agents/:agentId/chat access control', () => {
  it('refuses an agent the caller is not assigned, before any generation', async () => {
    canAccessAgentMock.mockResolvedValue(false);

    const res = await call(`/api/v1/agents/${AGENT_ID}/chat`, {
      method: 'POST',
      body: { message: 'hi' },
    });

    expect(res.status).toBe(404);
    // The critical assertion: no LLM call, so no tokens are spent and the
    // agent's prompt never runs for an unauthorized caller.
    expect(generateAgentResponseMock).not.toHaveBeenCalled();
  });

  it('is byte-identical to the reply for an agent that does not exist', async () => {
    canAccessAgentMock.mockResolvedValue(false);
    const unassigned = await call(`/api/v1/agents/${AGENT_ID}/chat`, {
      method: 'POST',
      body: { message: 'hi' },
    });

    canAccessAgentMock.mockResolvedValue(true);
    const missing = await call(`/api/v1/agents/${AGENT_ID}/chat`, {
      method: 'POST',
      body: { message: 'hi' },
      agentExists: false,
    });

    // The whole point of 404-over-403: the endpoint must not confirm that an
    // agent exists to someone who cannot reach it.
    expect(unassigned.status).toBe(missing.status);
    expect(unassigned.body).toEqual(missing.body);
  });

  it('checks access against the resolved agent id', async () => {
    canAccessAgentMock.mockResolvedValue(false);

    await call(`/api/v1/agents/${AGENT_ID}/chat`, { method: 'POST', body: { message: 'hi' } });

    expect(canAccessAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, role: 'user' }),
      AGENT_ID
    );
  });

  it('allows an assigned agent through to generation', async () => {
    canAccessAgentMock.mockResolvedValue(true);

    const res = await call(`/api/v1/agents/${AGENT_ID}/chat`, {
      method: 'POST',
      body: { message: 'hi' },
    });

    expect(res.status).toBe(200);
    expect(generateAgentResponseMock).toHaveBeenCalled();
  });
});

describe('GET /agents/:agentId/chat/messages access control', () => {
  it('refuses history for an unassigned agent rather than returning an empty page', async () => {
    canAccessAgentMock.mockResolvedValue(false);

    const res = await call(`/api/v1/agents/${AGENT_ID}/chat/messages`);

    expect(res.status).toBe(404);
    expect(loadHistoryMock).not.toHaveBeenCalled();
  });

  it('returns history for an assigned agent', async () => {
    canAccessAgentMock.mockResolvedValue(true);

    const res = await call(`/api/v1/agents/${AGENT_ID}/chat/messages`);

    expect(res.status).toBe(200);
    expect(loadHistoryMock).toHaveBeenCalled();
  });
});
