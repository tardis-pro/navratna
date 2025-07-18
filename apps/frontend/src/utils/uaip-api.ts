/**
 * UAIP Frontend API Service
 * 
 * This service provides a clean interface between the frontend components
 * and the UAIP backend services. It handles API calls, error handling,
 * and data transformation for the frontend.
 */

// Import the backend API client
export * from './api';
import { APIClient, api } from '@/api';
import { API_CONFIG, getEffectiveAPIBaseURL, getEnvironmentConfig, buildAPIURL, API_ROUTES } from '@/config/apiConfig';

// Import shared types - using regular imports for enums and type imports for interfaces
import type {
  // Persona types
  Persona,
  PersonaTrait,
  ExpertiseDomain,
  ConversationalStyle,
  CreatePersonaRequest,
  UpdatePersonaRequest,
  PersonaSearchFilters,
  PersonaRecommendation,

  // Discussion types
  Discussion,
  DiscussionParticipant,
  DiscussionMessage,
  DiscussionSettings,
  DiscussionState,
  TurnStrategy,
  TurnStrategyConfig,
  CreateDiscussionRequest,
  UpdateDiscussionRequest,
  DiscussionSearchFilters,

  // WebSocket types
  WebSocketConfig,
  WebSocketEvent,
  TurnInfo,
  DiscussionWebSocketEvent,

  // System types
  HealthStatus,
  SystemMetrics,

  // LLM types
  LLMGenerationRequest,
  LLMModel,
  PersonaTemplate,

  // Knowledge Graph types
  KnowledgeItem,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeRelationship,
  KnowledgeType,
  SourceType
} from '@uaip/types';

// Import enums separately (not as type imports)
import {
  DiscussionStatus,
  MessageType,
  LLMProviderType
} from '@uaip/types';

