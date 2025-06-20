/**
 * UAIP Frontend API Service
 * 
 * This service provides a clean interface between the frontend components
 * and the UAIP backend services. It handles API calls, error handling,
 * and data transformation for the frontend.
 */

// Import the backend API client
export * from './api';
import { UAIPAPIClient, createAPIClient, APIConfig } from './api';
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
  DiscussionEvent,
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
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================================
// API CLIENT CONFIGURATION
// ============================================================================

function getAPIConfig(): APIConfig {
  return {
    baseURL: getEffectiveAPIBaseURL(),
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    }
  };
}

export function getAPIClient(): UAIPAPIClient {
  return createAPIClient(getAPIConfig());
}

// ============================================================================
// WEBSOCKET CLIENT
// ============================================================================

interface SocketIOClient {
  connected: boolean;
  emit: (event: string, data: any) => void;
  on: (event: string, callback: (data: any) => void) => void;
  disconnect: () => void;
}

class DiscussionWebSocketClient {
  private socket: SocketIOClient | null = null;
  private config: WebSocketConfig;
  private listeners: Map<string, Set<(event: DiscussionEvent) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private joinedDiscussions: Set<string> = new Set();

  constructor(config: WebSocketConfig) {
    this.config = config;
    this.maxReconnectAttempts = config.reconnectAttempts || 5;
    this.reconnectDelay = config.reconnectDelay || 1000;
    
    if (config.autoConnect) {
      this.connect();
    }
  }

  async connect() {
    try {
      // Try to dynamically import Socket.IO client
      let io: any;
      try {
        const socketIO = await import('socket.io-client');
        io = socketIO.io;
      } catch (importError) {
        console.error('❌ Socket.IO client not installed!');
        console.error('📦 Please install it by running: npm install socket.io-client');
        console.error('📖 See SOCKET_IO_SETUP.md for complete setup instructions');
        throw new Error('socket.io-client dependency is required for WebSocket connections');
      }
      
      // Get authentication tokens from the API client
      const apiClient = getAPIClient();
      const authToken = apiClient.getAuthToken();
      const userId = apiClient.getUserId();
      
      // Validate authentication data before connecting
      if (!authToken || !userId) {
        console.error('[Socket.IO] Authentication required but missing:', { 
          hasToken: !!authToken, 
          hasUserId: !!userId,
          authToken: authToken ? 'present' : 'missing',
          userId: userId ? 'present' : 'missing'
        });
        throw new Error('Socket.IO connection requires valid authentication (token and userId)');
      }
      
      console.log('[Socket.IO] Connecting with auth:', { 
        hasToken: !!authToken, 
        hasUserId: !!userId,
        url: this.config.url,
        tokenPreview: authToken ? `${authToken.substring(0, 10)}...` : 'none',
        userIdPreview: userId ? `${userId.substring(0, 8)}...` : 'none'
      });
      
      // Connect to Socket.IO server through API Gateway
      this.socket = io(this.config.url, {
        transports: ['websocket'],
        auth: {
          // Send proper authentication - ensure no undefined values
          token: authToken,
          userId: userId
        },
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay
      }) as SocketIOClient;
      
      this.socket.on('connect', () => {
        console.log('[Socket.IO] Connected to discussions');
        this.reconnectAttempts = 0;
        
        // Rejoin all previously joined discussions
        this.joinedDiscussions.forEach(discussionId => {
          this.joinDiscussion(discussionId);
        });
      });
      
      // Listen for discussion events
      this.socket.on('message_received', (data) => {
        const discussionEvent: DiscussionEvent = {
          type: 'message_added',
          discussionId: data.discussionId,
          data: data,
          timestamp: new Date(data.timestamp)
        };
        this.notifyListeners(discussionEvent);
      });

      this.socket.on('turn_started', (data) => {
        const discussionEvent: DiscussionEvent = {
          type: 'turn_started',
          discussionId: data.discussionId,
          data: data,
          timestamp: new Date(data.timestamp)
        };
        this.notifyListeners(discussionEvent);
      });

      this.socket.on('turn_ended', (data) => {
        const discussionEvent: DiscussionEvent = {
          type: 'turn_ended',
          discussionId: data.discussionId,
          data: data,
          timestamp: new Date(data.timestamp)
        };
        this.notifyListeners(discussionEvent);
      });

      this.socket.on('participant_joined', (data) => {
        const discussionEvent: DiscussionEvent = {
          type: 'participant_joined',
          discussionId: data.discussionId,
          data: data,
          timestamp: new Date(data.timestamp)
        };
        this.notifyListeners(discussionEvent);
      });

      this.socket.on('participant_left', (data) => {
        const discussionEvent: DiscussionEvent = {
          type: 'participant_left',
          discussionId: data.discussionId,
          data: data,
          timestamp: new Date(data.timestamp)
        };
        this.notifyListeners(discussionEvent);
      });
      
      this.socket.on('disconnect', () => {
        console.log('[Socket.IO] Disconnected from discussions');
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('[Socket.IO] Connection error:', error);
      });

      this.socket.on('joined_discussion', (data) => {
        console.log('[Socket.IO] Successfully joined discussion:', data.discussionId);
      });

      this.socket.on('left_discussion', (data) => {
        console.log('[Socket.IO] Left discussion:', data.discussionId);
      });
      
    } catch (error) {
      console.error('[Socket.IO] Failed to create connection:', error);
    }
  }

