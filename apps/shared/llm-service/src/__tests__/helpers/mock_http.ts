/**
 * HTTP mock helpers for @uaip/llm-service tests.
 *
 * HTTP client strategy: BaseProvider uses native `fetch` (via executeWithRetry →
 * makeRequest / makeGetRequest).  TanStackProvider wraps @tanstack/ai `chat()`.
 *
 * Primary mock: vi.stubGlobal('fetch', vi.fn()) — intercepts all outgoing HTTP
 * calls from OpenAIProvider, OllamaProvider, and LLMStudioProvider.
 * Secondary mock: vi.mock('@tanstack/ai') — intercepts TanStackProvider calls.
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HttpMethod = 'POST' | 'GET';

interface MockFetchOptions {
  status?: number;
  ok?: boolean;
  headers?: Record<string, string>;
}

interface OpenAIChoice {
  message: { role: string; content: string };
  finish_reason: string;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIResponse {
  id: string;
  object: string;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

interface OpenAIErrorBody {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

interface StreamChunkData {
  type: 'text' | 'done' | 'error';
  content?: string;
  usage?: { totalTokens: number };
  message?: string;
}

// ---------------------------------------------------------------------------
// Low-level fetch mock builder
// ---------------------------------------------------------------------------

/**
 * Creates a mock `Response`-like object that `fetch` can resolve to.
 */
