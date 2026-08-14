import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The chat route used to send the model ONLY the transcript plus whatever
 * document the CLIENT pasted in — the server never retrieved anything, so a
 * populated knowledge graph contributed zero context (hasContext:false on
 * every turn). These tests pin the wiring: the injected provider is called
 * with the authenticated org (tenant filter), its result is merged into the
 * request context, and a retrieval failure degrades to an ungrounded reply
 * instead of failing the turn.
 */

const AGENT_ID = '2b96e509-b412-4264-8d3e-b54042a5e3d5';
const USER_ID = '3cc7f2d1-7e20-4455-8a2f-0e2bf635532a';
const ORG_ID = '00000000-0000-0000-0000-000000000001';

const { canAccessAgentMock, generateAgentResponseMock } = vi.hoisted(() => ({
  canAccessAgentMock: vi.fn(async () => true),
  generateAgentResponseMock: vi.fn(async () => ({
    content: 'grounded answer',
    model: 'test-model',
    confidence: 1,
  })),
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
  const user = { id: USER_ID, email: 'uat@test.local', role: 'user', organizationId: ORG_ID };
  return {
    t,
    withNginxAuth: (app: { derive: (fn: () => unknown) => unknown }) => app.derive(() => ({ user })),
    getNginxUser: () => user,
  };
});

const { registerAgentChatRoutes, mergeKnowledgeContext } = await import(
  '../../routes/agent_chat_routes.js'
);
type KnowledgeProvider = NonNullable<Parameters<typeof registerAgentChatRoutes>[6]>;

const agent = {
  id: AGENT_ID,
  name: 'UAT Agent',
  role: 'assistant',
  isActive: true,
  assignedMCPTools: [],
  organizationId: ORG_ID,
};

const makeApp = (knowledgeProvider?: KnowledgeProvider) => {
  const agentIntelligenceService = {
    getAgent: vi.fn(async () => agent),
  } as unknown as Parameters<typeof registerAgentChatRoutes>[0];
  const userLLMService = {
    generateAgentResponse: generateAgentResponseMock,
  } as unknown as Parameters<typeof registerAgentChatRoutes>[1];
  const securityService = {
    getApprovalWorkflowRepository: vi.fn(),
    getApprovalDecisionRepository: vi.fn(),
  } as unknown as Parameters<typeof registerAgentChatRoutes>[2];

  return registerAgentChatRoutes(
    agentIntelligenceService,
    userLLMService,
    securityService,
    undefined,
    undefined,
    undefined,
    knowledgeProvider
  );
};

const postChat = async (app: ReturnType<typeof makeApp>, body: Record<string, unknown>) =>
  app.handle(
    new Request(`http://localhost/api/v1/agents/${AGENT_ID}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('knowledge context retrieval on chat turns', () => {
  it('calls the provider with the current message and the authenticated org, and merges the result into the LLM request', async () => {
    const provider = vi.fn(async () => ({
      title: 'Relevant knowledge',
      content: 'The deploy runbook lives in /deploy/fly.',
    }));
    const app = makeApp(provider);

    const response = await postChat(app, { message: 'where is the deploy runbook?' });
    expect(response.status).toBe(200);

    expect(provider).toHaveBeenCalledWith({
      query: 'where is the deploy runbook?',
      agentId: AGENT_ID,
      userId: USER_ID,
      organizationId: ORG_ID,
    });

    const request = generateAgentResponseMock.mock.calls[0]?.[1] as {
      context?: { title: string; content: string; type: string };
    };
    expect(request.context).toBeDefined();
    expect(request.context?.type).toBe('knowledge');
    expect(request.context?.content).toContain('deploy runbook lives in /deploy/fly');
  });

  it('degrades to an ungrounded reply when retrieval throws', async () => {
    const provider = vi.fn(async () => {
      throw new Error('qdrant unreachable');
    });
    const app = makeApp(provider);

    const response = await postChat(app, { message: 'hello' });
    expect(response.status).toBe(200);

    const request = generateAgentResponseMock.mock.calls[0]?.[1] as { context?: unknown };
    expect(request.context).toBeUndefined();
  });

  it('leaves the turn ungrounded when the provider finds nothing', async () => {
    const provider = vi.fn(async () => null);
    const app = makeApp(provider);

    const response = await postChat(app, { message: 'hello' });
    expect(response.status).toBe(200);

    const request = generateAgentResponseMock.mock.calls[0]?.[1] as { context?: unknown };
    expect(request.context).toBeUndefined();
  });
});

describe('mergeKnowledgeContext', () => {
  it('appends retrieved knowledge after the client document, preserving its identity', () => {
    const client = { id: 'doc-1', title: 'My doc', content: 'client text', type: 'document' };
    const merged = mergeKnowledgeContext(client, { title: 'KB', content: 'retrieved text' });
    expect(merged?.id).toBe('doc-1');
    expect(merged?.content).toContain('client text');
    expect(merged?.content).toContain('retrieved text');
    expect(merged?.content.indexOf('client text')).toBeLessThan(
      merged!.content.indexOf('retrieved text')
    );
  });

  it('passes the client context through untouched when nothing was retrieved', () => {
    const client = { id: 'doc-1', title: 'My doc', content: 'client text', type: 'document' };
    expect(mergeKnowledgeContext(client, null)).toBe(client);
  });

  it('returns undefined when there is neither side', () => {
    expect(mergeKnowledgeContext(undefined, null)).toBeUndefined();
  });
});
