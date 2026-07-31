import { LLMService } from './l_l_m_service.js';

// Main exports for the LLM service package
export { LLMService, llmService } from './l_l_m_service.js';
export { UserLLMService, type UserLLMProvider } from './user_l_l_m_service.js';
export { ModelBootstrapService } from './services/model_bootstrap_service.js';
export type { CachedModelEntry } from './services/model_bootstrap_service.js';
export { ApiKeyDecryptionService } from './services/api_key_decryption_service.js';

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
  LLMProviderConfig,
  ApiKeyDecryptionRequest,
  ApiKeyDecryptionResponse,
} from './interfaces.js';

// Provider exports
export { BaseProvider } from './providers/base_provider.js';
export { OllamaProvider } from './providers/ollama_provider.js';
export { LLMStudioProvider } from './providers/l_l_m_studio_provider.js';
export { OpenAIProvider } from './providers/open_a_i_provider.js';
export { AnthropicProvider } from './providers/anthropic_provider.js';
export { GoogleProvider } from './providers/google_provider.js';
export { TanStackProvider } from './providers/tan_stack_provider.js';

// Cache key exports
export {
  CACHE_TTL,
  MODELS_CACHE_KEY,
  PROVIDERS_CACHE_KEY,
  PROVIDER_MODELS_CACHE_PREFIX,
} from './cache_keys.js';

// Streaming exports
export { StreamingService } from './streaming_service.js';

// Tool-calling exports
export { runToolCallingLoop, buildAvailableTools } from './tool_calling.js';
export type {
  AssignedToolRef,
  ResolvedToolSchema,
  ToolSchemaResolver,
  ToolCallExecutor,
  ToolCallingLoopOptions,
} from './tool_calling.js';
export { AgentToolExecutor } from './agent_tool_executor.js';
export type { ToolExecutionRpcBus, AgentToolBinding } from './agent_tool_executor.js';