function buildMockResponse(body: unknown, options: MockFetchOptions = {}): Response {
  const { status = 200, ok = true, headers = {} } = options;

  const responseBody = JSON.stringify(body);
  return {
    ok,
    status,
    statusText: ok ? 'OK' : `Error ${status}`,
    headers: new Headers({ 'Content-Type': 'application/json', ...headers }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(responseBody),
    clone: function () {
      return this;
    },
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Primary helpers: mockLLMSuccess, mockLLMError, mockLLMStream
// ---------------------------------------------------------------------------

/**
 * Stubs global `fetch` to return a successful OpenAI-compatible chat completion.
 *
 * @param content  The text content the "LLM" should return.
 * @param model    Model identifier to echo back (default: 'gpt-4o').
 * @returns        The `vi.fn()` stub so callers can inspect calls.
 *
 * Usage in test:
 *   const fetchMock = mockLLMSuccess('Hello world');
 *   const result = await provider.generateResponse(request);
 *   expect(fetchMock).toHaveBeenCalledOnce();
 */
function mockLLMSuccess(content: string, model = 'gpt-4o'): ReturnType<typeof vi.fn> {
  const body: OpenAIResponse = {
    id: 'chatcmpl-test-123',
    object: 'chat.completion',
    model,
    choices: [
      {
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: content.split(' ').length,
      total_tokens: 10 + content.split(' ').length,
    },
  };

  const stub = vi.fn().mockResolvedValue(buildMockResponse(body));
  vi.stubGlobal('fetch', stub);
  return stub;
}

/**
 * Stubs global `fetch` to return an HTTP error (e.g. 429 rate-limit, 500 server).
 *
 * @param code     Error code string (e.g. 'rate_limit_exceeded', 'server_error').
 * @param message  Human-readable error message.
 * @param status   HTTP status code (default: 500).
 * @returns        The `vi.fn()` stub.
 *
 * Usage in test:
 *   mockLLMError('rate_limit_exceeded', 'Rate limit hit', 429);
 *   await expect(provider.generateResponse(request)).rejects.toThrow();
 */
function mockLLMError(
  code: string,
  message = 'An error occurred',
  status = 500
): ReturnType<typeof vi.fn> {
  const body: OpenAIErrorBody = {
    error: { message, type: 'api_error', code },
  };

  const stub = vi.fn().mockResolvedValue(
    buildMockResponse(body, {
      status,
      ok: false,
    })
  );
  vi.stubGlobal('fetch', stub);
  return stub;
}

/**
 * Stubs global `fetch` to simulate a streaming response (SSE chunks).
 * This covers the case where `request.stream === true` and the provider
 * reads a ReadableStream from the response body.
 *
 * For TanStackProvider streaming, use `mockTanStackStream` below.
 *
 * @param chunks   Array of text chunks to stream.
 * @returns        The `vi.fn()` stub.
 */
function mockLLMStream(chunks: string[]): ReturnType<typeof vi.fn> {
  const encoder = new TextEncoder();
  const sseLines = chunks
    .map((c) =>
      `data: ${JSON.stringify({
        choices: [{ delta: { content: c }, finish_reason: null }],
      })}\n\n`
    )
    .concat('data: [DONE]\n\n');

  const stream = new ReadableStream({
    start(controller) {
      for (const line of sseLines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });

  const mockResponse = {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: stream,
    json: () => Promise.reject(new Error('Cannot call json() on streaming response')),
    text: () => Promise.resolve(sseLines.join('')),
    clone: function () {
      return this;
    },
  } as unknown as Response;

  const stub = vi.fn().mockResolvedValue(mockResponse);
  vi.stubGlobal('fetch', stub);
  return stub;
}

// ---------------------------------------------------------------------------
// Network failure helpers
// ---------------------------------------------------------------------------

/**
 * Stubs `fetch` to reject with a network error (e.g. ECONNREFUSED).
 * Useful for testing retry logic and timeout handling.
 *
 * @param message  Error message (default: 'fetch failed').
 * @returns        The `vi.fn()` stub.
 */
function mockLLMNetworkError(message = 'fetch failed'): ReturnType<typeof vi.fn> {
  const stub = vi.fn().mockRejectedValue(new TypeError(message));
  vi.stubGlobal('fetch', stub);
  return stub;
}

/**
 * Stubs `fetch` to succeed on the Nth attempt and fail before that.
 * Useful for testing retry / back-off behaviour.
 *
 * @param successAfterAttempts  Number of failing attempts before success.
 * @param content               The successful content after retries.
 * @returns                     The `vi.fn()` stub.
 */
function mockLLMRetry(
  successAfterAttempts: number,
  content = 'Retried successfully'
): ReturnType<typeof vi.fn> {
  const successBody: OpenAIResponse = {
    id: 'chatcmpl-retry-ok',
    object: 'chat.completion',
    model: 'gpt-4o',
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  };

  let callCount = 0;
  const stub = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount <= successAfterAttempts) {
      return Promise.reject(new TypeError('fetch failed'));
    }
    return Promise.resolve(buildMockResponse(successBody));
  });

  vi.stubGlobal('fetch', stub);
  return stub;
}

// ---------------------------------------------------------------------------
// TanStack AI mock helpers
// ---------------------------------------------------------------------------

/**
 * Builds an async generator that yields TanStack AI-shaped stream chunks.
 * Use with vi.mock('@tanstack/ai') factory or vi.mocked(chat).mockReturnValue.
 *
 * @param chunks  Text chunks to stream as TanStack `{ type: undefined, content: string }` chunks.
 * @returns       Async iterable of StreamChunkData compatible with TanStackProvider.
 */
async function* buildTanStackStream(chunks: string[]): AsyncGenerator<StreamChunkData> {
  for (const content of chunks) {
    yield { type: 'text', content };
  }
  yield {
    type: 'done',
    usage: { totalTokens: chunks.join('').split(' ').length },
  };
}

// ---------------------------------------------------------------------------
// Model list mock helpers
// ---------------------------------------------------------------------------

/**
 * Stubs `fetch` to return a successful OpenAI /v1/models response.
 *
 * @param modelIds  Array of model IDs to return (default: common GPT models).
 */
function mockModelList(modelIds = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']): ReturnType<typeof vi.fn> {
  const body = {
    data: modelIds.map((id) => ({ id, object: 'model', owned_by: 'openai' })),
    object: 'list',
  };

  const stub = vi.fn().mockResolvedValue(buildMockResponse(body));
  vi.stubGlobal('fetch', stub);
  return stub;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  buildMockResponse,
  mockLLMSuccess,
  mockLLMError,
  mockLLMStream,
  mockLLMNetworkError,
  mockLLMRetry,
  buildTanStackStream,
  mockModelList,
};

export type {
  MockFetchOptions,
  OpenAIResponse,
  OpenAIErrorBody,
  StreamChunkData,
  HttpMethod,
};
