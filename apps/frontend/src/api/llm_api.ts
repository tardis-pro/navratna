/**
 * LLM Service API Client
 * Handles LLM model management, provider configuration, and text generation
 */

import { coreClient, edenWithCSRFRetry } from './eden';
import type {
  LLMModel,
  LLMProvider,
  LLMGenerateRequest,
  LLMGenerateResponse,
  LLMContextAnalysis,
} from '@uaip/contracts/api';
import type {
  AgentResponseRequest,
  CreateUserLLMProviderRequest,
  LLMProviderShape,
  UpdateApiKeyRequest,
  UpdateUserLLMProviderRequest,
  UserLLMProviderType,
  UserLLMGenerateRequest,
} from '@uaip/types';

type UserLLMProviderUpdateRequest = UpdateUserLLMProviderRequest & {
  apiKey?: string;
  isActive?: boolean;
  type?: UserLLMProviderType;
};

export type UserLLMProviderConfig = Omit<LLMProviderShape, 'apiKeyEncrypted'> & {
  hasApiKey: boolean;
};

export type {
  LLMModel,
  LLMProvider,
  LLMGenerateRequest,
  LLMGenerateResponse,
  LLMContextAnalysis,
  LLMProviderShape,
  CreateUserLLMProviderRequest,
  UpdateUserLLMProviderRequest,
  UpdateApiKeyRequest,
  UserLLMGenerateRequest,
};

const llm = coreClient.api.v1.llm
const userLlm = coreClient.api.v1.user.llm

export const llmAPI = {
  // Global LLM management
  async listModels(): Promise<LLMModel[]> {
    return edenWithCSRFRetry(() => llm.models.get());
  },

  async getModel(id: string): Promise<LLMModel> {
    return edenWithCSRFRetry(() => llm.models[id].get());
  },

  async listProviders(): Promise<LLMProvider[]> {
    return edenWithCSRFRetry(() => llm.providers.get());
  },

  async getProvider(id: string): Promise<LLMProvider> {
    return edenWithCSRFRetry(() => llm.providers[id].get());
  },

  async generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    return edenWithCSRFRetry(() => llm.generate.post(request));
  },

  async analyzeContext(
    text: string,
    options?: {
      includeSummary?: boolean;
      maxTopics?: number;
    }
  ): Promise<LLMContextAnalysis> {
    return edenWithCSRFRetry(() => llm['analyze-context'].post({
      text,
      ...options,
    }));
  },

  // User-specific LLM providers
  userLLM: {
    async listProviders(): Promise<UserLLMProviderConfig[]> {
      return edenWithCSRFRetry(() => userLlm.providers.get());
    },

    async getProvider(id: string): Promise<UserLLMProviderConfig> {
      return edenWithCSRFRetry(() => userLlm.providers[id].get());
    },

    async createProvider(provider: CreateUserLLMProviderRequest): Promise<UserLLMProviderConfig> {
      return edenWithCSRFRetry(() => userLlm.providers.post(provider));
    },

    async updateProvider(
      id: string,
      updates: UserLLMProviderUpdateRequest
    ): Promise<{ success: boolean; message?: string }> {
      return edenWithCSRFRetry(() => userLlm.providers[id].put(updates));
    },

    async updateProviderApiKey(
      id: string,
      request: UpdateApiKeyRequest
    ): Promise<{ success: boolean; message?: string }> {
      return edenWithCSRFRetry(() => userLlm.providers[id]['api-key'].put(request));
    },

    async deleteProvider(id: string): Promise<void> {
      return edenWithCSRFRetry(() => userLlm.providers[id].delete());
    },

    async testProvider(id: string): Promise<{
      success: boolean;
      message?: string;
      models?: string[];
    }> {
      return edenWithCSRFRetry(() => userLlm.providers[id].test.post());
    },

    async setDefault(id: string): Promise<void> {
      return edenWithCSRFRetry(() => userLlm.providers[id].default.post());
    },

    async generate(
      request: UserLLMGenerateRequest
    ): Promise<LLMGenerateResponse> {
      return edenWithCSRFRetry(() => userLlm.generate.post(request));
    },

    async generateAgentResponse(request: AgentResponseRequest): Promise<LLMGenerateResponse> {
      return edenWithCSRFRetry(() => userLlm['agent-response'].post(request));
    },

    async listModels(): Promise<
      Array<{
        id: string;
        name: string;
        description?: string;
        source: string;
        apiEndpoint: string;
        apiType: string;
        provider: string;
        providerId: string;
        isAvailable: boolean;
        isDefault: boolean;
      }>
    > {
      return edenWithCSRFRetry(() => userLlm.models.get());
    },
  },

  // Cache management
  async invalidateCache(
    type: 'models' | 'providers' | 'all' = 'all'
  ): Promise<{ success: boolean; message: string }> {
    return edenWithCSRFRetry(() => llm.cache.invalidate.post({ type }));
  },

  async refreshCache(): Promise<{ success: boolean; message: string }> {
    return edenWithCSRFRetry(() => llm.cache.refresh.post());
  },
};
