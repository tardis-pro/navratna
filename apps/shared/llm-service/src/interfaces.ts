import type {
  LLMRequest,
  LLMResponse,
  ToolCall,
  ToolResult,
  AgentResponseRequest,
  AgentResponseResponse,
  ToolSuggestion,
  ToolExecutionResult,
  Message,
  DocumentContext,
  AvailableTool,
  LLMProviderConfig,
  ApiKeyDecryptionRequest,
  ApiKeyDecryptionResponse,
  ArtifactRequest,
  ArtifactResponse,
  ContextRequest,
  ContextAnalysis,
} from '@uaip/types';

export type ProviderModelInfo = {
  id: string;
  name: string;
  description?: string;
  source: string;
  apiEndpoint: string;
};

export type {
  LLMRequest,
  LLMResponse,
  ToolCall,
  ToolResult,
  AgentResponseRequest,
  AgentResponseResponse,
  ToolSuggestion,
  ToolExecutionResult,
  Message,
  DocumentContext,
  AvailableTool,
  LLMProviderConfig,
  ApiKeyDecryptionRequest,
  ApiKeyDecryptionResponse,
  ArtifactRequest,
  ArtifactResponse,
  ContextRequest,
  ContextAnalysis,
};
