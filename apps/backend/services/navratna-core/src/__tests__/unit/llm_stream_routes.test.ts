import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Elysia } from 'elysia';

const authenticatedUser = {
  id: '3e301e60-83cd-4bd1-9f1a-78191355f422',
  email: 'oauth-user@example.com',
  role: 'user',
  organizationId: '00000000-0000-0000-0000-000000000001',
};

const streamingMocks = vi.hoisted(() => ({
  registerProvider: vi.fn(),
  startStream: vi.fn(),
}));

const accessMocks = vi.hoisted(() => ({
  canAccessAgent: vi.fn(),
}));

vi.mock('@uaip/shared-services', async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, canAccessAgent: accessMocks.canAccessAgent };
});

vi.mock('@uaip/middleware', () => ({
  withNginxAuth: (app: Elysia) => app.derive(() => ({ user: authenticatedUser })),
  getNginxUser: () => authenticatedUser,
}));

vi.mock('@uaip/llm-service', async (importActual) => {
  const actual = await importActual<typeof import('@uaip/llm-service')>();
  return {
    ...actual,
    StreamingService: {
      getInstance: () => streamingMocks,
    },
  };
});

import {
  LLMService,
  ModelBootstrapService,
  UserLLMService,
} from '@uaip/llm-service';
import type { UserLLMProvider } from '@uaip/llm-service';
import { registerLLMRoutes } from '../../../../llm-service/src/routes/llm_routes';

describe('LLM stream routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    streamingMocks.registerProvider.mockReset();
    streamingMocks.startStream.mockReset().mockResolvedValue('stream-session-id');
    accessMocks.canAccessAgent.mockReset().mockResolvedValue(true);
  });

  it('uses the authenticated request context for an OAuth user stream', async () => {
    const userProvider: UserLLMProvider = {
      id: 'provider-id',
      userId: authenticatedUser.id,
      name: 'OAuth user provider',
      type: 'openai',
      baseUrl: 'https://api.example.test/v1',
      apiKeyEncrypted: 'decrypted-user-key',
      isDefault: true,
      isActive: true,
      defaultModel: 'provider-model',
    };
    const userLLMService = new UserLLMService();
    vi.spyOn(userLLMService, 'selectProviderForAgent').mockResolvedValue(null);
    vi.spyOn(userLLMService, 'getBestProviderForUser').mockResolvedValue(userProvider);

    const app = new Elysia().use(
      registerLLMRoutes(
        LLMService.getInstance(),
        ModelBootstrapService.getInstance(),
        userLLMService
      )
    );

    const response = await app.handle(
      new Request('http://localhost/api/v1/llm/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'hello', agentId: 'agent-id' }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { sessionId: 'stream-session-id', status: 'streaming' },
    });
    expect(userLLMService.getBestProviderForUser).toHaveBeenCalledWith(
      authenticatedUser.id,
      undefined
    );
    expect(streamingMocks.registerProvider).toHaveBeenCalledWith(
      'provider-id',
      expect.objectContaining({ apiKey: 'decrypted-user-key', type: 'openai' })
    );
    expect(streamingMocks.startStream).toHaveBeenCalledWith(
      expect.objectContaining({ userId: authenticatedUser.id, prompt: 'hello' }),
      'provider-id'
    );
  });

  it('refuses to resolve routing for an agent the caller was never assigned', async () => {
    accessMocks.canAccessAgent.mockResolvedValue(false);

    const userLLMService = new UserLLMService();
    const selectForAgent = vi
      .spyOn(userLLMService, 'selectProviderForAgent')
      .mockResolvedValue(null);
    vi.spyOn(userLLMService, 'getBestProviderForUser').mockResolvedValue(null);

    const app = new Elysia().use(
      registerLLMRoutes(
        LLMService.getInstance(),
        ModelBootstrapService.getInstance(),
        userLLMService
      )
    );

    const response = await app.handle(
      new Request('http://localhost/api/v1/llm/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'hello', agentId: 'someone-elses-agent' }),
      })
    );

    // selectProviderForAgent resolves the agent's createdBy and routing config,
    // so reaching it at all is an unassigned-agent read — the same bug class as
    // GET /agents. 404 rather than 403: a 403 confirms the agent exists.
    expect(selectForAgent).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });
});
