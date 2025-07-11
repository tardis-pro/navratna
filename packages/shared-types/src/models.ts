import { z } from 'zod';

// Model and Provider Types - Centralized from all locations
export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  provider: string;
  source?: string;
  apiEndpoint?: string;
  apiType: 'llmstudio' | 'ollama' | 'openai' | 'anthropic' | string;
  isAvailable?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export const ModelOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  provider: z.string(),
  source: z.string().optional(),
  apiEndpoint: z.string().optional(),
  apiType: z.string(),
  isAvailable: z.boolean().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional()
});

// Model provider configuration
export interface ModelProvider {
  id: string;
  name: string;
  type: 'llmstudio' | 'ollama' | 'openai' | 'anthropic';
  baseUrl?: string;
  apiKey?: string;
  isEnabled: boolean;
  models: ModelOption[];
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  provider: string;
  capabilities: ('text' | 'code' | 'reasoning' | 'multimodal' | 'vision-to-text' | 'audio-to-text' | 'audio-to-audio' | 'tool-calling' | 'function-calling' | 'image-generation' | 'embeddings')[];
}

// Debate-specific message data
export interface DebateMessageData {
  id: string;
  role: 'llama1' | 'llama2' | 'judge';
  content: string;
  timestamp: Date;
  modelId: string;
  apiType: string;
}

export const DebateMessageDataSchema = z.object({
  id: z.string(),
  role: z.enum(['llama1', 'llama2', 'judge']),
  content: z.string(),
  timestamp: z.date(),
  modelId: z.string(),
  apiType: z.string()
});