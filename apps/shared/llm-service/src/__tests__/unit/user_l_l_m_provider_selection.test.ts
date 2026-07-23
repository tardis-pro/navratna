import { describe, expect, it } from 'vitest';

import {
  selectUserProviderForModel,
  type ProviderSelectionCandidate,
} from '../../provider_selection.js';

function createProvider(
  id: string,
  type: ProviderSelectionCandidate['type'],
  options: Pick<
    ProviderSelectionCandidate,
    'isDefault' | 'baseUrl' | 'defaultModel' | 'configuration'
  >
): ProviderSelectionCandidate {
  return {
    id,
    type,
    baseUrl: options.baseUrl,
    isDefault: options.isDefault,
    defaultModel: options.defaultModel,
    configuration: options.configuration,
  };
}

describe('selectUserProviderForModel', () => {
  const openAIProvider = createProvider('openai-provider', 'openai', {
    isDefault: false,
    baseUrl: undefined,
    defaultModel: 'gpt-4o-mini',
    configuration: {},
  });
  const customProvider = createProvider('custom-provider', 'custom', {
    isDefault: true,
    baseUrl: 'https://router.example.com/v1',
    defaultModel: 'gemini-2.5-flash-thinking',
    configuration: {
      models: [{ id: 'gemini-2.5-flash-thinking' }, 'claude-sonnet-4'],
    },
  });

  it('uses an explicitly assigned user provider first', () => {
    const selected = selectUserProviderForModel(
      [openAIProvider, customProvider],
      'openai',
      'gpt-4o-mini',
      'custom-provider'
    );

    expect(selected?.id).toBe('custom-provider');
  });

  it('binds a selected model to the provider that declares it', () => {
    const selected = selectUserProviderForModel(
      [openAIProvider, customProvider],
      'openai',
      'gemini-2.5-flash-thinking'
    );

    expect(selected?.id).toBe('custom-provider');
  });

  it('uses the user default before a stale provider-type label', () => {
    const selected = selectUserProviderForModel(
      [openAIProvider, customProvider],
      'openai',
      'unregistered-model'
    );

    expect(selected?.id).toBe('custom-provider');
  });

  it('falls back to provider type when no explicit, model, or default match exists', () => {
    const customWithoutDefault = createProvider('custom-secondary', 'custom', {
      isDefault: false,
      baseUrl: undefined,
      defaultModel: 'custom-model',
      configuration: {},
    });
    const selected = selectUserProviderForModel(
      [openAIProvider, customWithoutDefault],
      'openai',
      'unregistered-model'
    );

    expect(selected?.id).toBe('openai-provider');
  });

  it('uses a configured routed endpoint before a mismatched public default', () => {
    const publicDefault = createProvider('public-openai', 'openai', {
      isDefault: true,
      baseUrl: undefined,
      defaultModel: 'gpt-4o-mini',
      configuration: {},
    });
    const routedProvider = createProvider('user-router', 'custom', {
      isDefault: false,
      baseUrl: 'https://router.example.com/v1',
      defaultModel: undefined,
      configuration: {},
    });

    const selected = selectUserProviderForModel(
      [publicDefault, routedProvider],
      'openai',
      'gemini-2.5-flash-thinking'
    );

    expect(selected?.id).toBe('user-router');
  });

});
