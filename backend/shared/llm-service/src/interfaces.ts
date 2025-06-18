import { Agent } from '@uaip/types';

// Core LLM request/response interfaces
export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  tokensUsed?: number;
  model: string;
  confidence?: number;
  error?: string;
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  toolCallId: string;
  result: any;
  error?: string;
}

// Agent-specific LLM interfaces
export interface AgentResponseRequest {
  agent: Agent;
  messages: Message[];
  context?: DocumentContext;
  tools?: AvailableTool[];
}

export interface AgentResponseResponse extends LLMResponse {
  toolResults?: ToolResult[];
}

export interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  type: 'user' | 'assistant' | 'system' | 'tool';
  toolCallId?: string;
}

export interface DocumentContext {
  id: string;
  title: string;
  content: string;
  type: string;
  metadata?: {
    createdAt: Date;
    lastModified: Date;
    author: string;
  };
  tags?: string[];
}

export interface AvailableTool {
  name: string;
  description: string;
  parameters: any;
}

// Provider configuration
export interface LLMProviderConfig {
  type: 'ollama' | 'openai' | 'llmstudio';
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  timeout?: number;
  retries?: number;
}

// Artifact generation interfaces
export interface ArtifactRequest {
  type: 'code' | 'documentation' | 'test' | 'prd';
  language?: string;
  context: string;
  requirements: string[];
  constraints?: string[];
}

export interface ArtifactResponse extends LLMResponse {
  artifactType: string;
  metadata: {
    language?: string;
    framework?: string;
    dependencies?: string[];
  };
}

// Context analysis interfaces
export interface ContextRequest {
  conversationHistory: Message[];
  currentContext?: DocumentContext;
  userRequest: string;
  agentCapabilities?: string[];
}

export interface ContextAnalysis extends LLMResponse {
  analysis: {
    intent: {
      primary: string;
      secondary: string[];
      confidence: number;
    };
    context: {
      messageCount: number;
      participants: string[];
      topics: string[];
      sentiment: string;
      complexity: string;
    };
    recommendations: {
      type: string;
      confidence: number;
      description: string;
      estimatedDuration: number;
    }[];
  };
} 