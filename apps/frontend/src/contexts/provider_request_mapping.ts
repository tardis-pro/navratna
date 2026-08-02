import type {
  CreateUserLLMProviderRequest,
  FrontendModelProviderInput,
  UserLLMProviderType,
} from '@uaip/types';

export type UpdateProviderConfigRequest = {
  name?: string;
  description?: string;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  priority?: number;
};

export function toUserProviderType(type: string): UserLLMProviderType {
  switch (type) {
    case 'ollama':
      return 'ollama';
    case 'llmstudio':
      return 'llmstudio';
    case 'openai':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    case 'google':
      return 'google';
    default:
      return 'custom';
  }
}

/**
 * apiKey MUST be forwarded. Omitting it saved every provider with no credential
 * — the form collected the key, this mapper dropped it, and the provider then
 * failed at call time with an opaque upstream 401.
 */
export function toCreateProviderRequest(
  provider: FrontendModelProviderInput
): CreateUserLLMProviderRequest {
  return {
    name: provider.name,
    description: provider.description,
    type: toUserProviderType(provider.type),
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    defaultModel: provider.defaultModel,
    priority: provider.priority,
  };
}

export function toUpdateProviderRequest(
  provider: FrontendModelProviderInput
): UpdateProviderConfigRequest {
  return {
    name: provider.name,
    description: provider.description,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    defaultModel: provider.defaultModel,
    priority: provider.priority,
  };
}
