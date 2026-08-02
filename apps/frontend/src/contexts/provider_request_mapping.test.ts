import { describe, expect, it } from 'vitest';

import { toCreateProviderRequest, toUpdateProviderRequest } from './provider_request_mapping';

/**
 * The mapper silently dropped apiKey, so every provider saved through the UI
 * landed in the database with api_key_encrypted NULL and then failed at call
 * time with an opaque upstream 401. The form collected the key correctly — only
 * this translation lost it.
 */
describe('provider request mapping forwards the credential', () => {
  const input = {
    name: 'Tardis',
    description: 'Tardis gateway',
    type: 'custom',
    baseUrl: 'https://ai.tardis.digital/v1',
    apiKey: 'sk-secret-value',
    defaultModel: 'ultra-smart-reliable',
    priority: 100,
  };

  it('includes apiKey when creating', () => {
    expect(toCreateProviderRequest(input).apiKey).toBe('sk-secret-value');
  });

  it('includes apiKey when updating', () => {
    expect(toUpdateProviderRequest(input).apiKey).toBe('sk-secret-value');
  });

  it('leaves apiKey undefined when the user supplied none', () => {
    const { apiKey: _omitted, ...withoutKey } = input;

    expect(toCreateProviderRequest(withoutKey).apiKey).toBeUndefined();
    expect(toUpdateProviderRequest(withoutKey).apiKey).toBeUndefined();
  });

  it('carries the rest of the configuration through unchanged', () => {
    const created = toCreateProviderRequest(input);

    expect(created.name).toBe('Tardis');
    expect(created.baseUrl).toBe('https://ai.tardis.digital/v1');
    expect(created.defaultModel).toBe('ultra-smart-reliable');
    expect(created.priority).toBe(100);
  });

  it('maps an unrecognized provider type to custom rather than dropping it', () => {
    expect(toCreateProviderRequest({ ...input, type: 'something-new' }).type).toBe('custom');
    expect(toCreateProviderRequest({ ...input, type: 'anthropic' }).type).toBe('anthropic');
  });
});