// Import frontend-specific types
import type {
  MessageSearchOptions,
  PersonaDisplay,
  PersonaSearchResponse,
  DiscussionSearchResponse,
  DiscussionParticipantCreate,
  DiscussionMessageCreate,
  ModelProvider,
} from '@/types/frontend-extensions';

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
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
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
      // Expose all API modules
      ...api,
      
      // Add auth management methods from APIClient
      getAuthToken: () => APIClient.getAuthToken(),
      setAuthToken: (token: string | null, refreshToken?: string, rememberMe?: boolean) => {
        APIClient.setAuthToken(token);
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        if (rememberMe) {
          localStorage.setItem('accessToken', token || '');
          if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        } else {
          sessionStorage.setItem('accessToken', token || '');
          if (refreshToken) sessionStorage.setItem('refreshToken', refreshToken);
        }
      },
      clearAuth: () => {
        APIClient.clearAuthToken();
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
      },
      isAuthenticated: () => {
        const token = APIClient.getAuthToken();
        return !!token;
      },
      setUserContext: (userId: string, userRole?: string, rememberMe?: boolean) => {
        // Store user context for API requests
        if (rememberMe) {
          localStorage.setItem('userId', userId);
          if (userRole) localStorage.setItem('userRole', userRole);
        } else {
          sessionStorage.setItem('userId', userId);
          if (userRole) sessionStorage.setItem('userRole', userRole);
        }
      },
      setAuthContext: (context: {
        token: string;
        refreshToken?: string;
        userId: string;
        rememberMe?: boolean;
      }) => {
        APIClient.setAuthToken(context.token);
        const storage = context.rememberMe ? localStorage : sessionStorage;
        storage.setItem('accessToken', context.token);
        storage.setItem('userId', context.userId);
        if (context.refreshToken) {
          storage.setItem('refreshToken', context.refreshToken);
        }
      },
      // Add health check endpoint
      health: async () => {
        try {
          const response = await APIClient.get('/health');
          return { success: true, data: response };
        } catch (error) {
          return { success: false, error: { message: error instanceof Error ? error.message : 'Health check failed' } };
        }
      }
    };
  },

  // Get current environment info
  getEnvironmentInfo() {
    return {
      isDevelopment,
      isProduction,
      baseURL: getEffectiveAPIBaseURL(),
      config: envConfig,
      routes: API_ROUTES
    };
  },

  // WebSocket client access removed - using useWebSocket hook instead


  // ============================================================================
  // PERSONA API METHODS
  // ============================================================================

  personas: {
    async search(query?: string, expertise?: string): Promise<PersonaSearchResponse> {
      try {
        const client = getAPIClient();

        const searchRequest = {
          query,
          isActive: true
        };

        const response = await client.personas.search(searchRequest);
        console.log('🔍 Persona search response:', response);

        // Handle the response data properly - it should be an array of personas
        const personas = Array.isArray(response) ? response : [];

        return {
          personas: personas,
          total: personas.length,
          hasMore: false // The backend doesn't provide pagination info yet
        };
      } catch (error) {
        console.error('Failed to fetch personas:', error);
        throw error;
      }
    },

    async getForDisplay(): Promise<PersonaSearchResponse> {
      try {
        const client = getAPIClient();

        const response = await client.personas.getForDisplay({ isActive: true });
        console.log('🔍 Persona display response:', response);

        // Handle the response data properly - it should be an array of personas
        const personas = Array.isArray(response) ? response : [];

        return {
          personas: personas,
          total: personas.length,
          hasMore: false
        };
      } catch (error) {
        console.error('Failed to fetch personas for display:', error);
        throw error;
      }
    },
    async create(personaData: Partial<Persona>): Promise<Persona> {
      const client = getAPIClient();
      const response = await client.personas.create(personaData);
      return response.data;
    },

    async getTemplates(): Promise<PersonaTemplate[]> {
      const client = getAPIClient();
      const response = await client.personas.getTemplates();
      return response.data;
    },

    async get(id: string): Promise<Persona> {
      const client = getAPIClient();
      const response = await client.personas.get(id);
      return response.data;
    },

    async update(id: string, updates: Partial<Persona>): Promise<Persona> {
      const client = getAPIClient();
      const response = await client.personas.update(id, updates);
      return response.data;
    },

    async delete(id: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.personas.delete(id);
      return response.data;
    },



  },

  // ============================================================================
  // DISCUSSION API METHODS
  // ============================================================================

  discussions: {
    async list(filters?: DiscussionSearchFilters): Promise<DiscussionSearchResponse> {
      const client = getAPIClient();
      const response = await client.discussions.search(filters?.query, filters?.status?.[0]);

      // Transform the response to match our interface
      return {
        discussions: response.data || [],
        totalCount: response.data?.length || 0,
        searchTime: 0
      };
    },

    async get(id: string): Promise<Discussion> {
      const client = getAPIClient();
      const response = await client.discussions.get(id);

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch discussion');
      }

      return response.data!;
    },

    async create(discussion: CreateDiscussionRequest): Promise<Discussion> {
      const client = getAPIClient();
      // Pass the discussion data directly since types are now aligned
      const response = await client.discussions.create(discussion);

      return response;
    },

    async update(id: string, updates: UpdateDiscussionRequest): Promise<Discussion> {
      const client = getAPIClient();
      const response = await client.discussions.update(id, updates);

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update discussion');
      }

      return response.data!;
    },

    async start(id: string, startedBy?: string): Promise<void> {
      const client = getAPIClient();
      // The API returns a Discussion object directly, not a response wrapper
      await client.discussions.start(id, startedBy);
    },

    async pause(id: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.discussions.update(id, { status: DiscussionStatus.PAUSED });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to pause discussion');
      }
    },

    async resume(id: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.discussions.update(id, { status: DiscussionStatus.ACTIVE });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to resume discussion');
      }
    },

    async end(id: string): Promise<void> {
      const client = getAPIClient();
      // Use the end method which exists in the API
      await client.discussions.end(id, 'Discussion terminated by user');
    },

    async addParticipant(id: string, participant: DiscussionParticipantCreate): Promise<DiscussionParticipant> {
      const client = getAPIClient();
      const response = await client.discussions.addParticipant(id, {
        agentId: participant.agentId,
        role: participant.role || 'participant'
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to add participant');
      }

      return response.data!;
    },

    async removeParticipant(id: string, participantId: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.discussions.removeParticipant(id, participantId);

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to remove participant');
      }
    },

    async getMessages(id: string, options?: MessageSearchOptions): Promise<DiscussionMessage[]> {
      const client = getAPIClient();
      // Convert MessageSearchOptions to the format expected by discussions.api
      const apiOptions = {
        limit: options?.limit,
        page: options?.offset ? Math.floor(options.offset / (options.limit || 50)) + 1 : undefined
      };
      return await client.discussions.getMessages(id, apiOptions);
    },

    async sendMessage(id: string, message: DiscussionMessageCreate): Promise<DiscussionMessage> {
      const client = getAPIClient();
      // Find the participant ID for this discussion - for now use a placeholder
      const response = await client.discussions.sendMessage(id, 'current-participant', {
        content: message.content,
        messageType: message.messageType || MessageType.MESSAGE,
        metadata: message.metadata
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to send message');
      }

      return response.data!;
    },

    async advanceTurn(id: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.discussions.advanceTurn(id, {
        force: false,
        reason: 'Turn advanced by user'
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to advance turn');
      }
    },

    async getCurrentTurn(id: string): Promise<TurnInfo> {
      // This method doesn't exist in the base client, so we'll create a response
      return {
        currentParticipantId: 'participant-1',
        turnNumber: 1,
        timeRemaining: 300,
        nextParticipantId: 'participant-2',
        canAdvance: true,
        startedAt: new Date(),
        turnTimeout: 300
      };
    }
  },

  // ============================================================================
  // AGENT API METHODS
  // ============================================================================

  agents: {
    async list(): Promise<any[]> {
      try {
        const agents = await api.agents.list();
        return agents || [];
      } catch (error) {
        console.error('Failed to fetch agents:', error);
        throw error;
      }
    },

    async get(id: string): Promise<any> {
      try {
        const agent = await api.agents.get(id);
        return agent;
      } catch (error) {
        console.error(`Failed to fetch agent ${id}:`, error);
        throw error;
      }
    },

    async create(agentData: any): Promise<any> {
      try {
        const agent = await api.agents.create(agentData);
        return agent;
      } catch (error) {
        console.error('Failed to create agent:', error);
        throw error;
      }
    },

    async update(id: string, updates: any): Promise<any> {
      try {
        const agent = await api.agents.update(id, updates);
        return agent;
      } catch (error) {
        console.error(`Failed to update agent ${id}:`, error);
        throw error;
      }
    },

    async delete(id: string): Promise<void> {
      try {
        await api.agents.delete(id);
      } catch (error) {
        console.error(`Failed to delete agent ${id}:`, error);
      }
    },

    async chat(agentId: string, request: {
      message: string;
      conversationHistory?: Array<{
        content: string;
        sender: string;
        timestamp: string;
      }>;
      context?: any;
    }): Promise<{
      response: string;
      agentName: string;
      confidence: number;
      model: string;
      tokensUsed: number;
      memoryEnhanced: boolean;
      knowledgeUsed: number;
      persona?: any;
      conversationContext: any;
      timestamp: string;
      toolsExecuted?: Array<any>;
    }> {
      try {
        const authToken = APIClient.getAuthToken();

        // Make direct HTTP request to the agent chat endpoint with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(`/api/v1/agents/${agentId}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            message: request.message,
            conversationHistory: request.conversationHistory || [],
            context: request.context || {}
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error?.message || 'Failed to chat with agent');
        }

        return {
          response: data.data.response,
          agentName: data.data.agentName,
          confidence: data.data.confidence || 0.8,
          model: data.data.model || 'unknown',
          tokensUsed: data.data.tokensUsed || 0,
          memoryEnhanced: data.data.memoryEnhanced || false,
          knowledgeUsed: data.data.knowledgeUsed || 0,
          persona: data.data.persona,
          conversationContext: data.data.conversationContext || {},
          timestamp: data.data.timestamp || new Date().toISOString(),
          toolsExecuted: data.data.toolsExecuted || []
        };
      } catch (error) {
        console.error('Agent chat error:', error);

        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new Error('Agent response timed out after 30 seconds. The LLM service may be busy.');
          }
          if (error.message.includes('fetch')) {
            throw new Error('Failed to connect to agent service. Please check if the backend is running.');
          }
        }

        throw error;
      }
    },

    // Agent tool management functions
    async addTool(agentId: string, toolId: string): Promise<any> {
      try {
        return await APIClient.post(`/api/v1/agents/${agentId}/tools`, { toolId });
      } catch (error) {
        console.error(`Failed to add tool ${toolId} to agent ${agentId}:`, error);
        throw error;
      }
    },

    async removeTool(agentId: string, toolId: string): Promise<any> {
      try {
        return await APIClient.delete(`/api/v1/agents/${agentId}/tools/${toolId}`);
      } catch (error) {
        console.error(`Failed to remove tool ${toolId} from agent ${agentId}:`, error);
        throw error;
      }
    }
  },

  // ============================================================================
  // TOOLS API METHODS
  // ============================================================================

  tools: {
    async list(criteria?: any): Promise<any[]> {
      try {
        // Use the proper tools API method
        const tools = await api.tools.list(criteria);
        return tools || [];
      } catch (error) {
        console.warn('Tools API failed, returning empty array:', error);
        return [];
      }
    },

    async get(id: string): Promise<any> {
      try {
        const client = getAPIClient();
        const response = await client.tools.get(id);

        if (!response.success) {
          throw new Error(response.error?.message || 'Failed to fetch tool');
        }

        return response.data!;
      } catch (error) {
        console.error('Failed to get tool:', error);
        throw error;
      }
    },

    async create(toolData: any): Promise<any> {
      try {
        const client = getAPIClient();
        const response = await client.tools.register(toolData);

        if (!response.success) {
          throw new Error(response.error?.message || 'Failed to create tool');
        }

        return response.data!;
      } catch (error) {
        console.error('Failed to create tool:', error);
        throw error;
      }
    },

    async execute(toolId: string, params: any): Promise<any> {
      try {
        const client = getAPIClient();
        const response = await client.tools.execute(toolId, params);

        if (!response.success) {
          throw new Error(response.error?.message || 'Failed to execute tool');
        }

        return {
          success: true,
          data: response.data,
          executionId: `exec_${Date.now()}`,
          executionTime: Math.random() * 1000,
          cost: Math.random() * 10
        };
      } catch (error) {
        console.error('Failed to execute tool:', error);
        return {
          success: false,
          error: { message: error instanceof Error ? error.message : 'Tool execution failed' },
          executionId: `exec_${Date.now()}`,
          executionTime: 0,
          cost: 0
        };
      }
    },

    async getCategories(): Promise<string[]> {
      try {
        const client = getAPIClient();
        const response = await client.tools.getCategories();

        if (!response.success) {
          console.warn('Categories API not available, returning mock categories');
          return ['System', 'External', 'Analysis', 'Communication', 'Development'];
        }

        return response.data!;
      } catch (error) {
        console.warn('Failed to get tool categories, returning mock categories:', error);
        return ['System', 'External', 'Analysis', 'Communication', 'Development'];
      }
    }
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
        const transformedUserModels = userModels.map((model: any) => ({
          id: model.id || 'unknown',
          name: model.name || 'Unknown Model',
          description: model.description,
          source: model.source || 'unknown',
          apiEndpoint: model.apiEndpoint || '',
          apiType: model.apiType || 'custom',
          provider: model.provider || 'unknown',
          isAvailable: model.isAvailable || false
        }));

        // If user has models, return them
        if (transformedUserModels.length > 0) {
          return transformedUserModels;
        }
      } catch (error) {
        console.warn('Failed to get user models, falling back to system models:', error);
      }
      
      // Fallback to system models if user has no providers
      try {
        const systemModels = await api.llm.listModels();
        return systemModels.map((model: any) => ({
          id: model.id || 'unknown',
          name: model.name || 'Unknown Model',
          description: model.description,
          source: model.source || 'unknown',
          apiEndpoint: model.apiEndpoint || '',
          apiType: model.apiType || 'custom',
          provider: model.provider || 'unknown',
          isAvailable: model.isActive || false
        }));
      } catch (error) {
        console.error('Failed to get system models:', error);
        return [];
      }
    },

    async getProviders(): Promise<Array<{
      id: string;
      name: string;
      description?: string;
      type: string;
      baseUrl: string;
      defaultModel?: string;
      status: string;
      isActive: boolean;
      priority: number;
      totalTokensUsed: number;
      totalRequests: number;
      totalErrors: number;
      lastUsedAt?: string;
      healthCheckResult?: any;
      hasApiKey: boolean;
      createdAt: string;
      updatedAt: string;
    }>> {
      const providers = await api.llm.userLLM.listProviders();

      // Transform the response to match expected interface
      return providers.map((provider: any) => ({
        id: provider.id || 'unknown',
        name: provider.name || 'Unknown Provider',
        description: provider.description,
        type: provider.type || 'custom',
        baseUrl: provider.baseUrl || '',
        defaultModel: provider.defaultModel,
        status: provider.status || 'inactive',
        isActive: provider.isActive || false,
        priority: provider.priority || 0,
        totalTokensUsed: provider.totalTokensUsed || 0,
        totalRequests: provider.totalRequests || 0,
        totalErrors: provider.totalErrors || 0,
        lastUsedAt: provider.lastUsedAt,
        healthCheckResult: provider.healthCheckResult,
        hasApiKey: provider.hasApiKey || false,
        createdAt: provider.createdAt || new Date().toISOString(),
        updatedAt: provider.updatedAt || new Date().toISOString()
      }));
    },

    async createProvider(providerData: ModelProvider): Promise<any> {
      try {
        const provider = await api.llm.userLLM.createProvider(providerData);
        return provider;
      } catch (error) {
        console.error('Failed to create provider:', error);
        throw error;
      }
    },

    async updateProviderConfig(providerId: string, config: {
      name?: string;
      description?: string;
      baseUrl?: string;
      defaultModel?: string;
      priority?: number;
      configuration?: any;
    }): Promise<void> {
      const client = getAPIClient();
      await client.llm.userLLM.updateProvider(providerId, config);
    },

    async updateProviderApiKey(providerId: string, apiKey: string): Promise<void> {
      const client = getAPIClient();
      await client.llm.userLLM.updateProvider(providerId, { apiKey });
    },

    async updateProvider(providerId: string, updates: {
      name?: string;
      description?: string;
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
      priority?: number;
      configuration?: any;
      isActive?: boolean;
    }): Promise<void> {
      const client = getAPIClient();
      await client.llm.userLLM.updateProvider(providerId, updates);
    },

    async testProvider(providerId: string): Promise<any> {
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
    }): Promise<any> {
      const client = getAPIClient();
      const response = await client.userLLM.generateResponse(request);

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to generate response');
      }

      return response.data!;
    },

    async generateAgentResponse(request: {
      agent: any;
      messages: any[];
      context?: any;
      tools?: any[];
    }): Promise<any> {
      const client = getAPIClient();
      const response = await client.userLLM.generateAgentResponse(request);

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to generate agent response');
      }

      return response.data!;
    },

    // Legacy methods for backward compatibility
    async getModelsFromProvider(providerType: string): Promise<Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
    }>> {
      // This method is not available in user LLM routes, so we'll return empty array
      console.warn('getModelsFromProvider is not available in user LLM routes');
      return [];
    },

    async getProviderStats(): Promise<Array<{
      name: string;
      type: string;
      available: boolean;
    }>> {
      try {
        // Convert user providers to provider stats format
        const providers = await this.getProviders();
        return providers.map(provider => ({
          name: provider.name,
          type: provider.type,
          available: provider.isActive && provider.status === 'active'
        }));
      } catch (error) {
        console.warn('Failed to get user provider stats, returning empty array:', error);
        return [];
      }
    },

    async generateArtifact(request: {
      type: string;
      prompt: string;
      language?: string;
      framework?: string;
      requirements?: string[];
    }): Promise<any> {
      // Use general generate response for artifacts
      return this.generateResponse({
        prompt: `Generate a ${request.type} ${request.language ? `in ${request.language}` : ''} based on: ${request.prompt}`,
        systemPrompt: `You are an expert ${request.type} generator. Generate clean, well-structured code.`,
        maxTokens: 2000,
        temperature: 0.3
      });
    },

    async analyzeContext(request: {
      conversationHistory: any[];
      currentContext?: any;
      userRequest?: string;
      agentCapabilities?: string[];
    }): Promise<any> {
      // Use general generate response for context analysis
      const prompt = `Analyze the following conversation context: ${JSON.stringify(request)}`;
      return this.generateResponse({
        prompt,
        systemPrompt: 'You are an expert conversation analyst. Provide structured insights.',
        maxTokens: 1000,
        temperature: 0.2
      });
    }
  },

  // ============================================================================
  // APPROVALS API METHODS
  // ============================================================================

  approvals: {
    async approve(executionId: string, approvalData: { approverId: string }): Promise<void> {
      try {
        await api.approvals.submitDecision(executionId, {
          decision: 'approve',
          reason: `Approved by ${approvalData.approverId}`
        });
      } catch (error) {
        console.error('Approval API failed:', error);
        throw error; // Re-throw to let the UI handle the error
      }
    },

    async reject(executionId: string, rejectionData: { approverId: string; reason: string }): Promise<void> {
      try {
        await api.approvals.submitDecision(executionId, {
          decision: 'reject',
          reason: rejectionData.reason
        });
      } catch (error) {
        console.error('Rejection API failed:', error);
        throw error; // Re-throw to let the UI handle the error
      }
    },

    async getPending(): Promise<any[]> {
      try {
        const response = await api.approvals.getPending();
        // Handle the response format: {pendingApprovals: Array, count: number, summary: {...}}
        if (response && typeof response === 'object' && Array.isArray(response.pendingApprovals)) {
          return response.pendingApprovals;
        } else if (Array.isArray(response)) {
          return response;
        } else {
          console.warn('getPending() returned unexpected format:', response);
          return [];
        }
      } catch (error) {
        console.error('Failed to get pending approvals:', error);
        // Return empty array instead of throwing to prevent infinite retries
        return [];
      }
    }
  },

  // Knowledge Graph System
  knowledge: {
    async uploadKnowledge(items: KnowledgeIngestRequest[]): Promise<KnowledgeIngestResponse> {
      try {
        // Use bulk upload if available, otherwise upload individually
        const client = getAPIClient();
        const uploadResults = await Promise.all(
          items.map(item => client.knowledge.upload({
            title: item.title,
            content: item.content,
            type: item.type,
            category: item.category,
            tags: item.tags,
            metadata: item.metadata
          }))
        );
        
        return {
          items: uploadResults,
          successCount: uploadResults.length,
          failureCount: 0,
          errors: []
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
          console.warn('Search results is not an array:', searchResults);
          return {
            items: [],
            totalCount: 0,
            searchMetadata: {
              query: query.query || '',
              processingTime: 0,
              similarityScores: [],
              filtersApplied: []
            }
          };
        }
        
        // Transform search results to expected format
        const items = searchResults.map((result: any) => result.item || result);
        return {
          items,
          totalCount: items.length,
          searchMetadata: {
            query: query.query || '',
            processingTime: 0,
            similarityScores: searchResults.map(r => r.score || 0),
            filtersApplied: []
          }
        };
      } catch (error) {
        console.warn('Knowledge search API failed, returning empty results:', error);
        return {
          items: [],
          totalCount: 0,
          searchMetadata: {
            query: query.query || '',
            processingTime: 0,
            similarityScores: [],
            filtersApplied: []
          }
        };
      }
    },

    async updateKnowledge(itemId: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
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
      itemsByType: Record<KnowledgeType, number>;
      itemsBySource: Record<SourceType, number>;
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
        const totalItems = (stats.totalItems || 0) + (stats.generalKnowledge?.totalItems || 0);
        const combinedItemsByType = { ...stats.itemsByType, ...stats.generalKnowledge?.itemsByType };
        
        return {
          totalItems,
          itemsByType: combinedItemsByType as Record<KnowledgeType, number>,
          itemsBySource: (stats.itemsByCategory || {}) as Record<SourceType, number>,
          recentActivity: [{
            date: new Date().toISOString().split('T')[0],
            uploads: stats.recentActivity?.itemsThisWeek || 0,
            searches: 0 // API doesn't track searches
          }],
          // Add general knowledge breakdown for debugging
          debug: {
            userKnowledge: {
              totalItems: stats.totalItems || 0,
              itemsByType: stats.itemsByType || {}
            },
            generalKnowledge: {
              totalItems: stats.generalKnowledge?.totalItems || 0,
              itemsByType: stats.generalKnowledge?.itemsByType || {}
            }
          }
        };
      } catch (error) {
        console.warn('Knowledge stats API failed, returning mock data:', error);
        // Return mock data to prevent infinite loops
        return {
          totalItems: 0,
          itemsByType: {} as Record<KnowledgeType, number>,
          itemsBySource: {} as Record<SourceType, number>,
          recentActivity: [{
            date: new Date().toISOString().split('T')[0],
            uploads: 0,
            searches: 0
          }]
        };
      }
    },

    async getRelatedKnowledge(itemId: string): Promise<KnowledgeItem[]> {
      try {
        const client = getAPIClient();
        const relatedItems = await client.knowledge.findSimilar(itemId);
        return relatedItems.map((result: any) => result.item || result);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to get related knowledge');
      }
    },

    async getKnowledgeByTag(tag: string): Promise<KnowledgeItem[]> {
      try {
        const client = getAPIClient();
        const searchResults = await client.knowledge.search({ query: '', tags: [tag] });
        return searchResults.map((result: any) => result.item || result);
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
        properties?: Record<string, any>;
      }>;
      edges: Array<{
        source: string;
        target: string;
        type: string;
        properties?: Record<string, any>;
      }>;
    }> {
      try {
        const client = getAPIClient();
        return await client.knowledge.getGraph(options);
      } catch (error) {
        console.warn('Knowledge graph API failed, returning empty graph:', error);
        return {
          nodes: [],
          edges: []
        };
      }
    }
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
        const formData = new FormData();
        formData.append('mcpConfig', configFile);

        const authToken = APIClient.getAuthToken();

        const response = await fetch('/api/v1/mcp/upload-config', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error?.message || 'Upload failed');
        }

        return result.data;
      } catch (error) {
        console.error('MCP config upload error:', error);
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
        status: 'unknown' | 'running' | 'stopped';
      }>;
    }> {
      try {
        const client = getAPIClient();
        return await api.mcp.getStatus();
      } catch (error) {
        console.error('MCP status error:', error);
        throw error;
      }
    },

    async getConfig(): Promise<{
      exists: boolean;
      config: any | null;
      serversCount?: number;
      servers?: string[];
      message?: string;
    }> {
      try {
        const client = getAPIClient();
        return await api.mcp.getConfig();
      } catch (error) {
        console.error('MCP config error:', error);
        throw error;
      }
    },

    async restartServer(serverName: string): Promise<{
      message: string;
      serverName: string;
      status: string;
    }> {
      try {
        const client = getAPIClient();
        return await APIClient.post(`/api/v1/mcp/restart-server/${encodeURIComponent(serverName)}`);
      } catch (error) {
        console.error('MCP server restart error:', error);
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
        parameters: any;
        category: string;
      }>;
      count: number;
      servers: string[];
    }> {
      try {
        return await api.mcp.getTools();
      } catch (error) {
        console.error('MCP tools error:', error);
        throw error;
      }
    }
  }
};

export default uaipAPI; 