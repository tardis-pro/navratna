/**
 * LLM Service API Client
 * Handles LLM model management, provider configuration, and text generation
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import { ModelProvider } from '@/types';
import type {
  LLMModel,
  LLMProvider,
  LLMGenerateRequest,
  LLMGenerateResponse,
  LLMContextAnalysis,
  UserLLMProvider,
} from '@uaip/types';

export type {
  LLMModel,
  LLMProvider,
  LLMGenerateRequest,
  LLMGenerateResponse,
  LLMContextAnalysis,
  UserLLMProvider,
};

export const llmAPI = {
  // Global LLM management
  async listModels(): Promise<LLMModel[]> {
    return APIClient.get<LLMModel[]>(API_ROUTES.LLM.LIST_MODELS);
  },

  async getModel(id: string): Promise<LLMModel> {
    return APIClient.get<LLMModel>(`${API_ROUTES.LLM.GET_MODEL}/${id}`);
  },

  async listProviders(): Promise<LLMProvider[]> {
    return APIClient.get<LLMProvider[]>(API_ROUTES.LLM.LIST_PROVIDERS);
  },

  async getProvider(id: string): Promise<LLMProvider> {
    return APIClient.get<LLMProvider>(`${API_ROUTES.LLM.GET_PROVIDER}/${id}`);
  },

  async generate(request: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    return APIClient.post<LLMGenerateResponse>(API_ROUTES.LLM.GENERATE, request);
  },

  async analyzeContext(
    text: string,
    options?: {
      includeSummary?: boolean;
      maxTopics?: number;
    }
  ): Promise<LLMContextAnalysis> {
    return APIClient.post<LLMContextAnalysis>(API_ROUTES.LLM.ANALYZE_CONTEXT, {
      text,
      ...options,
    });
  },

  // User-specific LLM providers
  userLLM: {
    async listProviders(): Promise<UserLLMProvider[]> {
      return APIClient.get<UserLLMProvider[]>(API_ROUTES.USER_LLM.LIST_PROVIDERS);
    },

    async getProvider(id: string): Promise<UserLLMProvider> {
      return APIClient.get<UserLLMProvider>(`${API_ROUTES.USER_LLM.GET_PROVIDER}/${id}`);
    },

    async createProvider(provider: {
      name: string;
      description?: string;
      type: string;
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
      modelsList?: string[];
      configuration?: Record<string, unknown>;
      priority?: number;
    }): Promise<UserLLMProvider> {
      return APIClient.post<UserLLMProvider>(API_ROUTES.USER_LLM.CREATE_PROVIDER, provider);
    },

    async updateProvider(
      id: string,
      updates: {
        name?: string;
        description?: string;
        baseUrl?: string;
        apiKey?: string;
        defaultModel?: string;
        modelsList?: string[];
        configuration?: Record<string, unknown>;
        priority?: number;
        status?: string;
        isActive?: boolean;
      }
    ): Promise<UserLLMProvider> {
      return APIClient.put<UserLLMProvider>(
        `${API_ROUTES.USER_LLM.UPDATE_PROVIDER}/${id}`,
        updates
      );
    },

    async deleteProvider(id: string): Promise<void> {
      return APIClient.delete(`${API_ROUTES.USER_LLM.DELETE_PROVIDER}/${id}`);
    },

    async testProvider(id: string): Promise<{
      success: boolean;
      message?: string;
      models?: string[];
    }> {
      const response = await APIClient.post(`${API_ROUTES.USER_LLM.TEST_PROVIDER}/${id}/test`);
      return response;
    },

    async setDefault(id: string): Promise<void> {
      return APIClient.post(`${API_ROUTES.USER_LLM.SET_DEFAULT}/${id}/default`);
    },

    async generate(
      request: Omit<LLMGenerateRequest, 'modelId'> & {
        providerId?: string;
        model?: string;
      }
    ): Promise<LLMGenerateResponse> {
      return APIClient.post<LLMGenerateResponse>(API_ROUTES.USER_LLM.GENERATE, request);
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
      return APIClient.get<
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
      >(API_ROUTES.USER_LLM.LIST_MODELS);
    },
  },

  // Cache management
  async invalidateCache(
    type: 'models' | 'providers' | 'all' = 'all'
  ): Promise<{ success: boolean; message: string }> {
    return APIClient.post<{ success: boolean; message: string }>(API_ROUTES.LLM.CACHE_INVALIDATE, {
      type,
    });
  },

  async refreshCache(): Promise<{ success: boolean; message: string }> {
    return APIClient.post<{ success: boolean; message: string }>(API_ROUTES.LLM.CACHE_REFRESH);
  },
};
