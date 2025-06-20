export interface ModelOption {
  id: string;
  name: string;
  description: string;
  source?: string;
  apiEndpoint?: string;
  apiType?: 'llmstudio' | 'ollama';
  provider?: string;
  isAvailable?: boolean;
  maxTokens?: number;
  temperature?: number;
} 