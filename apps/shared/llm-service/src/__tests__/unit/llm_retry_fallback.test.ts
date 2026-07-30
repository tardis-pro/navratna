import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testDouble } from '../test_double.js';
import { LLMService } from '../../l_l_m_service.js';
import type { BaseProvider } from '../../providers/base_provider.js';
import type { LLMRequest, LLMResponse } from '../../interfaces.js';

/**
 * Guards the retry + fallback + circuit-breaker interaction.
 *
 * The retry loop, the breaker threshold and the fallback path all share one
 * counter, so their numbers have to be chosen together: if a single request can
 * burn the whole failure budget, the breaker latches open before the fallback
 * model is ever attempted and the fallback silently becomes dead code.
 */

type ProviderMap = Map<string, BaseProvider>;

function isProviderMap(value: unknown): value is ProviderMap {
  return value instanceof Map;
}

function getProviders(service: LLMService): ProviderMap {
  const providers = Reflect.get(service, 'providers');
  if (!isProviderMap(providers)) {
    throw new Error('LLMService.providers is not a Map — test needs updating');
  }
  return providers;
}

function makeRequest(overrides: Partial<LLMRequest> = {}): LLMRequest {
  return {
    prompt: 'hello',
    model: 'primary-model',
    ...overrides,
  } as LLMRequest;
}

function okResponse(model: string): LLMResponse {
  return { content: 'ok', model, tokensUsed: 1 } as LLMResponse;
}

