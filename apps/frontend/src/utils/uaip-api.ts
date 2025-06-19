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

// Define frontend types that match backend expectations
export enum TurnStrategy {
  ROUND_ROBIN = 'round_robin',
  MODERATED = 'moderated',
  FREE_FORM = 'free_form',
  CONTEXT_AWARE = 'context_aware',
  PRIORITY_BASED = 'priority_based',
  EXPERTISE_DRIVEN = 'expertise_driven'
}

export interface TurnStrategyConfig {
  strategy: TurnStrategy;
  config: {
    type: 'round_robin' | 'moderated' | 'context_aware' | 'priority_based' | 'free_form' | 'expertise_driven';
    skipInactive?: boolean;
    maxSkips?: number;
    moderatorId?: string;
    requireApproval?: boolean;
    autoAdvance?: boolean;
    relevanceThreshold?: number;
    expertiseWeight?: number;
    engagementWeight?: number;
    priorities?: Array<{
      participantId: string;
      priority: number;
    }>;
    cooldownPeriod?: number;
    topicKeywords?: string[];
    expertiseThreshold?: number;
  };
}

export interface DiscussionSettings {
  maxParticipants?: number;
  maxDuration?: number;
  maxMessages?: number;
  autoModeration?: boolean;
  requireApproval?: boolean;
  allowInvites?: boolean;
  allowFileSharing?: boolean;
  allowAnonymous?: boolean;
  recordTranscript?: boolean;
  enableAnalytics?: boolean;
  turnTimeout?: number;
  responseTimeout?: number;
  moderationRules?: Array<{
    rule: string;
    action: 'warn' | 'mute' | 'remove' | 'flag';
    severity: 'low' | 'medium' | 'high';
  }>;
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
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================================
// PERSONA AND DISCUSSION TYPES (Missing from main API client)
// ============================================================================

export interface Persona {
  id: string;
  name: string;
  role: string;
  description: string;
  traits: PersonaTrait[];
  expertise: ExpertiseDomain[];
  background: string;
  systemPrompt: string;
  conversationalStyle: ConversationalStyle;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  isPublic: boolean;
  usageCount: number;
  version: number;
}

export interface PersonaTrait {
  name: string;
  value: string | number | boolean;
  weight: number;
  category: 'personality' | 'behavior' | 'communication' | 'expertise';
}

export interface ExpertiseDomain {
  domain: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  keywords: string[];
  experience?: string;
}

export interface ConversationalStyle {
  tone: 'formal' | 'casual' | 'friendly' | 'professional' | 'technical';
  verbosity: 'concise' | 'moderate' | 'detailed' | 'comprehensive';
  responsePattern: 'direct' | 'analytical' | 'creative' | 'supportive';
  preferredFormats: string[];
}

export interface PersonaCreate {
  name: string;
  role: string;
  description: string;
  traits: PersonaTrait[];
  expertise: ExpertiseDomain[];
  background: string;
  systemPrompt: string;
  conversationalStyle: ConversationalStyle;
  isPublic?: boolean;
  createdBy: string;
}

export interface PersonaUpdate {
  name?: string;
  role?: string;
  description?: string;
  traits?: PersonaTrait[];
  expertise?: ExpertiseDomain[];
  background?: string;
  systemPrompt?: string;
  conversationalStyle?: ConversationalStyle;
  isPublic?: boolean;
}

export interface PersonaSearchRequest {
  query?: string;
  role?: string;
  expertise?: string[];
  traits?: string[];
  publicOnly?: boolean;
  createdBy?: string;
  sortBy?: 'name' | 'usage_count' | 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface PersonaSearchResponse {
  personas: Persona[];
  totalCount: number;
  recommendations: string[];
  searchTime: number;
}

export interface PersonaRecommendation {
  persona: Persona;
  relevanceScore: number;
  reasoning: string;
  alternatives?: string[];
  usageExamples?: Record<string, any>[];
}

export interface Discussion {
  id: string;
  title: string;
  topic: string;
  documentId?: string;
  operationId?: string;
  participants: DiscussionParticipant[];
  state: DiscussionState;
  settings: DiscussionSettings;
  currentTurnAgentId?: string;
  turnStrategy: TurnStrategy;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  status: DiscussionStatus;
}

export interface DiscussionParticipant {
  id: string;
  discussionId: string;
  personaId: string;
  agentId: string;
  role: 'participant' | 'moderator';
  joinedAt: Date;
  lastActiveAt: Date;
  messageCount: number;
}

export interface DiscussionState {
  phase: 'setup' | 'active' | 'paused' | 'ended';
  currentTurn: number;
  totalTurns?: number;
  timeRemaining?: number;
  lastActivity: Date;
}

export type DiscussionStatus = 'draft' | 'active' | 'paused' | 'ended' | 'archived';

export interface DiscussionCreate {
  title: string;
  description: string;
  topic: string;
  createdBy: string;
  turnStrategy?: TurnStrategyConfig;
  initialParticipants: Array<{ 
    personaId: string;
    agentId: string;
    role: string; 
  }>;
  settings?: Partial<DiscussionSettings>;
}

export interface DiscussionUpdate {
  title?: string;
  topic?: string;
  settings?: Partial<DiscussionSettings>;
  turnStrategy?: TurnStrategy;
  status?: DiscussionStatus;
}

export interface DiscussionMessage {
  id: string;
  discussionId: string;
  participantId: string;
  content: string;
  messageType: 'message' | 'system' | 'action';
  replyTo?: string;
  createdAt: Date;
  metadata: Record<string, any>;
}

export interface DiscussionMessageCreate {
  content: string;
  messageType?: 'message' | 'system' | 'action';
  replyTo?: string;
  metadata?: Record<string, any>;
}

export interface DiscussionParticipantCreate {
  personaId: string;
  agentId: string;
  role?: 'participant' | 'moderator';
}

export interface DiscussionSearchRequest {
  query?: string;
  status?: DiscussionStatus[];
  createdBy?: string;
  participantId?: string;
  turnStrategy?: TurnStrategy[];
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'title' | 'created_at' | 'updated_at' | 'last_activity';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface DiscussionSearchResponse {
  discussions: Discussion[];
  totalCount: number;
  searchTime: number;
}

export interface MessageSearchOptions {
  participantId?: string;
  messageType?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface TurnInfo {
  currentParticipantId: string;
  turnNumber: number;
  timeRemaining: number;
  nextParticipantId: string;
  canAdvance: boolean;
}

// ============================================================================
// WEBSOCKET INTEGRATION
// ============================================================================

export interface WebSocketConfig {
  url: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface DiscussionEvent {
  type: 'turn_started' | 'turn_ended' | 'message_added' | 'participant_joined' | 'participant_left';
  discussionId: string;
  data: any;
  timestamp: Date;
}

// API Configuration for production deployment
function getAPIConfig(): APIConfig {
  return {
    baseURL: getEffectiveAPIBaseURL(),
    timeout: envConfig.DEBUG_LOGGING ? 10000 : 30000,
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Version': '1.0.0',
      'X-Environment': isDevelopment ? 'development' : 'production'
    }
  };
}

// Enhanced API client with production-ready configuration
let apiClient: UAIPAPIClient | null = null;

export function getAPIClient(): UAIPAPIClient {
  if (!apiClient) {
    const config = getAPIConfig();
    apiClient = createAPIClient(config);
    
    if (isDevelopment && envConfig.DEBUG_LOGGING) {
      console.log('[UAIP API] Client initialized with config:', {
        baseURL: config.baseURL,
        timeout: config.timeout,
        environment: isDevelopment ? 'development' : 'production',
        routes: API_ROUTES
      });
    }
  }
  return apiClient;
}

// ============================================================================
// WEBSOCKET CLIENT FOR REAL-TIME UPDATES
// ============================================================================

// Socket.IO client types
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
    
