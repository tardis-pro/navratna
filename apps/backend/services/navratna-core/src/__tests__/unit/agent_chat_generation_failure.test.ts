import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

/**
 * LLM providers report a failed generation IN BAND — they resolve with
 * `{content:'', finishReason:'error', error:'HTTP 401: Unauthorized'}` instead
 * of throwing. The chat route used to commit that straight through
 * completeTurn, so a provider outage was stored as a successful assistant turn
 * with empty content, and the idempotent replay path then served that blank
 * forever. These tests pin that a failed generation fails the turn.
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
 * The chat route asks canAccessAgent whether the caller is assigned this agent
 * before it will generate anything (added by `fix(security): ... agent access on
 * chat`). That guard resolves through a module-level
 * UserAgentAssignmentRepository singleton which reads the control plane, so in a
 * unit test with no planes initialized it threw
 * "Control plane not initialized. Call initializePlanes()." — and every request
 * in this file answered 500, the happy path included. The generation-failure
 * assertions below then read as product bugs when the request had in fact never
 * reached generation at all.
 *
 * Granting access here is not a hole in the coverage: that the guard DENIES is
 * pinned by agent_route_access_guard.test.ts in this package and by
 * agent-intelligence's agent_chat_access.test.ts, both of which drive it false.
 * Here it is a dependency being satisfied — and it is asserted to have run, so a
 * refactor cannot quietly drop the check from this path and still be green.
 */
vi.mock('@uaip/shared-services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/shared-services')>();
  return { ...actual, canAccessAgent: accessMocks.canAccessAgent };
});

import { registerAgentChatRoutes } from '@uaip/agent-intelligence-core';

const AGENT_ID = 'aaaaaaa1-0000-4000-8000-000000000005';
const CONVERSATION_ID = 'bbbbbbb1-0000-4000-8000-000000000007';
const USER_MESSAGE_ID = 'ccccccc1-0000-4000-8000-000000000009';

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

function sendChat(message: string) {
  return chatApp().handle(
    new Request(`http://localhost/api/v1/agents/${AGENT_ID}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, clientTurnId: 'turn-1' }),
    })
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
  // `state`, not `status` — AgentChatTurnState is discriminated on `state`, and
  // the route reads turn.state to tell a fresh claim from a replay or a lease
  // held elsewhere. The old `status` key only worked because an undefined
  // discriminant falls past both other branches into the claim path.
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
  persistenceMocks.failTurn.mockResolvedValue(undefined);
  persistenceMocks.ensureThreadTitle.mockResolvedValue(undefined);
  persistenceMocks.ensureParticipants.mockResolvedValue(undefined);
  persistenceMocks.completeTurnWithReplies.mockResolvedValue(['assistant-message-id']);
});

describe('agent chat rejects an in-band generation failure', () => {
  it('does not persist an assistant turn when the provider reports an error', async () => {
    llmMocks.generateAgentResponse.mockResolvedValue({
      content: '',
      model: 'ultra-smart-reliable',
      finishReason: 'error',
      error: 'HTTP 401: Unauthorized',
    });

    const res = await sendChat('hello');

    expect(res.status).toBe(502);
    expect(persistenceMocks.completeTurnWithReplies).not.toHaveBeenCalled();
    expect(persistenceMocks.failTurn).toHaveBeenCalledWith(USER_MESSAGE_ID, 'token-1');
  });

  it('surfaces the provider error to the caller instead of an empty success', async () => {
    llmMocks.generateAgentResponse.mockResolvedValue({
      content: '',
      model: 'ultra-smart-reliable',
      finishReason: 'error',
      error: 'HTTP 401: Unauthorized',
    });

    const body = (await (await sendChat('hello')).json()) as Record<string, unknown>;

    expect(body['message']).toBe('HTTP 401: Unauthorized');
  });

  it('rejects an empty reply even when no error field is set', async () => {
    llmMocks.generateAgentResponse.mockResolvedValue({
      content: '   ',
      model: 'gpt-4o-mini',
      finishReason: 'stop',
    });

    const res = await sendChat('hello');

    expect(res.status).toBe(502);
    expect(persistenceMocks.completeTurnWithReplies).not.toHaveBeenCalled();
  });

  it('accepts a tool-only turn that legitimately has no prose', async () => {
    llmMocks.generateAgentResponse.mockResolvedValue({
      content: '',
      model: 'gpt-4o-mini',
      finishReason: 'tool_calls',
      toolsExecuted: [{ toolId: 't-1', toolName: 'search', success: true }],
    });

    const res = await sendChat('search for something');

    expect(res.status).toBe(200);
    expect(persistenceMocks.completeTurnWithReplies).toHaveBeenCalled();
    expect(persistenceMocks.failTurn).not.toHaveBeenCalled();
  });

  it('persists a normal reply unchanged', async () => {
    llmMocks.generateAgentResponse.mockResolvedValue({
      content: 'PINEAPPLE',
      model: 'gpt-4o-mini',
      finishReason: 'stop',
    });

    const res = await sendChat('say pineapple');

    expect(res.status).toBe(200);
    expect(persistenceMocks.completeTurnWithReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        replies: [expect.objectContaining({ content: 'PINEAPPLE' })],
      })
    );
    expect(persistenceMocks.failTurn).not.toHaveBeenCalled();
  });

  // canAccessAgent is stubbed above so these tests can reach generation. Pinning
  // that it was still CALLED keeps that stub honest: without this, deleting the
  // guard from the route would leave this file green.
  it('still asks the assignment guard before generating', async () => {
    llmMocks.generateAgentResponse.mockResolvedValue({
      content: 'PINEAPPLE',
      model: 'gpt-4o-mini',
      finishReason: 'stop',
    });

    await sendChat('say pineapple');

    expect(accessMocks.canAccessAgent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: authState.user.id, role: authState.user.role }),
      AGENT_ID
    );
  });
});
