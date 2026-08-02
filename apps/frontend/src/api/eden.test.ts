import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/c_s_r_f_service', () => ({
  csrfService: {
    getToken: vi.fn().mockResolvedValue('test-csrf-token'),
    refreshToken: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/config/api_config', () => ({
  resolveApiOrigin: () => 'https://api.test',
}));

import { edenRequest, unwrapEden } from './eden';

type ChatHistory = { conversationId: string | null; messages: { id: string }[] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('edenRequest envelope handling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /**
   * The regression: every Elysia route replies `{success, data}`, but the raw
   * fetch path returned it verbatim, so a caller typed `Promise<ChatHistory>`
   * got the envelope and `history.messages.map` threw on undefined.
   */
  it('unwraps the {success, data} envelope so callers receive their declared type', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        data: { conversationId: 'conv-1', messages: [{ id: 'm-1' }] },
      })
    );

    const history = await edenRequest<ChatHistory>('/api/v1/agents/a-1/chat/messages', {
      method: 'GET',
    });

    expect(history.conversationId).toBe('conv-1');
    expect(history.messages).toHaveLength(1);
  });

  it('returns an unenveloped body untouched', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ conversationId: null, messages: [] })
    );

    const history = await edenRequest<ChatHistory>('/api/v1/agents/a-1/chat/messages', {
      method: 'GET',
    });

    expect(history).toEqual({ conversationId: null, messages: [] });
  });

  it('throws instead of unwrapping when the route reports failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: false, error: 'Failed to load chat history' }, 500)
    );

    await expect(
      edenRequest<ChatHistory>('/api/v1/agents/a-1/chat/messages', { method: 'GET' })
    ).rejects.toThrow('Failed to load chat history');
  });

  it('agrees with the eden-treaty transport on the unwrapped shape', async () => {
    const enveloped = {
      success: true,
      data: { conversationId: 'conv-1', messages: [{ id: 'm-1' }] },
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(enveloped));

    const viaFetch = await edenRequest<ChatHistory>('/api/v1/agents/a-1/chat/messages', {
      method: 'GET',
    });
    const viaTreaty = unwrapEden<ChatHistory>({ data: enveloped as unknown as ChatHistory, error: null });

    expect(viaFetch).toEqual(viaTreaty);
  });
});