    if (config.autoConnect !== false) {
      this.connect().catch(error => {
        console.error('[Socket.IO] Failed to initialize connection:', error);
      });
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
    async list(filters?: PersonaSearchRequest): Promise<PersonaSearchResponse> {
      const client = getAPIClient();
      const response = await client.personas.search(filters?.query, filters?.expertise?.[0]);
      
      // Transform the response to match our interface
      return {
        personas: response.data || [],
        totalCount: response.data?.length || 0,
        recommendations: [],
        searchTime: 0
      };
    },

    async get(id: string): Promise<Persona> {
      const client = getAPIClient();
      const response = await client.personas.get(id);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch persona');
      }
      
      return response.data!;
    },

    async create(persona: PersonaCreate): Promise<Persona> {
      const client = getAPIClient();
      const response = await client.personas.create(persona);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create persona');
      }
      
      return response.data!;
    },

    async update(id: string, updates: PersonaUpdate): Promise<Persona> {
      const client = getAPIClient();
      const response = await client.personas.update(id, updates);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update persona');
      }
      
      return response.data!;
    },

    async delete(id: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.personas.delete(id);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete persona');
      }
    },

    async getRecommendations(id: string): Promise<PersonaRecommendation[]> {
      const client = getAPIClient();
      const response = await client.personas.getRecommendations(id);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch persona recommendations');
      }
      
