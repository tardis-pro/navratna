export interface DebateMessageData {
  id: string;
  role: 'llama1' | 'llama2' | 'judge';
  content: string;
  timestamp: Date;
  modelId: string;
  apiType: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  temperature: number;
  apiType: string;
} 