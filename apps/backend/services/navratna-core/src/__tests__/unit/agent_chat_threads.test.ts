import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

/**
 * A conversation used to be pinned to (organization, user, agent), so a user
 * could only ever have ONE thread per agent. These tests pin the thread routes
 * and, most importantly, that a client which sends no threadKey still lands on
 * its existing conversation instead of silently starting an empty one.
 */

const authState = vi.hoisted(() => ({
  user: {
    id: 'user-uuid-1234',
    email: 'member@example.com',
    role: 'user',
    organizationId: 'org-uuid-1234',
  },
}));

vi.mock('@uaip/middleware', () => {
  const passthrough = (app: Elysia) => app.derive(() => ({ user: authState.user }));
  return {
    withRequiredAuth: passthrough,
    withOptionalAuth: passthrough,
    withAdminGuard: passthrough,
    withNginxAuth: passthrough,
    attachAuth: passthrough,
    getNginxUser: () => authState.user,
    requireAuth: (app: Elysia) => app,
  };
});

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  isRecord: (val: unknown) => typeof val === 'object' && val !== null && !Array.isArray(val),
}));

const accessMocks = vi.hoisted(() => ({ canAccessAgent: vi.fn() }));

/**
 * Both POST /:agentId/chat and GET /:agentId/chat/messages ask canAccessAgent
 * whether the caller is assigned this agent before doing anything (added by
 * `fix(security): ... agent access on chat`). That guard resolves through a
 * module-level UserAgentAssignmentRepository singleton which reads the control
 * plane, so in a unit test with no planes initialized it threw
 * "Control plane not initialized. Call initializePlanes()." and every
 * agent-scoped request here answered 500 before touching persistence.
 *
 * Worth naming: the 500 made 'does not title a thread whose generation failed'
 * pass for the wrong reason — nothing was titled because nothing ran at all.
 * That assertion only becomes real once the guard is satisfied.
 *
 * Granting access is not a hole in the coverage: that the guard DENIES is pinned
 * by agent_route_access_guard.test.ts here and by agent-intelligence's
 * agent_chat_access.test.ts.
 */
vi.mock('@uaip/shared-services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/shared-services')>();
  return { ...actual, canAccessAgent: accessMocks.canAccessAgent };
});

import { registerAgentChatRoutes } from '@uaip/agent-intelligence-core';

const AGENT_ID = 'aaaaaaa1-0000-4000-8000-000000000005';
const CONVERSATION_ID = 'bbbbbbb1-0000-4000-8000-000000000007';
const USER_MESSAGE_ID = 'ccccccc1-0000-4000-8000-000000000009';
const THREAD_KEY = 'ddddddd1-0000-4000-8000-00000000000b';

const agentMocks = { getAgent: vi.fn() };
const llmMocks = { generateAgentResponse: vi.fn() };
const securityMocks = {
  getApprovalWorkflowRepository: () => ({ findById: vi.fn(), update: vi.fn() }),
  getApprovalDecisionRepository: () => ({ create: vi.fn() }),
};
const persistenceMocks = {
  beginTurn: vi.fn(),
  completeTurn: vi.fn(),
  failTurn: vi.fn(),
  loadHistory: vi.fn(),
  findOwnedConversation: vi.fn(),
  findThreadProjectId: vi.fn(),
  listThreads: vi.fn(),
  updateOwnedThread: vi.fn(),
  ensureThreadTitle: vi.fn(),
  ensureParticipants: vi.fn(),
  completeTurnWithReplies: vi.fn(),
};