      return response.data!;
    }
  },

  // ============================================================================
  // DISCUSSION API METHODS
  // ============================================================================
  
  discussions: {
    async list(filters?: DiscussionSearchRequest): Promise<DiscussionSearchResponse> {
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

    async create(discussion: DiscussionCreate): Promise<Discussion> {
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

    async update(id: string, updates: DiscussionUpdate): Promise<Discussion> {
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
      const response = await client.discussions.update(id, { status: 'paused' });
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to pause discussion');
      }
    },

    async resume(id: string): Promise<void> {
      const client = getAPIClient();
      const response = await client.discussions.update(id, { status: 'active' });
      
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
        personaId: participant.personaId,
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
        messageType: message.messageType || 'message',
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
        canAdvance: true
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
    }
  },

  // ============================================================================
  // TOOLS API METHODS
  // ============================================================================
  
  tools: {
    async list(criteria?: any): Promise<any[]> {
      const client = getAPIClient();
      const response = await client.capabilities.search(criteria || {});
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch tools');
      }
      
      return response.data?.capabilities || [];
    },

    async get(id: string): Promise<any> {
      const client = getAPIClient();
      const response = await client.capabilities.get(id);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch tool');
      }
      
      return response.data!;
    },

    async create(toolData: any): Promise<any> {
      const client = getAPIClient();
      const response = await client.capabilities.register(toolData);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create tool');
      }
      
      return response.data!;
    },

    async execute(toolId: string, params: any): Promise<any> {
      // This would be a specialized execution endpoint
      // For now, return a mock response structure
      return {
        success: true,
        data: { result: 'Tool execution result' },
        executionId: `exec_${Date.now()}`,
        executionTime: Math.random() * 1000,
        cost: Math.random() * 10
      };
    },

    async getCategories(): Promise<string[]> {
      const client = getAPIClient();
      const response = await client.capabilities.getCategories();
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch tool categories');
      }
      
      return response.data!;
    }
  },

  // ============================================================================
  // LLM API METHODS (User-specific)
  // ============================================================================
  
  llm: {
    async getModels(): Promise<Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
      apiType: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
      provider: string;
      isAvailable: boolean;
    }>> {
      const client = getAPIClient();
      const response = await client.userLLM.getModels();
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch models');
      }
      
      return response.data!;
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
      
      return response.data!;
    },

    async createProvider(providerData: {
      name: string;
      description?: string;
      type: string;
      baseUrl: string;
      apiKey?: string;
      defaultModel?: string;
      configuration?: any;
      priority?: number;
    }): Promise<any> {
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
      preferredType?: string;
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
      const client = getAPIClient();
      const response = await client.approvals.submitDecision(executionId, {
        decision: 'approved',
        comments: `Approved by ${approvalData.approverId}`
      });
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to approve execution');
      }
    },

    async reject(executionId: string, rejectionData: { approverId: string; reason: string }): Promise<void> {
      const client = getAPIClient();
      const response = await client.approvals.submitDecision(executionId, {
        decision: 'rejected',
        comments: rejectionData.reason
      });
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to reject execution');
      }
    },

    async getPending(): Promise<any[]> {
      const client = getAPIClient();
      const response = await client.approvals.getPendingApprovals();
      
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch pending approvals');
      }
      
      return response.data!;
    }
  }
};

export default uaipAPI; 