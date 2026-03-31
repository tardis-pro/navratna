export type {
  LLMModel,
  LLMGenerationRequest as LLMGenerateRequest,
  LLMGenerationResponse as LLMGenerateResponse,
  UserLLMPreference as UserLLMProvider,
} from '@uaip/types';

export interface LLMProvider {
  id: string;
  name: string;
  type: string;
  apiKey?: string;
  baseUrl?: string;
  isActive: boolean;
  models?: string[];
  configuration?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LLMContextAnalysis {
  topics: string[];
  entities: Array<{ text: string; type: string; confidence: number }>;
  sentiment: { score: number; label: 'positive' | 'negative' | 'neutral' };
  summary?: string;
}
