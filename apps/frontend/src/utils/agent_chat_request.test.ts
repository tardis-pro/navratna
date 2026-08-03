import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ chat: vi.fn(), getChatHistory: vi.fn() }));

vi.mock('@/api', () => ({
  api: {
    agents: {
      chat: mocks.chat,
      getChatHistory: mocks.getChatHistory,
    },
  },
  coreClient: {},
  gatewayClient: {},
  unwrapEden: vi.fn(),
  edenWithCSRFRetry: vi.fn(),
  edenRequest: vi.fn(),
}));

vi.mock('@/utils/browser_logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { uaipAPI } from './uaip_api';

const AGENT = 'aaaaaaa1-0000-4000-8000-000000000005';
const THREAD = 'bbbbbbb1-0000-4000-8000-000000000007';

/**
 * The facade rebuilds the request field by field, so a field it does not name is
 * silently dropped before it ever reaches the wire — the failure mode that made a
 * saved provider API key vanish. These pin the fields that carry chat routing.
 */
describe('uaipAPI.agents.chat payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chat.mockResolvedValue({ response: 'ok' });
  });

  it('forwards the model override', async () => {
    await uaipAPI.agents.chat(AGENT, { message: 'hi', model: 'dirt-cheap' });

    expect(mocks.chat).toHaveBeenCalledWith(
      AGENT,
      expect.objectContaining({ model: 'dirt-cheap' })
    );
  });

  it('forwards the thread key', async () => {
    await uaipAPI.agents.chat(AGENT, { message: 'hi', threadKey: THREAD });

    expect(mocks.chat).toHaveBeenCalledWith(
      AGENT,
      expect.objectContaining({ threadKey: THREAD })
    );
  });

  it('omits both when absent, so the server keeps its own defaults', async () => {
    await uaipAPI.agents.chat(AGENT, { message: 'hi' });

    const payload = mocks.chat.mock.calls[0][1] as Record<string, unknown>;
    expect('model' in payload).toBe(false);
    expect('threadKey' in payload).toBe(false);
  });
});

describe('uaipAPI.agents.getChatHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChatHistory.mockResolvedValue({ conversationId: null, messages: [] });
  });

  it('passes the thread key through so the right transcript loads', async () => {
    await uaipAPI.agents.getChatHistory(AGENT, 50, THREAD);

    expect(mocks.getChatHistory).toHaveBeenCalledWith(AGENT, 50, THREAD);
  });
});
