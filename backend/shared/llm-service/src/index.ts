import { LLMService } from './LLMService';

// Main exports for the LLM service package
export { LLMService, llmService } from './LLMService';
export { UserLLMService } from './UserLLMService';

// Interface exports
export type {
  LLMRequest,
  LLMResponse,
  AgentResponseRequest,
  AgentResponseResponse,
  ArtifactRequest,
  ArtifactResponse,
  ContextRequest,
  ContextAnalysis,
  Message,
  DocumentContext,
  ToolCall,
  ToolResult,
  AvailableTool,
  LLMProviderConfig
} from './interfaces';

// Provider exports
export { BaseProvider } from './providers/BaseProvider';
export { OllamaProvider } from './providers/OllamaProvider';
export { LLMStudioProvider } from './providers/LLMStudioProvider';
export { OpenAIProvider } from './providers/OpenAIProvider';


