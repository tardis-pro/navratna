import { describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../providers/open_a_i_provider';
import { TanStackProvider } from '../../providers/tan_stack_provider';

const adapterMocks = vi.hoisted(() => ({
  chat: vi.fn(),
  createAnthropic: vi.fn(() => ({ provider: 'anthropic' })),
  createOllama: vi.fn(() => ({ provider: 'ollama' })),
}));

const openAIMocks = vi.hoisted(() => ({
  create: vi.fn(),
  constructor: vi.fn(function OpenAIClientMock() {
    return { chat: { completions: { create: openAIMocks.create } } };
  }),
}));

vi.mock('@tanstack/ai', () => ({ chat: adapterMocks.chat }));
vi.mock('@tanstack/ai-anthropic', () => ({ createAnthropic: adapterMocks.createAnthropic }));
vi.mock('@tanstack/ai-ollama', () => ({ createOllama: adapterMocks.createOllama }));
vi.mock('openai', () => ({ default: openAIMocks.constructor }));

async function* completedChatStream() {
  yield { type: 'done', usage: { totalTokens: 1 } };
}

describe('OpenAIProvider', () => {
  it('does not fabricate default models when provider model discovery fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })
    );

    const provider = new OpenAIProvider(
      {
        providerId: 'provider-1',
        type: 'openai',
        baseUrl: 'https://ai.example.test/v1',
        apiKey: 'invalid-key',
        defaultModel: 'configured-model',
        retries: 1,
      },
      'Test Provider'
    );

    const models = await provider.getAvailableModels();

    expect(models).toEqual([]);
  });

  it('uses the requested model when a compatible provider has no model catalog endpoint', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/v1/models')) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      return {
        ok: true,
        json: async () => ({
          model: 'provider-model',
          choices: [{ message: { content: 'working response' }, finish_reason: 'stop' }],
          usage: { total_tokens: 7 },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAIProvider(
      {
        providerId: 'provider-2',
        type: 'openai',
        baseUrl: 'https://compatible.example.test/v1',
        apiKey: 'test-key',
        defaultModel: 'provider-model',
        retries: 1,
      },
      'Compatible Provider'
    );

    const response = await provider.generateResponse({
      prompt: 'hello',
      model: 'provider-model',
    });

    expect(response.content).toBe('working response');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://compatible.example.test/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('TanStackProvider credentials', () => {
  it('suppresses the SDK User-Agent for OpenAI requests', async () => {
    openAIMocks.create.mockResolvedValue({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      model: 'gpt-test',
      usage: { total_tokens: 1 },
    });
    const provider = new TanStackProvider({
      providerId: 'user-openai',
      type: 'openai',
      apiKey: 'user-openai-key',
      baseUrl: 'https://openai.example/v1',
      defaultModel: 'gpt-test',
    });

    await provider.generateResponse({ prompt: 'hello' });

    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: 'user-openai-key',
      baseURL: 'https://openai.example/v1',
      defaultHeaders: { 'User-Agent': null },
    });
  });

  it('suppresses the SDK User-Agent for custom OpenAI-compatible providers', async () => {
    openAIMocks.create.mockResolvedValue({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      model: 'custom-model',
      usage: { total_tokens: 1 },
    });
    const provider = new TanStackProvider({
      providerId: 'user-custom',
      type: 'custom',
      apiKey: 'user-custom-key',
      baseUrl: 'https://compatible.example/v1',
      defaultModel: 'custom-model',
    });

    await provider.generateResponse({ prompt: 'hello' });

    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: 'user-custom-key',
      baseURL: 'https://compatible.example/v1',
      defaultHeaders: { 'User-Agent': null },
    });
  });

  it('suppresses the SDK User-Agent for OpenAI-compatible streams', async () => {
    async function* stream() {
      yield { choices: [{ delta: { content: 'hello' } }] };
    }
    openAIMocks.create.mockResolvedValue(stream());
    const provider = new TanStackProvider({
      providerId: 'user-stream',
      type: 'custom',
      apiKey: 'stream-key',
      baseUrl: 'https://compatible.example/v1',
      defaultModel: 'custom-model',
    });

    const chunks = [];
    for await (const chunk of provider.streamResponse({
      prompt: 'hello',
      userId: 'oauth-user',
      streaming: { enabled: true },
    })) chunks.push(chunk);

    expect(chunks).toEqual([{ type: 'token', content: 'hello' }, { type: 'done' }]);
    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: 'stream-key',
      baseURL: 'https://compatible.example/v1',
      defaultHeaders: { 'User-Agent': null },
    });
  });

  it('passes the user API key to Anthropic', async () => {
    adapterMocks.chat.mockReturnValue(completedChatStream());
    const provider = new TanStackProvider({
      providerId: 'user-anthropic',
      type: 'anthropic',
      apiKey: 'user-anthropic-key',
      baseUrl: 'https://api.anthropic.com',
      defaultModel: 'claude-test',
    });

    await provider.generateResponse({ prompt: 'hello' });

    expect(adapterMocks.createAnthropic).toHaveBeenCalledWith('user-anthropic-key');
  });

  it('passes the configured host to Ollama', async () => {
    adapterMocks.chat.mockReturnValue(completedChatStream());
    const provider = new TanStackProvider({
      providerId: 'user-ollama',
      type: 'ollama',
      baseUrl: 'http://ollama.example:11434',
      defaultModel: 'llama-test',
    });

    await provider.generateResponse({ prompt: 'hello' });

    expect(adapterMocks.createOllama).toHaveBeenCalledWith('http://ollama.example:11434');
  });
});
