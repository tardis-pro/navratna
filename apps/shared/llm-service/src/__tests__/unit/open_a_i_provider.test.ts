import { describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../providers/open_a_i_provider';

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
});