function chatApp() {
  return new Elysia().use(
    registerAgentChatRoutes(
      agentMocks as never,
      llmMocks as never,
      securityMocks as never,
      undefined,
      undefined,
      persistenceMocks as never
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  accessMocks.canAccessAgent.mockResolvedValue(true);
  agentMocks.getAgent.mockResolvedValue({
    id: AGENT_ID,
    name: 'Taniye',
    role: 'assistant',
    assignedMCPTools: [],
  });
  persistenceMocks.beginTurn.mockResolvedValue({
    state: 'claimed',
    claim: {
      conversationId: CONVERSATION_ID,
      userMessageId: USER_MESSAGE_ID,
      processingToken: 'token-1',
    },
  });
  persistenceMocks.loadHistory.mockResolvedValue([]);
  persistenceMocks.completeTurn.mockResolvedValue('assistant-message-id');
  persistenceMocks.ensureThreadTitle.mockResolvedValue(undefined);
  persistenceMocks.ensureParticipants.mockResolvedValue(undefined);
  persistenceMocks.completeTurnWithReplies.mockResolvedValue(['assistant-message-id']);
  persistenceMocks.listThreads.mockResolvedValue([]);
  persistenceMocks.updateOwnedThread.mockResolvedValue(true);
  llmMocks.generateAgentResponse.mockResolvedValue({
    content: 'hello',
    model: 'dirt-cheap',
    finishReason: 'stop',
  });
});

describe('POST /:agentId/chat thread routing', () => {
  it('forwards an explicit threadKey, which is what opens a second thread', async () => {
    await chatApp().handle(
      new Request(`http://localhost/api/v1/agents/${AGENT_ID}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hi', clientTurnId: 'turn-1', threadKey: THREAD_KEY }),
      })
    );

    expect(persistenceMocks.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({ threadKey: THREAD_KEY, agentId: AGENT_ID })
    );
  });

  it('leaves threadKey undefined when a client omits it, so legacy history resolves', async () => {
    await chatApp().handle(
      new Request(`http://localhost/api/v1/agents/${AGENT_ID}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hi', clientTurnId: 'turn-1' }),
      })
    );

    // Undefined, NOT a fresh uuid: the persistence layer falls back to the agent
    // id, which is where a pre-threads client's conversation already lives.
    expect(persistenceMocks.beginTurn).toHaveBeenCalledWith(
      expect.objectContaining({ threadKey: undefined })
    );
  });

  it('derives a title only after the reply is stored', async () => {
    await chatApp().handle(
      new Request(`http://localhost/api/v1/agents/${AGENT_ID}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'what is the weather', clientTurnId: 'turn-1' }),
      })
    );

    expect(persistenceMocks.ensureThreadTitle).toHaveBeenCalledWith(
      CONVERSATION_ID,
      'what is the weather'
    );
    const titleOrder = persistenceMocks.ensureThreadTitle.mock.invocationCallOrder[0];
    const completeOrder = persistenceMocks.completeTurnWithReplies.mock.invocationCallOrder[0];
    expect(titleOrder).toBeGreaterThan(completeOrder);
  });

  it('does not title a thread whose generation failed', async () => {
    llmMocks.generateAgentResponse.mockResolvedValue({
      content: '',
      finishReason: 'error',
      error: 'HTTP 401: Unauthorized',
    });

    await chatApp().handle(
      new Request(`http://localhost/api/v1/agents/${AGENT_ID}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'hi', clientTurnId: 'turn-1' }),
      })
    );

    expect(persistenceMocks.ensureThreadTitle).not.toHaveBeenCalled();
  });
});

describe('GET /chat/threads', () => {
  it('lists only the authenticated user’s threads', async () => {
    persistenceMocks.listThreads.mockResolvedValue([
      { id: CONVERSATION_ID, threadKey: THREAD_KEY, agentIds: [AGENT_ID], title: 'Weather' },
    ]);

    const res = await chatApp().handle(
      new Request('http://localhost/api/v1/agents/chat/threads')
    );
    const body = (await res.json()) as { data: { threads: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.data.threads).toHaveLength(1);
    // Scope comes from the session, never from a query parameter.
    expect(persistenceMocks.listThreads).toHaveBeenCalledWith({
      organizationId: authState.user.organizationId,
      userId: authState.user.id,
    });
  });

  it('is not shadowed by the /:agentId routes', async () => {
    const res = await chatApp().handle(
      new Request('http://localhost/api/v1/agents/chat/threads')
    );

    // A literal segment must win over the parameterised sibling, otherwise this
    // would be handled as agentId="chat" and never reach the thread list.
    expect(res.status).toBe(200);
    expect(agentMocks.getAgent).not.toHaveBeenCalled();
  });
});

describe('PATCH /chat/threads/:conversationId', () => {
  it('renames a thread the caller owns', async () => {
    const res = await chatApp().handle(
      new Request(`http://localhost/api/v1/agents/chat/threads/${CONVERSATION_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Renamed' }),
      })
    );

    expect(res.status).toBe(200);
    expect(persistenceMocks.updateOwnedThread).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        userId: authState.user.id,
        title: 'Renamed',
      })
    );
  });

  it('answers 404 when the thread is not the caller’s', async () => {
    persistenceMocks.updateOwnedThread.mockResolvedValue(false);

    const res = await chatApp().handle(
      new Request(`http://localhost/api/v1/agents/chat/threads/${CONVERSATION_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Hijack' }),
      })
    );

    // 404 rather than 403: a non-owner must not be able to tell whether the
    // thread exists at all.
    expect(res.status).toBe(404);
  });

  it('rejects a patch that carries no supported field', async () => {
    const res = await chatApp().handle(
      new Request(`http://localhost/api/v1/agents/chat/threads/${CONVERSATION_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nonsense: true }),
      })
    );

    expect(res.status).toBe(400);
    expect(persistenceMocks.updateOwnedThread).not.toHaveBeenCalled();
  });
});

describe('GET /:agentId/chat/messages', () => {
  it('reads the thread named by threadKey', async () => {
    persistenceMocks.findOwnedConversation.mockResolvedValue(CONVERSATION_ID);

    await chatApp().handle(
      new Request(
        `http://localhost/api/v1/agents/${AGENT_ID}/chat/messages?threadKey=${THREAD_KEY}`
      )
    );

    expect(persistenceMocks.findOwnedConversation).toHaveBeenCalledWith(
      expect.objectContaining({ threadKey: THREAD_KEY, userId: authState.user.id })
    );
  });
});