  private notifyListeners(event: DiscussionEvent) {
    const eventListeners = this.listeners.get(event.type);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(event));
    }
    
    // Also notify wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(listener => listener(event));
    }
  }

  addEventListener(eventType: string, listener: (event: DiscussionEvent) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  removeEventListener(eventType: string, listener: (event: DiscussionEvent) => void) {
    const eventListeners = this.listeners.get(eventType);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  joinDiscussion(discussionId: string) {
    if (this.socket && this.socket.connected) {
      console.log('[Socket.IO] Joining discussion:', discussionId);
      this.socket.emit('join_discussion', { discussionId });
      this.joinedDiscussions.add(discussionId);
    } else {
      console.warn('[Socket.IO] Cannot join discussion - not connected');
    }
  }

  leaveDiscussion(discussionId: string) {
    if (this.socket && this.socket.connected) {
      console.log('[Socket.IO] Leaving discussion:', discussionId);
      this.socket.emit('leave_discussion', { discussionId });
      this.joinedDiscussions.delete(discussionId);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.joinedDiscussions.clear();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Global WebSocket client instance
let wsClient: DiscussionWebSocketClient | null = null;

export function getWebSocketClient(): DiscussionWebSocketClient {
  if (!wsClient) {
    // Check authentication before creating WebSocket client
    const apiClient = getAPIClient();
    const authToken = apiClient.getAuthToken();
    const userId = apiClient.getUserId();
    
    if (!authToken || !userId) {
      console.warn('[WebSocket] Cannot create WebSocket client - authentication required');
      console.warn('[WebSocket] Please ensure user is logged in before using WebSocket features');
      throw new Error('WebSocket client requires authentication. Please log in first.');
    }
    
    // Use API Gateway URL for Socket.IO connection
    const baseUrl = getEffectiveAPIBaseURL();
    console.log('[WebSocket] Creating authenticated WebSocket client for:', {
      baseUrl,
      hasAuth: !!authToken,
      hasUserId: !!userId
    });
    
    wsClient = new DiscussionWebSocketClient({
      url: baseUrl, // Socket.IO connects to the base URL
      autoConnect: true,
      reconnectAttempts: 5,
      reconnectDelay: 1000
    });
  }
  return wsClient;
}

/**
 * Reset the WebSocket client (call this on login/logout)
 */
export function resetWebSocketClient(): void {
  if (wsClient) {
    console.log('[WebSocket] Resetting WebSocket client due to auth change');
    wsClient.disconnect();
    wsClient = null;
  }
}

// Enhanced API wrapper with production-ready error handling
export const uaipAPI = {
  get client() {
    return getAPIClient();
  },
  
  // Get current environment info
  getEnvironmentInfo() {
    return {
      isDevelopment,
      isProduction,
      baseURL: getEffectiveAPIBaseURL(),
      config: envConfig,
      routes: API_ROUTES,
      websocketConnected: wsClient?.isConnected() || false
    };
  },

  // WebSocket client access
  get websocket() {
    return getWebSocketClient();
  },

  // ============================================================================
  // PERSONA API METHODS
  // ============================================================================
  
  personas: {
    async search(query?: string, expertise?: string): Promise<PersonaSearchResponse> {
      try {
        const client = getAPIClient();
       
        const response = await client.personas.search(query, expertise);
        console.log('🔍 Persona search response:', response);
        
        // Handle the response data properly - it should be an array of personas
        const personas = Array.isArray(response.data) ? response.data : [];
        
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
      const response = await client.discussions.create({
        title: discussion.title,
        description: discussion.description,
        topic: discussion.topic,
        createdBy: discussion.createdBy,
        turnStrategy: discussion.turnStrategy,
        initialParticipants: discussion.initialParticipants,
        settings: discussion.settings
      });
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create discussion');
      }
      
      return response.data!;
    },

    async update(id: string, updates: UpdateDiscussionRequest): Promise<Discussion> {
      const client = getAPIClient();
      const response = await client.discussions.update(id, updates);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update discussion');
      }
      
      return response.data!;
    },

    async start(id: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.discussions.start(id);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to start discussion');
      }
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
      const response = await client.discussions.end(id, {
        reason: 'Discussion ended by user',
        summary: 'Discussion completed'
      });
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to end discussion');
      }
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
      const response = await client.discussions.getMessages(id, options?.limit, options?.offset);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch messages');
      }
      
      return response.data!;
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
      const client = getAPIClient();
      const response = await client.agents.list();
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch agents');
      }
      
      return response.data!;
    },

    async get(id: string): Promise<any> {
      const client = getAPIClient();
      const response = await client.agents.get(id);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch agent');
      }
      
      return response.data!;
    },

    async create(agentData: any): Promise<any> {
      const client = getAPIClient();
      const response = await client.agents.create(agentData);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create agent');
      }
      
      return response.data!;
    },

    async update(id: string, updates: any): Promise<any> {
      const client = getAPIClient();
      const response = await client.agents.update(id, updates);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update agent');
      }
      
      return response.data!;
    },

    async delete(id: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.agents.delete(id);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete agent');
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
    }> {
      // For now, return a mock response since this endpoint doesn't exist yet
      return {
        response: `Mock response to: ${request.message}`,
        agentName: 'Mock Agent',
        confidence: 0.8,
        model: 'mock-model',
        tokensUsed: 50,
        memoryEnhanced: false,
        knowledgeUsed: 0,
        conversationContext: {},
        timestamp: new Date().toISOString()
      };
    }
  },

  // ============================================================================
  // TOOLS API METHODS
  // ============================================================================
  
  tools: {
    async list(criteria?: any): Promise<any[]> {
      try {
        const client = getAPIClient();
        // Use the proper tools API method
        const response = await client.tools.list(criteria);
        
        if (!response.success) {
          // Check if it's an authentication error (403)
          if (response.error?.details?.statusCode === 403) {
            console.warn('Tools API requires authentication - user not logged in, returning mock data');
          } else {
            console.warn('Tools API not available, returning mock data:', response.error);
          }
          
          // Return mock capabilities when API is not available or user not authenticated
          return [
            {
              id: 'mock-capability-1',
              name: 'File System Access',
              description: 'Basic file system operations',
              category: 'System',
              status: 'active',
              version: '1.0.0',
              type: 'tool',
              agentId: 'system',
              agentName: 'System',
              permissions: ['read', 'write'],
              lastUsed: new Date(Date.now() - 3600000),
              usageCount: 45,
              metadata: {
                supportedOperations: ['read', 'write', 'list'],
                securityLevel: 'medium'
              }
            },
            {
              id: 'mock-capability-2',
              name: 'Web Search',
              description: 'Search the internet for information',
              category: 'External',
              status: 'active',
              version: '2.1.0',
              type: 'api',
              agentId: 'web-agent',
              agentName: 'Web Search Agent',
              permissions: ['search', 'fetch'],
              lastUsed: new Date(Date.now() - 1800000),
              usageCount: 123,
              metadata: {
                endpoint: 'https://api.search.com',
                rateLimit: '100/hour',
                securityLevel: 'low'
              }
            },
            {
              id: 'mock-capability-3',
              name: 'Code Analysis',
              description: 'Analyze and understand code structures',
              category: 'Analysis',
              status: 'active',
              version: '1.5.0',
              type: 'tool',
              agentId: 'code-agent',
              agentName: 'Code Analysis Agent',
              permissions: ['analyze', 'suggest'],
              lastUsed: new Date(Date.now() - 900000),
              usageCount: 67,
              metadata: {
                supportedLanguages: ['typescript', 'javascript', 'python'],
                securityLevel: 'high'
              }
            }
          ];
        }
        
        // Transform backend response to frontend format
        const tools = response.data.tools || [];
        return tools.map((tool: any) => ({
          id: tool.id || `tool-${Date.now()}`,
          name: tool.name || 'Unknown Tool',
          description: tool.description || 'No description available',
          category: tool.category || 'Unknown',
          status: tool.status || 'active',
          version: tool.version || '1.0.0',
          type: tool.type || 'tool',
          agentId: tool.agentId || 'system',
          agentName: tool.agentName || 'System',
          permissions: tool.permissions || [],
          lastUsed: tool.lastUsed ? new Date(tool.lastUsed) : null,
          usageCount: tool.usageCount || 0,
          metadata: tool.metadata || {}
        }));
        
      } catch (error) {
        console.warn('Tools API failed, returning mock data:', error);
        // Return mock data on error to prevent infinite retries
        return [
          {
            id: 'mock-capability-1',
            name: 'File System Access',
            description: 'Basic file system operations',
            category: 'System',
            status: 'active',
            version: '1.0.0',
            type: 'tool',
            agentId: 'system',
            agentName: 'System',
            permissions: ['read', 'write'],
            lastUsed: new Date(Date.now() - 3600000),
            usageCount: 45,
            metadata: {
              supportedOperations: ['read', 'write', 'list'],
              securityLevel: 'medium'
            }
          }
        ];
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
      const client = getAPIClient();
      const response = await client.userLLM.getModels();
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch models');
      }
      
      // Transform the response to match expected interface
      return (response.data || []).map((model: any) => ({
        id: model.id || 'unknown',
        name: model.name || 'Unknown Model',
        description: model.description,
        source: model.source || 'unknown',
        apiEndpoint: model.apiEndpoint || '',
        apiType: model.apiType || 'custom',
        provider: model.provider || 'unknown',
        isAvailable: model.isAvailable || false
      }));
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
      const client = getAPIClient();
      const response = await client.userLLM.getProviders();
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch providers');
      }
      
      // Transform the response to match expected interface
      return (response.data || []).map((provider: any) => ({
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
        lastUsedAt: provider.lastUsedAt?.toISOString(),
        healthCheckResult: provider.healthCheckResult,
        hasApiKey: provider.hasApiKey || false,
        createdAt: provider.createdAt || new Date().toISOString(),
        updatedAt: provider.updatedAt || new Date().toISOString()
      }));
    },

    async createProvider(providerData: ModelProvider): Promise<any> {
      const client = getAPIClient();
      const response = await client.userLLM.createProvider(providerData);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create provider');
      }
      
      return response.data!;
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
      const response = await client.userLLM.updateProviderConfig(providerId, config);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update provider configuration');
      }
    },

    async updateProviderApiKey(providerId: string, apiKey: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.userLLM.updateProviderApiKey(providerId, apiKey);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update API key');
      }
    },

    async testProvider(providerId: string): Promise<any> {
      const client = getAPIClient();
      const response = await client.userLLM.testProvider(providerId);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to test provider');
      }
      
      return response.data!;
    },

    async deleteProvider(providerId: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.userLLM.deleteProvider(providerId);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete provider');
      }
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
        const client = getAPIClient();
        // Use the proper approvals API method
        const response = await client.approvals.submitDecision(executionId, {
          decision: 'approve',
          feedback: `Approved by ${approvalData.approverId}`,
          approverId: approvalData.approverId,
          timestamp: new Date()
        });
        
        if (!response.success) {
          throw new Error(response.error?.message || 'Failed to approve execution');
        }
      } catch (error) {
        console.error('Approval API failed:', error);
        throw error; // Re-throw to let the UI handle the error
      }
    },

    async reject(executionId: string, rejectionData: { approverId: string; reason: string }): Promise<void> {
      try {
        const client = getAPIClient();
        // Use the proper approvals API method
        const response = await client.approvals.submitDecision(executionId, {
          decision: 'reject',
          feedback: rejectionData.reason,
          approverId: rejectionData.approverId,
          timestamp: new Date()
        });
        
        if (!response.success) {
          throw new Error(response.error?.message || 'Failed to reject execution');
        }
      } catch (error) {
        console.error('Rejection API failed:', error);
        throw error; // Re-throw to let the UI handle the error
      }
    },

    async getPending(): Promise<any[]> {
      try {
        const client = getAPIClient();
        const response = await client.approvals.getPendingApprovals();
        
        if (!response.success) {
          console.warn('Pending approvals API failed:', response.error);
          // Return empty array when API fails
          return [];
        }
        
        // Handle the actual backend response structure
        // Backend returns: { data: { pendingApprovals: [...], count: number, summary: {...} } }
        const responseData = response.data || {};
        const approvals = responseData.pendingApprovals || responseData || [];
        
        // Ensure approvals is an array
        if (!Array.isArray(approvals)) {
          console.warn('Expected approvals to be an array, got:', typeof approvals, approvals);
          return [];
        }
        
        // Transform to frontend format
        return approvals.map((item: any) => {
          // Handle the nested structure from backend (workflow + status)
          const approval = item.workflow || item;
          
          return {
            // Base ApprovalWorkflow properties
            id: approval.id || `approval-${Date.now()}`,
            operationId: approval.operationId || `operation-${Date.now()}`,
            requiredApprovers: approval.requiredApprovers || ['admin'],
            currentApprovers: approval.currentApprovers || [],
            status: approval.status || 'pending',
            expiresAt: approval.expiresAt ? new Date(approval.expiresAt) : new Date(Date.now() + 3600000),
            createdAt: approval.createdAt ? new Date(approval.createdAt) : new Date(),
            updatedAt: approval.updatedAt ? new Date(approval.updatedAt) : new Date(),
            metadata: {
              ...approval.metadata,
              workflowId: approval.id,
              urgency: item.urgency || 50,
              isPendingForUser: item.isPendingForUser || true
            },
            // UI-specific extensions
            operationType: approval.operationType || approval.metadata?.operationType || 'Unknown Operation',
            description: approval.description || approval.metadata?.description || 'Approval required',
            riskLevel: (approval.metadata?.securityLevel?.toLowerCase() || 'medium') as 'low' | 'medium' | 'high' | 'critical',
            requestedBy: approval.metadata?.createdBy || approval.metadata?.requestedBy || 'system'
          };
        });
        
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
      const client = getAPIClient();
      const response = await client.knowledge.uploadKnowledge(items);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to upload knowledge');
      }
      
      return response.data!;
    },

    async searchKnowledge(query: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
      const client = getAPIClient();
      const response = await client.knowledge.searchKnowledge(query);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to search knowledge');
      }
      
      return response.data!;
    },

    async updateKnowledge(itemId: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem> {
      const client = getAPIClient();
      const response = await client.knowledge.updateKnowledge(itemId, updates);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update knowledge');
      }
      
      return response.data!;
    },

    async deleteKnowledge(itemId: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.knowledge.deleteKnowledge(itemId);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete knowledge');
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
      const client = getAPIClient();
      const response = await client.knowledge.getKnowledgeStats();
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to get knowledge stats');
      }
      
      return response.data!;
    },

    async getRelatedKnowledge(itemId: string): Promise<KnowledgeItem[]> {
      const client = getAPIClient();
      const response = await client.knowledge.getRelatedKnowledge(itemId);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to get related knowledge');
      }
      
      return response.data!;
    },

    async getKnowledgeByTag(tag: string): Promise<KnowledgeItem[]> {
      const client = getAPIClient();
      const response = await client.knowledge.getKnowledgeByTag(tag);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to get knowledge by tag');
      }
      
      return response.data!;
    },

    async getKnowledgeItem(itemId: string): Promise<KnowledgeItem> {
      const client = getAPIClient();
      const response = await client.knowledge.getKnowledgeItem(itemId);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to get knowledge item');
      }
      
      return response.data!;
    }
  }
};

export default uaipAPI; 