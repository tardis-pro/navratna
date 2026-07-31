import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../../providers/open_a_i_provider';
import type { AvailableTool } from '@uaip/types';

const searchTool: AvailableTool = {
  name: 'web-search',
  description: 'Search the web',
  parameters: { type: 'object', properties: { query: { type: 'string' } } },
};

function buildProvider(): OpenAIProvider {
  return new OpenAIProvider(
    {
      providerId: 'provider-1',
      type: 'openai',
      baseUrl: 'https://ai.example.test/v1',
      apiKey: 'k',
      defaultModel: 'gpt-test',
      retries: 1,
    },
    'Test Provider'
  );
}

function stubChatCompletion(payload: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/models')) {
      return { ok: false, status: 404, statusText: 'Not Found' };
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => JSON.stringify(payload),
      headers: new Headers({ 'content-type': 'application/json' }),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('OpenAIProvider native tool calling', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the tools array in OpenAI function format when tools are supplied', async () => {
    const fetchMock = stubChatCompletion({
      model: 'gpt-test',
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      usage: { total_tokens: 5 },
    });

    await buildProvider().generateResponse({
      prompt: 'search please',
      model: 'gpt-test',
      tools: [searchTool],
    });

    const chatCall = fetchMock.mock.calls.find(([url]) => String(url).includes('chat/completions'));
    expect(chatCall, 'a chat completion request must be issued').toBeDefined();

    const body: unknown = JSON.parse(String((chatCall?.[1] as RequestInit)?.body));
    expect(body).toMatchObject({
      tools: [
        {
          type: 'function',
          function: {
            name: 'web-search',
            description: 'Search the web',
            parameters: searchTool.parameters,
          },
        },
      ],
    });
  });

  it('omits the tools key entirely when the agent has no tools', async () => {
    const fetchMock = stubChatCompletion({
      model: 'gpt-test',
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
    });

    await buildProvider().generateResponse({ prompt: 'plain', model: 'gpt-test' });

    const chatCall = fetchMock.mock.calls.find(([url]) => String(url).includes('chat/completions'));
    const body = JSON.parse(String((chatCall?.[1] as RequestInit)?.body)) as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain('tools');
  });

  it('maps returned tool_calls into LLMToolCall and reports finishReason tool_calls', async () => {
    stubChatCompletion({
      model: 'gpt-test',
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function',
                function: { name: 'web-search', arguments: '{"query":"navratna"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });

    const response = await buildProvider().generateResponse({
      prompt: 'search please',
      model: 'gpt-test',
      tools: [searchTool],
    });

    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolCalls).toEqual([
      {
        id: 'call_abc',
        type: 'function',
        function: { name: 'web-search', arguments: '{"query":"navratna"}' },
      },
    ]);
  });

  it('does not treat an empty content tool-call reply as an invalid response', async () => {
    stubChatCompletion({
      model: 'gpt-test',
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 'web-search', arguments: '{}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });

    const response = await buildProvider().generateResponse({
      prompt: 'x',
      model: 'gpt-test',
      tools: [searchTool],
    });

    expect(response.error).toBeUndefined();
    expect(response.content).toBe('');
  });
});
