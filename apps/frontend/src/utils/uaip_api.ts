/**
 * UAIP Frontend API Service
 *
 * This service provides a clean interface between the frontend components
 * and the UAIP backend services. It handles API calls, error handling,
 * and data transformation for the frontend.
 */

// Import the backend API client
export * from '@/api';
import { api, coreClient, gatewayClient, unwrapEden, edenWithCSRFRetry, edenRequest } from '@/api';
import {
  API_CONFIG as _API_CONFIG,
  getEffectiveAPIBaseURL,
  getEnvironmentConfig,
  buildAPIURL as _buildAPIURL,
  API_ROUTES,
} from '@/config/api_config';

// Import shared types - using regular imports for enums and type imports for interfaces
import type {
  Agent,
  AgentCreate,
  AgentUpdate,
  // Persona types
  Persona,
  PersonaTrait as _PersonaTrait,
  ExpertiseDomain as _ExpertiseDomain,
  ConversationalStyle as _ConversationalStyle,
  CreatePersonaRequest as _CreatePersonaRequest,
  UpdatePersonaRequest as _UpdatePersonaRequest,
  PersonaSearchFilters as _PersonaSearchFilters,
  PersonaRecommendation as _PersonaRecommendation,

  // Discussion types
  Discussion,
  DiscussionParticipant,
  DiscussionMessage,
  DiscussionSettings as _DiscussionSettings,
  DiscussionState as _DiscussionState,
  TurnStrategy as _TurnStrategy,
  TurnStrategyConfig as _TurnStrategyConfig,
  CreateDiscussionRequest,
  UpdateDiscussionRequest,
  DiscussionSearchFilters,
  Artifact,

  // WebSocket types
  WebSocketConfig as _WebSocketConfig,
  WebSocketEvent as _WebSocketEvent,
  TurnInfo,
  DiscussionWebSocketEvent as _DiscussionWebSocketEvent,

  // System types
  HealthStatus as _HealthStatus,
  SystemMetrics as _SystemMetrics,

  // LLM types
  LLMGenerationRequest as _LLMGenerationRequest,
  LLMModel,
  PersonaTemplate,

  // Knowledge Graph types
  KnowledgeItem,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeRelationship as _KnowledgeRelationship,
  AgentResponseRequest,
  ToolExecutionError,
  UserLLMProviderType,
  MCPToolItem,
} from '@uaip/types';

// Import enums separately (not as type imports)
import { LLMProviderType, TurnStrategy, KnowledgeType, SourceType } from '@uaip/types';
export { TurnStrategy };
export type { DiscussionEvent } from '@uaip/types';

// Import frontend-specific types
import type {
  MessageSearchOptions,
  PersonaDisplay,
  PersonaSearchResponse,
  DiscussionSearchResponse,
  DiscussionParticipantCreate,
  DiscussionMessageCreate,
  ModelProvider,
} from '@/types/frontend_extensions';
import { logger } from '@/utils/browser_logger';

type PersonaCreateInput = Parameters<typeof api.personas.create>[0];
type PersonaUpdateInput = Parameters<typeof api.personas.update>[1];
type ToolListInput = Parameters<typeof api.tools.list>[0];
type ToolCreateInput = Parameters<typeof api.tools.create>[0];
type ToolExecutionInput = Parameters<typeof api.tools.execute>[1];
type UserLLMCreateInput = Parameters<typeof api.llm.userLLM.createProvider>[0];
type KnowledgeUpdateInput = Parameters<typeof api.knowledge.update>[1];
export type ToolExecutionFacadeResult = {
  success: boolean;
  data?: unknown;
  executionId: string;
  executionTime: number;
  cost: number;
  error?: ToolExecutionError;
  metadata?: Record<string, unknown>;
};

function toToolExecutionError(message: string): ToolExecutionError {
  return {
    type: 'execution',
    message,
    recoverable: true,
  };
}

function toOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return undefined;
}

function toPersonaDisplay(persona: Persona): PersonaDisplay {
  return {
    id: persona.id,
    name: persona.name,
    role: persona.role,
    description: persona.description,
    tags: persona.tags ?? [],
    expertise: persona.expertise?.map((domain) => domain.name) ?? [],
    status: String(persona.status ?? 'draft'),
    category: persona.expertise?.[0]?.category ?? 'General',
    background: persona.background,
  };
}

