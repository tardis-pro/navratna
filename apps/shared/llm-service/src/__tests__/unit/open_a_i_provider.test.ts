import { describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../providers/open_a_i_provider';
import { TanStackProvider } from '../../providers/tan_stack_provider';

const adapterMocks = vi.hoisted(() => ({
  chat: vi.fn(),
  createOpenAI: vi.fn(() => ({ provider: 'openai' })),
  createAnthropic: vi.fn(() => ({ provider: 'anthropic' })),
  createOllama: vi.fn(() => ({ provider: 'ollama' })),
}));

vi.mock('@tanstack/ai', () => ({ chat: adapterMocks.chat }));
vi.mock('@tanstack/ai-openai', () => ({ createOpenAI: adapterMocks.createOpenAI }));
vi.mock('@tanstack/ai-anthropic', () => ({ createAnthropic: adapterMocks.createAnthropic }));
vi.mock('@tanstack/ai-ollama', () => ({ createOllama: adapterMocks.createOllama }));

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
  it('passes the user API key and base URL to OpenAI', async () => {
    adapterMocks.chat.mockReturnValue(completedChatStream());
    const provider = new TanStackProvider({
      providerId: 'user-openai',
      type: 'openai',
      apiKey: 'user-openai-key',
      baseUrl: 'https://openai.example/v1',
      defaultModel: 'gpt-test',
    });

    await provider.generateResponse({ prompt: 'hello' });

    expect(adapterMocks.createOpenAI).toHaveBeenCalledWith('user-openai-key', {
      baseURL: 'https://openai.example/v1',
    });
  });

  it('passes the user API key and base URL to OpenAI-compatible providers', async () => {
    adapterMocks.chat.mockReturnValue(completedChatStream());
    const provider = new TanStackProvider({
      providerId: 'user-custom',
      type: 'custom',
      apiKey: 'user-custom-key',
      baseUrl: 'https://compatible.example/v1',
      defaultModel: 'custom-model',
    });

    await provider.generateResponse({ prompt: 'hello' });

    expect(adapterMocks.createOpenAI).toHaveBeenCalledWith('user-custom-key', {
      baseURL: 'https://compatible.example/v1',
    });
  });

  it('passes the user API key to Anthropic', async () => {
    adapterMocks.chat.mockReturnValue(completedChatStream());
    const provider = new TanStackProvider({
      providerId: 'user-anthropic',
      type: 'anthropic',
      apiKey: 'user-anthropic-key',
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
