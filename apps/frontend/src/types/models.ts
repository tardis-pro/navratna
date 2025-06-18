export interface ModelOption {
  id: string;
  name: string;
  description: string;
  source?: string;
  apiEndpoint?: string;
  apiType?: 'llmstudio' | 'ollama';
  maxTokens?: number;
  temperature?: number;
} 