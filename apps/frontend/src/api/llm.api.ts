/**
 * LLM Service API Client
 * Handles LLM model management, provider configuration, and text generation
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import { ModelProvider } from '@/types';

export interface LLMModel {
  id: string;
  name: string;
  provider: ModelProvider;
  maxTokens: number;
  contextWindow: number;
  capabilities: string[];
  isActive: boolean;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
}

export interface LLMProvider {
  id: string;
  name: string;
  type: ModelProvider;
  apiEndpoint?: string;
  isActive: boolean;
  configuration?: Record<string, any>;
  models?: string[];
}

export interface LLMGenerateRequest {
  modelId: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  metadata?: Record<string, any>;
}

export interface LLMGenerateResponse {
  id: string;
  modelId: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  metadata?: Record<string, any>;
}

export interface LLMContextAnalysis {
  topics: string[];
  entities: Array<{
    text: string;
    type: string;
    confidence: number;
  }>;
  sentiment: {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
  };
  summary?: string;
}

export interface UserLLMProvider {
  id: string;
  userId: string;
  provider: ModelProvider;
  apiKey?: string; // Encrypted
  configuration?: Record<string, any>;
  isActive: boolean;
  isDefault: boolean;
  models?: string[];
  createdAt: string;
  updatedAt: string;
}

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

  async analyzeContext(text: string, options?: {
    includeSummary?: boolean;
    maxTopics?: number;
  }): Promise<LLMContextAnalysis> {
    return APIClient.post<LLMContextAnalysis>(API_ROUTES.LLM.ANALYZE_CONTEXT, {
      text,
      ...options
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
      provider: ModelProvider;
      apiKey: string;
      configuration?: Record<string, any>;
      isDefault?: boolean;
    }): Promise<UserLLMProvider> {
      return APIClient.post<UserLLMProvider>(API_ROUTES.USER_LLM.CREATE_PROVIDER, provider);
    },

    async updateProvider(id: string, updates: {
      apiKey?: string;
      configuration?: Record<string, any>;
      isDefault?: boolean;
      isActive?: boolean;
    }): Promise<UserLLMProvider> {
      return APIClient.put<UserLLMProvider>(`${API_ROUTES.USER_LLM.UPDATE_PROVIDER}/${id}`, updates);
    },

    async deleteProvider(id: string): Promise<void> {
      return APIClient.delete(`${API_ROUTES.USER_LLM.DELETE_PROVIDER}/${id}`);
    },

    async testProvider(id: string): Promise<{
      success: boolean;
      message?: string;
      models?: string[];
    }> {
      return APIClient.post(`${API_ROUTES.USER_LLM.TEST_PROVIDER}/${id}/test`);
    },

    async setDefault(id: string): Promise<void> {
      return APIClient.post(`${API_ROUTES.USER_LLM.SET_DEFAULT}/${id}/default`);
    },

    async generate(request: Omit<LLMGenerateRequest, 'modelId'> & {
      providerId?: string;
      model?: string;
    }): Promise<LLMGenerateResponse> {
      return APIClient.post<LLMGenerateResponse>(API_ROUTES.USER_LLM.GENERATE, request);
    }
  }
};