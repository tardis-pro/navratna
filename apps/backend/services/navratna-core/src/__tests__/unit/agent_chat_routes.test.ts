import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

vi.mock('@uaip/middleware', () => {
  const mockUser = { id: 'user-uuid-1234', email: 'test@example.com', role: 'user' };
  const passthrough = (app: Elysia) => app.derive(() => ({ user: mockUser }));
   return {
     withRequiredAuth: passthrough,
     withOptionalAuth: passthrough,
     withAdminGuard: passthrough,
     withNginxAuth: passthrough,
     attachAuth: passthrough,
     requireAuth: (app: Elysia) => app,
   };
 });

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  isRecord: (val: unknown) => typeof val === 'object' && val !== null && !Array.isArray(val),
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
  },
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
  },
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, msg: string, public code?: string) { super(msg); }
  },
}));

vi.mock('@uaip/types', async (importActual) => {
  // Spread the real @uaip/types so all runtime enums (PersonaStatus, PersonaVisibility,
  // KnowledgeType, SourceType, etc.) needed by the transitive -core chat route chain
  // resolve correctly, instead of maintaining a hand-listed partial mock.
  const actual = await importActual<typeof import('@uaip/types')>();
  return { ...actual };
});

import { registerAgentChatRoutes } from '@uaip/agent-intelligence-core';

function authHeader() {
  return { Authorization: 'Bearer test-token' };
}

function makeAgentService(agent: Record<string, unknown> | null) {
  return { getAgent: vi.fn().mockResolvedValue(agent) };
}

function makeUserLLMService(response: unknown) {
  return { generateAgentResponse: vi.fn().mockResolvedValue(response) };
}

function makeSecurityService() {
  return {
    getApprovalWorkflowRepository: vi.fn().mockReturnValue({
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    }),
    getApprovalDecisionRepository: vi.fn().mockReturnValue({
      create: vi.fn().mockResolvedValue({}),
    }),
  };
}

describe('Agent Chat Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/agents/:agentId/chat', () => {
    it('returns 404 when agent does not exist', async () => {
      const app = new Elysia().use(
        registerAgentChatRoutes(
          makeAgentService(null) as never,
          makeUserLLMService({}) as never,
          makeSecurityService() as never
        )
      );

      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/nonexistent/chat', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'hello' }),
        })
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    it('sends message and returns LLM response', async () => {
      const agent = { id: 'a1', name: 'Alpha', role: 'analyst', capabilities: [], configuration: {} };
      const llmResponse = { content: 'I am Alpha. How can I help?', model: 'gpt-4' };
      const userLLMService = makeUserLLMService(llmResponse);

      const app = new Elysia().use(
        registerAgentChatRoutes(
          makeAgentService(agent) as never,
          userLLMService as never,
          makeSecurityService() as never
        )
      );

      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a1/chat', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Hello Alpha' }),
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(userLLMService.generateAgentResponse).toHaveBeenCalledWith(
        'user-uuid-1234',
        expect.objectContaining({
          agent: expect.objectContaining({ id: 'a1' }),
          messages: expect.arrayContaining([
            expect.objectContaining({ content: 'Hello Alpha', type: 'user' }),
          ]),
        })
      );
    });

    it('sends messages array and returns LLM response', async () => {
      const agent = { id: 'a1', name: 'Alpha', role: 'analyst' };
      const llmResponse = { content: 'Sure!', model: 'gpt-4' };
      const userLLMService = makeUserLLMService(llmResponse);

      const app = new Elysia().use(
        registerAgentChatRoutes(
          makeAgentService(agent) as never,
          userLLMService as never,
          makeSecurityService() as never
        )
      );

      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a1/chat', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { content: 'What can you do?', type: 'user' },
            ],
          }),
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 400 when no message provided', async () => {
      const agent = { id: 'a1', name: 'Alpha', role: 'analyst' };

      const app = new Elysia().use(
        registerAgentChatRoutes(
          makeAgentService(agent) as never,
          makeUserLLMService({}) as never,
          makeSecurityService() as never
        )
      );

      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a1/chat', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Message or messages array is required');
    });

    it('returns 500 when LLM service throws', async () => {
      const agent = { id: 'a1', name: 'Alpha', role: 'analyst' };
      const userLLMService = { generateAgentResponse: vi.fn().mockRejectedValue(new Error('LLM offline')) };

      const app = new Elysia().use(
        registerAgentChatRoutes(
          makeAgentService(agent) as never,
          userLLMService as never,
          makeSecurityService() as never
        )
      );

      const res = await app.handle(
        new Request('http://localhost/api/v1/agents/a1/chat', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'test' }),
        })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('LLM offline');
    });
  });
});