const LLM_PROVIDER_TYPES = new Set<string>(Object.values(LLMProviderType));

function toLLMProviderType(value: string): LLMProviderType {
  return LLM_PROVIDER_TYPES.has(value) ? (value as LLMProviderType) : LLMProviderType.CUSTOM;
}

function toKnowledgeUploadType(
  type: KnowledgeIngestRequest['type']
): 'document' | 'concept' | 'entity' | 'relation' {
  switch (String(type ?? '').toLowerCase()) {
    case 'concept':
      return 'concept';
    case 'entity':
      return 'entity';
    case 'relation':
      return 'relation';
    default:
      return 'document';
  }
}

function getKnowledgeItem(result: import('@/api').KnowledgeSearchResult): KnowledgeItem {
  return {
    id: result.item.id,
    content: result.item.content,
    type: KnowledgeType.SEMANTIC,
    sourceType: SourceType.USER_INPUT,
    sourceIdentifier: result.item.title || result.item.id,
    sourceUrl: undefined,
    tags: result.item.tags ?? [],
    confidence: result.score,
    metadata: result.item.metadata ?? {},
    createdAt: new Date(result.item.createdAt),
    updatedAt: new Date(result.item.updatedAt),
    createdBy: result.item.createdBy,
    accessLevel: 'private',
  };
}

// Environment configuration
const envConfig = getEnvironmentConfig();
const isDevelopment = typeof window !== 'undefined' && window.location?.hostname === 'localhost';
const isProduction = !isDevelopment;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Generate unique IDs
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// API CLIENT CONFIGURATION
// ============================================================================

export function getAPIClient() {
  return api;
}

// ============================================================================
// WEBSOCKET CLIENT (REMOVED - Using useWebSocket hook instead)
// ============================================================================