describe('LLMService retry / fallback / circuit breaker', () => {
  let service: LLMService;
  let providers: ProviderMap;

  beforeEach(() => {
    vi.useFakeTimers();
    service = LLMService.getInstance();
    Reflect.set(service, 'initialized', true);
    Reflect.set(service, 'circuitBreaker', new Map());
    providers = getProviders(service);
    providers.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    providers.clear();
    Reflect.set(service, 'circuitBreaker', new Map());
  });

  it('calls a failing provider ONCE then fails over to a healthy one', async () => {
    const failing = vi.fn(async (): Promise<LLMResponse> => {
      throw new Error('503 upstream unavailable');
    });
    const healthy = vi.fn(async (): Promise<LLMResponse> => okResponse('ollama-model'));

    providers.set('openai', testDouble<BaseProvider>({ generateResponse: failing }));
    providers.set('ollama', testDouble<BaseProvider>({ generateResponse: healthy }));

    const pending = service.generateResponse(makeRequest());
    await vi.runAllTimersAsync();
    const response = await pending;

    // BaseProvider already retries transport failures; this layer must not.
    expect(failing).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(response.model).toBe('ollama-model');
  });

  it('calls an explicitly preferred provider ONCE even when it keeps failing', async () => {
    const failing = vi.fn(async (): Promise<LLMResponse> => {
      throw new Error('503 upstream unavailable');
    });
    providers.set('openai', testDouble<BaseProvider>({ generateResponse: failing }));

    const pending = service.generateResponse(makeRequest(), 'openai');
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(failing).toHaveBeenCalledTimes(1);
    expect(response.error).toContain('503');
  });

  it('does not fail over on a 4xx — the request itself is rejected', async () => {
    const badRequest = vi.fn(async (): Promise<LLMResponse> => {
      throw new Error('400 invalid request payload');
    });
    const other = vi.fn(async (): Promise<LLMResponse> => okResponse('ollama-model'));

    providers.set('openai', testDouble<BaseProvider>({ generateResponse: badRequest }));
    providers.set('ollama', testDouble<BaseProvider>({ generateResponse: other }));

    const pending = service.generateResponse(makeRequest());
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(badRequest).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(response.error).toContain('400');
  });

  it('records EVERY failed provider against the breaker, not just the last', async () => {
    const fail = (name: string) =>
      vi.fn(async (): Promise<LLMResponse> => {
        throw new Error(`503 ${name} unavailable`);
      });
    providers.set('openai', testDouble<BaseProvider>({ generateResponse: fail('openai') }));
    providers.set('anthropic', testDouble<BaseProvider>({ generateResponse: fail('anthropic') }));

    const pending = service.generateResponse(makeRequest());
    await vi.runAllTimersAsync();
    await pending;

    const breakers = Reflect.get(service, 'circuitBreaker') as Map<
      string,
      { failureCount: number }
    >;
    expect(breakers.get('openai')?.failureCount).toBeGreaterThan(0);
    expect(breakers.get('anthropic')?.failureCount).toBeGreaterThan(0);
  });

  it('does not penalise provider health for a 4xx request error', async () => {
    const badRequest = vi.fn(async (): Promise<LLMResponse> => {
      throw new Error('400 invalid request payload');
    });
    providers.set('openai', testDouble<BaseProvider>({ generateResponse: badRequest }));

    const pending = service.generateResponse(makeRequest());
    await vi.runAllTimersAsync();
    await pending;

    // A rejected request says nothing about the provider, so it must not be
    // marked down. It stays 'unknown' because nothing has succeeded either.
    expect((await service.getProviderHealth())['openai']).not.toBe('degraded');
    expect((await service.getProviderHealth())['openai']).not.toBe('unavailable');
  });

  it('reports a provider with accumulated failures as degraded', async () => {
    const failing = vi.fn(async (): Promise<LLMResponse> => {
      throw new Error('503 upstream unavailable');
    });
    providers.set('openai', testDouble<BaseProvider>({ generateResponse: failing }));

    const pending = service.generateResponse(makeRequest());
    await vi.runAllTimersAsync();
    await pending;

    expect((await service.getProviderHealth())['openai']).toBe('degraded');
  });

  it('records a provider failure even when a later provider SUCCEEDS', async () => {
    const failing = vi.fn(async (): Promise<LLMResponse> => {
      throw new Error('503 upstream unavailable');
    });
    const healthy = vi.fn(async (): Promise<LLMResponse> => okResponse('ollama-model'));

    providers.set('openai', testDouble<BaseProvider>({ generateResponse: failing }));
    providers.set('ollama', testDouble<BaseProvider>({ generateResponse: healthy }));

    const pending = service.generateResponse(makeRequest());
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(response.model).toBe('ollama-model');
    // Provider health is independent of whether the REQUEST recovered.
    expect((await service.getProviderHealth())['openai']).toBe('degraded');
  });

  it('a degraded provider returns to healthy after a successful request', async () => {
    const flaky = vi
      .fn<() => Promise<LLMResponse>>()
      .mockRejectedValueOnce(new Error('503 upstream unavailable'))
      .mockResolvedValue(okResponse('openai-model'));
    const healthy = vi.fn(async (): Promise<LLMResponse> => okResponse('ollama-model'));

    providers.set('openai', testDouble<BaseProvider>({ generateResponse: flaky }));
    providers.set('ollama', testDouble<BaseProvider>({ generateResponse: healthy }));

    const first = service.generateResponse(makeRequest());
    await vi.runAllTimersAsync();
    await first;
    expect((await service.getProviderHealth())['openai']).toBe('degraded');

    const second = service.generateResponse(makeRequest(), 'openai');
    await vi.runAllTimersAsync();
    await second;

    expect((await service.getProviderHealth())['openai']).toBe('healthy');
  });

  it('initializes providers before reporting health', async () => {
    Reflect.set(service, 'initialized', false);
    providers.clear();

    const initialize = vi.fn(async () => {
      Reflect.set(service, 'initialized', true);
      providers.set(
        'openai',
        testDouble<BaseProvider>({ generateResponse: vi.fn(async () => okResponse('m')) })
      );
    });
    Reflect.set(service, 'initializeFromDatabase', initialize);

    const health = await service.getProviderHealth();

    expect(initialize).toHaveBeenCalled();
    expect(Object.keys(health)).toContain('openai');
  });

  it('reports a never-contacted provider as unknown, not healthy', async () => {
    providers.set('openai', testDouble<BaseProvider>({ generateResponse: vi.fn() }));

    // Nothing has verified its credentials or reachability yet.
    expect((await service.getProviderHealth())['openai']).toBe('unknown');
  });

  it('reports healthy only after a request has actually succeeded', async () => {
    providers.set(
      'openai',
      testDouble<BaseProvider>({ generateResponse: vi.fn(async () => okResponse('openai-model')) })
    );

    expect((await service.getProviderHealth())['openai']).toBe('unknown');

    const pending = service.generateResponse(makeRequest(), 'openai');
    await vi.runAllTimersAsync();
    await pending;

    expect((await service.getProviderHealth())['openai']).toBe('healthy');
  });

  it('selects a healthy provider instead of one whose circuit is open', async () => {
    const openai = vi.fn(async (): Promise<LLMResponse> => {
      throw new Error('should not be called — circuit is open');
    });
    const ollama = vi.fn(async (): Promise<LLMResponse> => okResponse('ollama-model'));

    providers.set('openai', testDouble<BaseProvider>({ generateResponse: openai }));
    providers.set('ollama', testDouble<BaseProvider>({ generateResponse: ollama }));

    Reflect.set(
      service,
      'circuitBreaker',
      new Map([['openai', { lastFailure: Date.now(), failureCount: 3, openUntil: Date.now() + 30_000 }]])
    );

    const pending = service.generateResponse(makeRequest());
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(openai).not.toHaveBeenCalled();
    expect(ollama).toHaveBeenCalled();
    expect(response.model).toBe('ollama-model');
  });

  it('can select anthropic and google when they are the only providers', async () => {
    for (const type of ['anthropic', 'google']) {
      providers.clear();
      Reflect.set(service, 'circuitBreaker', new Map());
      const generateResponse = vi.fn(async (): Promise<LLMResponse> => okResponse(`${type}-model`));
      providers.set(type, testDouble<BaseProvider>({ generateResponse }));

      const pending = service.generateResponse(makeRequest());
      await vi.runAllTimersAsync();
      const response = await pending;

      expect(generateResponse).toHaveBeenCalled();
      expect(response.model).toBe(`${type}-model`);
    }
  });

  it('preserves the failing provider and model on the returned error response', async () => {
    const generateResponse = vi.fn(
      async (): Promise<LLMResponse> =>
        ({
          content: '',
          model: 'primary-model',
          error: 'upstream 500',
          finishReason: 'error',
        }) as LLMResponse
    );
    providers.set('openai', testDouble<BaseProvider>({ generateResponse }));

    const pending = service.generateResponse(makeRequest());
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(response.error).toContain('upstream 500');
    expect(response.provider).toBe('openai');
    expect(response.model).toBe('primary-model');
  });

  it('uses the fallback model when the primary model keeps failing', async () => {
    const generateResponse = vi.fn(async (req: LLMRequest): Promise<LLMResponse> => {
      if (req.model === 'primary-model') {
        throw new Error('primary exploded');
      }
      return okResponse('fallback-model');
    });

    providers.set('openai', testDouble<BaseProvider>({ generateResponse }));

    const pending = service.generateResponse(
      makeRequest({ fallbackModel: 'fallback-model' }),
      'openai'
    );
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(response.model).toBe('fallback-model');
    expect(generateResponse.mock.calls.some(([req]) => req.model === 'fallback-model')).toBe(true);
  });

  it('treats a provider error-response as a failure and uses the fallback', async () => {
    const generateResponse = vi.fn(async (req: LLMRequest): Promise<LLMResponse> => {
      if (req.model === 'primary-model') {
        return {
          content: '',
          model: 'primary-model',
          error: 'upstream 500',
          finishReason: 'error',
        } as LLMResponse;
      }
      return okResponse('fallback-model');
    });

    providers.set('openai', testDouble<BaseProvider>({ generateResponse }));

    const pending = service.generateResponse(
      makeRequest({ fallbackModel: 'fallback-model' }),
      'openai'
    );
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(response.error).toBeUndefined();
    expect(response.model).toBe('fallback-model');
  });

  it('counts a provider error-response toward the circuit breaker', async () => {
    const generateResponse = vi.fn(
      async (): Promise<LLMResponse> =>
        ({ content: '', model: 'primary-model', error: 'upstream 500' }) as LLMResponse
    );
    providers.set('openai', testDouble<BaseProvider>({ generateResponse }));

    for (let i = 0; i < 3; i++) {
      const pending = service.generateResponse(makeRequest(), 'openai').catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      await pending;
    }

    expect((await service.getProviderHealth())['openai']).toBe('unavailable');
  });

  it('does not spend the entire breaker budget on one request', async () => {
    const generateResponse = vi.fn(async (): Promise<LLMResponse> => {
      throw new Error('always fails');
    });
    providers.set('openai', testDouble<BaseProvider>({ generateResponse }));

    const pending = service.generateResponse(makeRequest(), 'openai').catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    await pending;

    expect((await service.getProviderHealth())['openai']).not.toBe('unavailable');
  });

  it('reports a provider unavailable only after repeated independent failures', async () => {
    const generateResponse = vi.fn(async (): Promise<LLMResponse> => {
      throw new Error('always fails');
    });
    providers.set('openai', testDouble<BaseProvider>({ generateResponse }));

    for (let i = 0; i < 3; i++) {
      const pending = service.generateResponse(makeRequest(), 'openai').catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      await pending;
    }

    expect((await service.getProviderHealth())['openai']).toBe('unavailable');
  });
});
