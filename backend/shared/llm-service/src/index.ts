import { LLMService } from './LLMService.js';

// Main exports for the LLM service package
export { LLMService, llmService } from './LLMService.js';
export { UserLLMService } from './UserLLMService.js';

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
} from './interfaces.js';

// Provider exports
export { BaseProvider } from './providers/BaseProvider.js';
export { OllamaProvider } from './providers/OllamaProvider.js';
export { LLMStudioProvider } from './providers/LLMStudioProvider.js';
export { OpenAIProvider } from './providers/OpenAIProvider.js';