// Enhanced API wrapper with production-ready error handling
export const uaipAPI = {
  get client() {
    return {
      ...api,

      getAuthToken: (): string | null => null,
      setAuthToken: (_token: string | null) => {},
      clearAuth: () => {},
      isAuthenticated: () => false,
      setAuthContext: (_context: {
        token: string;
        refreshToken?: string;
        userId: string;
        rememberMe?: boolean;
      }) => {},
      // Add health check endpoint
      health: async () => {
        try {
          const response = await edenRequest('/health', { method: 'GET' });
          return { success: true, data: response };
        } catch (error) {
          return {
            success: false,
            error: { message: error instanceof Error ? error.message : 'Health check failed' },
          };
        }
      },
    };
  },

  // Get current environment info
  getEnvironmentInfo() {
    return {
      isDevelopment,
      isProduction,
      baseURL: getEffectiveAPIBaseURL(),
      config: envConfig,
      routes: API_ROUTES,
    };
  },

  // WebSocket client access removed - using useWebSocket hook instead

  // ============================================================================
  // PERSONA API METHODS
  // ============================================================================

  personas: {
    async search(query?: string, _expertise?: string): Promise<PersonaSearchResponse> {
      try {
        const client = getAPIClient();

        const searchRequest = {
          query,
          isActive: true,
        };

        const response = await client.personas.search(searchRequest);

        // Handle the response data properly - it should be an array of personas
        const personas = Array.isArray(response) ? response.map(toPersonaDisplay) : [];

        return {
          personas: personas,
          total: personas.length,
          hasMore: false, // The backend doesn't provide pagination info yet
        };
      } catch (error) {
        logger.error('Failed to fetch personas:', error);
        throw error;
      }
    },

    async getForDisplay(): Promise<PersonaSearchResponse> {
      try {
        const client = getAPIClient();

        const response = await client.personas.getForDisplay({ isActive: true });

        // Handle the response data properly - it should be an array of personas
        const personas = Array.isArray(response) ? response.map(toPersonaDisplay) : [];

        return {
          personas: personas,
          total: personas.length,
          hasMore: false,
        };
      } catch (error) {
        logger.error('Failed to fetch personas for display:', error);
        throw error;
      }
    },
    async create(personaData: PersonaCreateInput): Promise<Persona> {
      const client = getAPIClient();
      return await client.personas.create(personaData);
    },

    async getTemplates(): Promise<PersonaTemplate[]> {
      const client = getAPIClient();
      return await client.personas.getTemplates();
    },

    async get(id: string): Promise<Persona> {
      const client = getAPIClient();
      return await client.personas.get(id);
    },

    async update(id: string, updates: PersonaUpdateInput): Promise<Persona> {
      const client = getAPIClient();
      return await client.personas.update(id, updates);
    },

    async delete(id: string): Promise<void> {
      const client = getAPIClient();
      await client.personas.delete(id);
    },
  },

  // ============================================================================
  // DISCUSSION API METHODS
  // ============================================================================

  discussions: {
    async list(
      filters?: DiscussionSearchFilters & { limit?: number; offset?: number }
    ): Promise<DiscussionSearchResponse> {
      const client = getAPIClient();
      const response = await client.discussions.list({
        limit: filters?.limit,
        status: filters?.status,
        page:
          filters?.offset && filters?.limit
            ? Math.floor(filters.offset / filters.limit) + 1
            : undefined,
      });

      // Transform the response to match our interface
      const responseData = response as
        | Discussion[]
        | { discussions?: Discussion[]; total?: number; totalCount?: number };

      const discussions = Array.isArray(responseData)
        ? responseData
        : Array.isArray(responseData?.discussions)
          ? responseData.discussions
          : [];

      const totalCount = Array.isArray(responseData)
        ? responseData.length
        : typeof responseData?.total === 'number'
          ? responseData.total
          : typeof responseData?.totalCount === 'number'
            ? responseData.totalCount
            : discussions.length;

      return {
        discussions,
        totalCount,
        searchTime: 0,
      };
    },

    async get(id: string): Promise<Discussion> {
      const client = getAPIClient();
      return await client.discussions.get(id);
    },

    async create(discussion: CreateDiscussionRequest): Promise<Discussion> {
      const client = getAPIClient();
      // Pass the discussion data directly since types are now aligned
      const response = await client.discussions.create(discussion);

      return response;
    },

    async update(id: string, updates: UpdateDiscussionRequest): Promise<Discussion> {
      const client = getAPIClient();
      return await client.discussions.update(id, updates);
    },

    async start(id: string, startedBy?: string): Promise<void> {
      const client = getAPIClient();
      // The API returns a Discussion object directly, not a response wrapper
      await client.discussions.start(id, startedBy);
    },

    async pause(id: string): Promise<void> {
      const client = getAPIClient();
      await client.discussions.pause(id, 'Discussion paused by user');
    },

    async resume(id: string): Promise<void> {
      const client = getAPIClient();
      await client.discussions.resume(id);
    },

    async end(id: string): Promise<void> {
      const client = getAPIClient();
      // Use the end method which exists in the API
      await client.discussions.end(id, 'Discussion terminated by user');
    },

    async addParticipant(
      id: string,
      participant: DiscussionParticipantCreate
    ): Promise<DiscussionParticipant> {
      const client = getAPIClient();
      return await client.discussions.addParticipant(id, participant.agentId);
    },

    async removeParticipant(id: string, participantId: string): Promise<void> {
      const client = getAPIClient();
      await client.discussions.removeParticipant(id, participantId);
    },

    async getMessages(id: string, options?: MessageSearchOptions): Promise<DiscussionMessage[]> {
      const client = getAPIClient();
      // Convert MessageSearchOptions to the format expected by discussions.api
      const apiOptions = {
        limit: options?.limit,
        page: options?.offset ? Math.floor(options.offset / (options.limit || 50)) + 1 : undefined,
      };
      return await client.discussions.getMessages(id, apiOptions);
    },

    async sendMessage(id: string, message: DiscussionMessageCreate): Promise<DiscussionMessage> {
      const client = getAPIClient();
      return await client.discussions.sendMessage(id, {
        content: message.content,
        metadata: message.metadata,
      });
    },

    async advanceTurn(id: string): Promise<void> {
      const client = getAPIClient();
      await client.discussions.advanceTurn(id);
    },

    async getCurrentTurn(_id: string): Promise<TurnInfo> {
      // This method doesn't exist in the base client, so we'll create a response
      return {
        currentParticipantId: 'participant-1',
        turnNumber: 1,
        timeRemaining: 300,
        nextParticipantId: 'participant-2',
        canAdvance: true,
        startedAt: new Date(),
        turnTimeout: 300,
      };
    },
  },

  artifacts: {
    async listByDiscussion(discussionId: string, userId: string): Promise<Artifact[]> {
      return await api.artifacts.listByDiscussion(discussionId, userId);
    },
  },

  // ============================================================================
  // AGENT API METHODS
  // ============================================================================

  agents: {
    async list(): Promise<Agent[]> {
      try {
        return await api.agents.list();
      } catch (error) {
        logger.error('Failed to fetch agents:', error);
        throw error;
      }
    },

    async get(id: string): Promise<Agent> {
      try {
        const agent = await api.agents.get(id);
        return agent;
      } catch (error) {
        logger.error(`Failed to fetch agent ${id}:`, error);
        throw error;
      }
    },

    async create(agentData: AgentCreate): Promise<Agent> {
      try {
        const agent = await api.agents.create(agentData);
        return agent;
      } catch (error) {
        logger.error('Failed to create agent:', error);
        throw error;
      }
    },

    async update(id: string, updates: AgentUpdate): Promise<Agent> {
      try {
        const agent = await api.agents.update(id, updates);
        return agent;
      } catch (error) {
        logger.error(`Failed to update agent ${id}:`, error);
        throw error;
      }
    },

    async delete(id: string): Promise<void> {
      try {
        await api.agents.delete(id);
      } catch (error) {
        logger.error(`Failed to delete agent ${id}:`, error);
      }
    },

    async chat(
      agentId: string,
      request: {
        message: string;
        conversationHistory?: Array<{
          content: string;
          sender: string;
          timestamp: string;
        }>;
        conversationId?: string;
        context?: unknown;
      }
    ): Promise<Awaited<ReturnType<typeof api.agents.chat>>> {
      try {
        return await api.agents.chat(agentId, {
          message: request.message,
          conversationId: request.conversationId,
          context: request.context || {},
        });
      } catch (error) {
        logger.error('Agent chat error:', error);

        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new Error(
              'Agent response timed out after 30 seconds. The LLM service may be busy.'
            );
          }
          if (error.message.includes('fetch')) {
            throw new Error(
              'Failed to connect to agent service. Please check if the backend is running.'
            );
          }
        }

        throw error;
      }
    },

    // Agent tool management functions
    async addTool(agentId: string, tool: MCPToolItem): Promise<MCPToolItem[]> {
      try {
        return await api.agents.assignTools(agentId, [tool]);
      } catch (error) {
        logger.error(`Failed to add tool ${tool.toolId} to agent ${agentId}:`, error);
        throw error;
      }
    },

    async removeTool(agentId: string, toolId: string): Promise<MCPToolItem[]> {
      try {
        return await api.agents.removeTool(agentId, toolId);
      } catch (error) {
        logger.error(`Failed to remove tool ${toolId} from agent ${agentId}:`, error);
        throw error;
      }
    },
  },

  // ============================================================================
  // TOOLS API METHODS
  // ============================================================================

  tools: {
    async list(criteria?: ToolListInput): Promise<unknown[]> {
      try {
        // Use the proper tools API method
        const tools = await api.tools.list(criteria);
        return tools || [];
      } catch (error) {
        logger.warn('Tools API failed, returning empty array:', error);
        return [];
      }
    },

    async get(id: string): Promise<unknown> {
      try {
        const client = getAPIClient();
        return await client.tools.get(id);
      } catch (error) {
        logger.error('Failed to get tool:', error);
        throw error;
      }
    },

    async create(toolData: ToolCreateInput): Promise<unknown> {
      try {
        const client = getAPIClient();
        return await client.tools.create(toolData);
      } catch (error) {
        logger.error('Failed to create tool:', error);
        throw error;
      }
    },

    async execute(toolId: string, params: ToolExecutionInput): Promise<ToolExecutionFacadeResult> {
      try {
        const client = getAPIClient();
        const response = await client.tools.execute(toolId, params);

        return {
          success: response.status === 'completed',
          data: response.output,
          executionId: response.id,
          executionTime: response.duration ?? 0,
          cost: 0,
          error: response.error ? toToolExecutionError(response.error) : undefined,
          metadata: toOptionalRecord(response.metadata),
        };
      } catch (error) {
        logger.error('Failed to execute tool:', error);
        return {
          success: false,
          error: toToolExecutionError(
            error instanceof Error ? error.message : 'Tool execution failed'
          ),
          executionId: `exec_${Date.now()}`,
          executionTime: 0,
          cost: 0,
        };
      }
    },

    async getCategories(): Promise<string[]> {
      try {
        const client = getAPIClient();
        const response = await client.tools.getCategories();
        return response.map((category) => String(category));
      } catch (error) {
        logger.warn('Failed to get tool categories, returning mock categories:', error);
        return ['System', 'External', 'Analysis', 'Communication', 'Development'];
      }
    },
  },

  // ============================================================================
  // LLM API METHODS (User-specific)
  // ============================================================================

  llm: {
    async getModels(): Promise<Array<LLMModel>> {
      try {
        // First try to get models from user's providers
        const userModels = await api.llm.userLLM.listModels();

        // Transform the response to match expected interface
        const transformedUserModels = userModels.map((model) => ({
          id: model.id || 'unknown',
          name: model.name || 'Unknown Model',
          description: model.description,
          source: model.source || 'unknown',
          apiEndpoint: model.apiEndpoint || '',
          apiType: toLLMProviderType(model.apiType),
          provider: model.provider || 'unknown',
          isAvailable: model.isAvailable || false,
        }));

        // If user has models, return them
        if (transformedUserModels.length > 0) {
          return transformedUserModels;
        }
      } catch (error) {
        logger.warn('Failed to get user models, falling back to system models:', error);
      }

      // Fallback to system models if user has no providers
      try {
        const systemModels = await api.llm.listModels();
        return systemModels.map((model) => ({
          id: model.id || 'unknown',
          name: model.name || 'Unknown Model',
          description: model.description,
          source: model.source || 'unknown',
          apiEndpoint: model.apiEndpoint || '',
          apiType: model.apiType ?? LLMProviderType.CUSTOM,
          provider: model.provider || 'unknown',
          isAvailable: model.isAvailable || false,
        }));
      } catch (error) {
        logger.error('Failed to get system models:', error);
        return [];
      }
    },

    async getProviders(): Promise<ModelProvider[]> {
      const providers = await api.llm.userLLM.listProviders();

      // Transform the response to match expected interface
      return providers.map((provider) => ({
        id: provider.id || 'unknown',
        name: provider.name || 'Unknown Provider',
        description: provider.description,
        type: provider.type || 'custom',
        baseUrl: provider.baseUrl || '',
        defaultModel: provider.defaultModel,
        status: provider.isActive ? 'active' : 'inactive',
        isActive: provider.isActive || false,
        priority: 0,
        totalTokensUsed: 0,
        totalRequests: 0,
        totalErrors: 0,
        hasApiKey: provider.hasApiKey || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    },

    async createProvider(providerData: UserLLMCreateInput): Promise<unknown> {
      try {
        const provider = await api.llm.userLLM.createProvider(providerData);
        return provider;
      } catch (error) {
        logger.error('Failed to create provider:', error);
        throw error;
      }
    },

    async updateProviderConfig(
      providerId: string,
      config: {
        name?: string;
        description?: string;
        type?: UserLLMProviderType;
        baseUrl?: string;
        apiKey?: string;
        defaultModel?: string;
        priority?: number;
        configuration?: Record<string, unknown>;
        isActive?: boolean;
      }
    ): Promise<void> {
      const client = getAPIClient();
      const { apiKey, ...providerConfig } = config;
      await client.llm.userLLM.updateProvider(providerId, providerConfig);
      if (apiKey) {
        await client.llm.userLLM.updateProviderApiKey(providerId, { apiKey });
      }
    },

    async updateProviderApiKey(providerId: string, apiKey: string): Promise<void> {
      const client = getAPIClient();
      await client.llm.userLLM.updateProviderApiKey(providerId, { apiKey });
    },

    async updateProvider(
      providerId: string,
      updates: {
        name?: string;
        description?: string;
        baseUrl?: string;
        apiKey?: string;
        defaultModel?: string;
        type?: UserLLMProviderType;
        priority?: number;
        configuration?: Record<string, unknown>;
        isActive?: boolean;
      }
    ): Promise<void> {
      const client = getAPIClient();
      const {
        name,
        description,
        baseUrl,
        defaultModel,
        priority,
        configuration,
        apiKey,
        isActive,
        type,
      } = updates;
      await client.llm.userLLM.updateProvider(providerId, {
        name,
        description,
        type,
        baseUrl,
        defaultModel,
        priority,
        configuration,
        isActive,
      });
      if (apiKey) {
        await client.llm.userLLM.updateProviderApiKey(providerId, { apiKey });
      }
    },

    async testProvider(providerId: string): Promise<unknown> {
      const response = await api.llm.userLLM.testProvider(providerId);
      return response;
    },

    async deleteProvider(providerId: string): Promise<void> {
      await api.llm.userLLM.deleteProvider(providerId);
    },

    async generateResponse(request: {
      prompt: string;
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
      model?: string;
      preferredType?: LLMProviderType;
    }): Promise<unknown> {
      const client = getAPIClient();
      return await client.llm.userLLM.generate(request);
    },

    async generateAgentResponse(request: AgentResponseRequest): Promise<unknown> {
      const client = getAPIClient();
      return await client.llm.userLLM.generateAgentResponse(request);
    },

    // Legacy methods for backward compatibility
    async getModelsFromProvider(_providerType: string): Promise<
      Array<{
        id: string;
        name: string;
        description?: string;
        source: string;
        apiEndpoint: string;
      }>
    > {
      // This method is not available in user LLM routes, so we'll return empty array
      logger.warn('getModelsFromProvider is not available in user LLM routes');
      return [];
    },

    async getProviderStats(): Promise<
      Array<{
        name: string;
        type: string;
        available: boolean;
      }>
    > {
      try {
        // Convert user providers to provider stats format
        const providers = await this.getProviders();
        return providers.map((provider: { name: string; type: string; isActive: boolean; status: string }) => ({
          name: provider.name,
          type: provider.type,
          available: provider.isActive && provider.status === 'active',
        }));
      } catch (error) {
        logger.warn('Failed to get user provider stats, returning empty array:', error);
        return [];
      }
    },

    async generateArtifact(request: {
      type: string;
      prompt: string;
      language?: string;
      framework?: string;
      requirements?: string[];
    }): Promise<unknown> {
      // Use general generate response for artifacts
      return this.generateResponse({
        prompt: `Generate a ${request.type} ${request.language ? `in ${request.language}` : ''} based on: ${request.prompt}`,
        systemPrompt: `You are an expert ${request.type} generator. Generate clean, well-structured code.`,
        maxTokens: 2000,
        temperature: 0.3,
      });
    },

    async analyzeContext(request: {
      conversationHistory: unknown[];
      currentContext?: unknown;
      userRequest?: string;
      agentCapabilities?: string[];
    }): Promise<unknown> {
      // Use general generate response for context analysis
      const prompt = `Analyze the following conversation context: ${JSON.stringify(request)}`;
      return this.generateResponse({
        prompt,
        systemPrompt: 'You are an expert conversation analyst. Provide structured insights.',
        maxTokens: 1000,
        temperature: 0.2,
      });
    },
  },

  // ============================================================================
  // APPROVALS API METHODS
  // ============================================================================

  approvals: {
    async approve(executionId: string, approvalData: { approverId: string }): Promise<void> {
      try {
        await api.approvals.submitDecision(executionId, {
          decision: 'approve',
          reason: `Approved by ${approvalData.approverId}`,
        });
      } catch (error) {
        logger.error('Approval API failed:', error);
        throw error; // Re-throw to let the UI handle the error
      }
    },

    async reject(
      executionId: string,
      rejectionData: { approverId: string; reason: string }
    ): Promise<void> {
      try {
        await api.approvals.submitDecision(executionId, {
          decision: 'reject',
          reason: rejectionData.reason,
        });
      } catch (error) {
        logger.error('Rejection API failed:', error);
        throw error; // Re-throw to let the UI handle the error
      }
    },

    async getPending(): Promise<unknown[]> {
      try {
        const response = await api.approvals.getPending();
        if (Array.isArray(response)) {
          return response;
        } else {
          logger.warn('getPending() returned unexpected format:', response);
          return [];
        }
      } catch (error) {
        logger.error('Failed to get pending approvals:', error);
        // Return empty array instead of throwing to prevent infinite retries
        return [];
      }
    },
  },

  // Knowledge Graph System
  knowledge: {
    async uploadKnowledge(items: KnowledgeIngestRequest[]): Promise<KnowledgeIngestResponse> {
      try {
        // Use bulk upload if available, otherwise upload individually
        const client = getAPIClient();
        const uploadResults = await Promise.all(
          items.map((item) =>
            client.knowledge.upload({
              title: item.source.identifier || item.content.slice(0, 80) || 'Untitled',
              content: item.content,
              type: toKnowledgeUploadType(item.type),
              category: item.source.type,
              tags: item.tags,
              metadata: item.source.metadata,
            })
          )
        );

        return {
          items: uploadResults,
          processedCount: uploadResults.length,
          errors: [],
          success: true,
        };
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to upload knowledge');
      }
    },

    async searchKnowledge(query: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
      try {
        const client = getAPIClient();
        const searchResults = await client.knowledge.search(query);

        // Validate searchResults structure
        if (!Array.isArray(searchResults)) {
          logger.warn('Search results is not an array:', searchResults);
          return {
            items: [],
            totalCount: 0,
            searchMetadata: {
              query: query.query || '',
              processingTime: 0,
              similarityScores: [],
              filtersApplied: [],
            },
          };
        }

        // Transform search results to expected format
        const items = searchResults.map(getKnowledgeItem);
        return {
          items,
          totalCount: items.length,
          searchMetadata: {
            query: query.query || '',
            processingTime: 0,
            similarityScores: searchResults.map((r) => r.score || 0),
            filtersApplied: [],
          },
        };
      } catch (error) {
        logger.warn('Knowledge search API failed, returning empty results:', error);
        return {
          items: [],
          totalCount: 0,
          searchMetadata: {
            query: query.query || '',
            processingTime: 0,
            similarityScores: [],
            filtersApplied: [],
          },
        };
      }
    },

    async updateKnowledge(itemId: string, updates: KnowledgeUpdateInput): Promise<KnowledgeItem> {
      try {
        const client = getAPIClient();
        return await client.knowledge.update(itemId, updates);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to update knowledge');
      }
    },

    async deleteKnowledge(itemId: string): Promise<void> {
      try {
        const client = getAPIClient();
        await client.knowledge.delete(itemId);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to delete knowledge');
      }
    },

    async getKnowledgeStats(): Promise<{
      totalItems: number;
      itemsByType: Record<string, number>;
      itemsBySource: Record<string, number>;
      recentActivity: Array<{
        date: string;
        uploads: number;
        searches: number;
      }>;
    }> {
      try {
        const client = getAPIClient();
        const stats = await client.knowledge.getStats();

        // Transform API stats to expected format (now including general knowledge!)
        return {
          totalItems: stats.totalItems || 0,
          itemsByType: stats.itemsByType || {},
          itemsBySource: stats.itemsByCategory || {},
          recentActivity: [
            {
              date: new Date().toISOString().split('T')[0],
              uploads: stats.recentUploads || 0,
              searches: 0, // API doesn't track searches
            },
          ],
        };
      } catch (error) {
        logger.warn('Knowledge stats API failed, returning mock data:', error);
        // Return mock data to prevent infinite loops
        return {
          totalItems: 0,
          itemsByType: {},
          itemsBySource: {},
          recentActivity: [
            {
              date: new Date().toISOString().split('T')[0],
              uploads: 0,
              searches: 0,
            },
          ],
        };
      }
    },

    async getRelatedKnowledge(itemId: string): Promise<KnowledgeItem[]> {
      try {
        const client = getAPIClient();
        const relatedItems = await client.knowledge.findSimilar(itemId);
        return relatedItems.map(getKnowledgeItem);
      } catch (error) {
        logger.warn('Similar items endpoint unavailable, returning empty:', error);
        return [];
      }
    },

    async getKnowledgeByTag(tag: string): Promise<KnowledgeItem[]> {
      try {
        const client = getAPIClient();
        const searchResults = await client.knowledge.search({
          query: '',
          filters: { tags: [tag] },
          timestamp: Date.now(),
        });
        return searchResults.map(getKnowledgeItem);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to get knowledge by tag');
      }
    },

    async getKnowledgeItem(itemId: string): Promise<KnowledgeItem> {
      try {
        const client = getAPIClient();
        return await client.knowledge.get(itemId);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to get knowledge item');
      }
    },

    async getAllKnowledge(options?: { limit?: number; offset?: number }): Promise<KnowledgeItem[]> {
      try {
        const client = getAPIClient();
        return await client.knowledge.list(options);
      } catch (error) {
        logger.warn('Failed to get all knowledge items:', error);
        return [];
      }
    },

    async getKnowledgeGraph(options?: {
      rootId?: string;
      depth?: number;
      types?: string[];
      limit?: number;
    }): Promise<{
      nodes: Array<{
        id: string;
        label: string;
        type: string;
        properties?: Record<string, unknown>;
      }>;
      edges: Array<{
        source: string;
        target: string;
        type: string;
        properties?: Record<string, unknown>;
      }>;
    }> {
      try {
        const client = getAPIClient();
        return await client.knowledge.getGraph(options);
      } catch (error) {
        logger.warn('Knowledge graph API failed, returning empty graph:', error);
        return {
          nodes: [],
          edges: [],
        };
      }
    },
  },

  // ============================================================================
  // MCP CONFIGURATION API METHODS
  // ============================================================================

  mcp: {
    async uploadConfig(configFile: File): Promise<{
      message: string;
      configPath: string;
      serversProcessed: number;
      successCount: number;
      errorCount: number;
      skippedCount: number;
      installationResults: Array<{
        name: string;
        status: 'success' | 'error' | 'skipped';
        error?: string;
        pid?: number;
      }>;
      installationStatus: Record<string, string>;
      installationErrors: Record<string, string>;
      mergedServers: string[];
    }> {
      try {
        return await api.mcp.uploadConfig(configFile);
      } catch (error) {
        logger.error('MCP config upload error:', error);
        throw error;
      }
    },

    async getStatus(): Promise<{
      configExists: boolean;
      configPath: string;
      servers: Array<{
        name: string;
        command: string;
        args: string[];
        disabled: boolean;
        status: 'unknown' | 'running' | 'stopped' | 'error' | 'starting';
        toolCount?: number;
        uptime?: number;
      }>;
    }> {
      try {
        return await api.mcp.getStatus();
      } catch (error) {
        logger.error('MCP status error:', error);
        throw error;
      }
    },

    async getConfig(): Promise<{
      exists: boolean;
      config: unknown | null;
      serversCount?: number;
      servers?: string[];
      message?: string;
    }> {
      try {
        return await api.mcp.getConfig();
      } catch (error) {
        logger.error('MCP config error:', error);
        throw error;
      }
    },

    async restartServer(serverName: string): Promise<{
      message: string;
      serverName: string;
      status: string;
    }> {
      try {
        return await api.mcp.restartServer(serverName);
      } catch (error) {
        logger.error('MCP server restart error:', error);
        throw error;
      }
    },

    async getTools(): Promise<{
      tools: Array<{
        id: string;
        name: string;
        description: string;
        serverName: string;
        command: string;
        parameters: unknown;
        category: string;
      }>;
      count: number;
      servers: string[];
    }> {
      try {
        const response = await api.mcp.getTools();
        return {
          count: response.count,
          servers: response.servers,
          tools: response.tools.map((tool, index) => ({
            id: `${response.servers[0] ?? 'mcp'}:${tool.name}:${index}`,
            name: tool.name,
            description: tool.description,
            serverName: response.servers[0] ?? 'mcp',
            command: tool.name,
            parameters: tool.inputSchema,
            category: 'mcp',
          })),
        };
      } catch (error) {
        logger.error('MCP tools error:', error);
        throw error;
      }
    },
  },

  eden: {
    core: coreClient,
    gateway: gatewayClient,
    unwrap: unwrapEden,
    withCSRFRetry: edenWithCSRFRetry,
  },
};

export default uaipAPI;
