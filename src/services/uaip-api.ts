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
import { API_CONFIG, getEffectiveAPIBaseURL, isProxyEnabled, getEnvironmentConfig, buildAPIURL, API_ROUTES } from '@/config/apiConfig';

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

// Environment detection
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;
const envConfig = getEnvironmentConfig();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Utility function to generate UUIDs
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
  timeRemaining?: number;
  nextParticipantId?: string;
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
  type: 'discussion.created' | 'discussion.started' | 'discussion.paused' | 'discussion.resumed' | 'discussion.ended' |
        'participant.joined' | 'participant.left' | 'message.sent' | 'turn.advanced' | 'turn.timeout';
  discussionId: string;
  data: any;
  timestamp: Date;
}

// Configuration with environment-specific defaults
const getAPIConfig = (): APIConfig => {
  return {
    baseURL: getEffectiveAPIBaseURL(),
    timeout: API_CONFIG.timeout,
    headers: API_CONFIG.headers
  };
};

// Backend availability detection
let backendAvailable: boolean | null = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = envConfig.HEALTH_CHECK_INTERVAL;

export async function checkBackendHealth(): Promise<boolean> {
  const now = Date.now();
  
  // Use cached result if recent
  if (backendAvailable !== null && (now - lastHealthCheck) < HEALTH_CHECK_INTERVAL) {
    return backendAvailable;
  }

  try {
    const config = getAPIConfig();
    const healthUrl = buildAPIURL(API_ROUTES.HEALTH);
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: config.headers,
      signal: AbortSignal.timeout(5000) // 5 second timeout for health check
    });
    
    backendAvailable = response.ok;
    lastHealthCheck = now;
    
    if (isDevelopment && envConfig.DEBUG_LOGGING) {
      console.log(`[UAIP API] Backend health check: ${backendAvailable ? 'HEALTHY' : 'UNHEALTHY'}`);
      console.log(`[UAIP API] Health URL: ${healthUrl}`);
      console.log(`[UAIP API] Proxy enabled: ${isProxyEnabled()}`);
      console.log(`[UAIP API] Base URL: ${config.baseURL}`);
    }
    
    return backendAvailable;
  } catch (error) {
    backendAvailable = false;
    lastHealthCheck = now;
    
    if (isDevelopment && envConfig.DEBUG_LOGGING) {
      console.warn('[UAIP API] Backend health check failed:', error);
    }
    
    return false;
  }
}

// Enhanced API client with fallback handling
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
        proxyEnabled: isProxyEnabled(),
        routes: API_ROUTES
      });
    }
  }
  return apiClient;
}

// ============================================================================
// WEBSOCKET CLIENT FOR REAL-TIME UPDATES
// ============================================================================

class DiscussionWebSocketClient {
  private socket: WebSocket | null = null;
  private config: WebSocketConfig;
  private listeners: Map<string, Set<(event: DiscussionEvent) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;

  constructor(config: WebSocketConfig) {
    this.config = config;
    this.maxReconnectAttempts = config.reconnectAttempts || 5;
    this.reconnectDelay = config.reconnectDelay || 1000;
    
    if (config.autoConnect !== false) {
      this.connect();
    }
  }

  connect(): void {
    try {
      const wsUrl = this.config.url.replace('http', 'ws');
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        if (isDevelopment) {
          console.log('[UAIP WebSocket] Connected to discussion events');
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const discussionEvent: DiscussionEvent = JSON.parse(event.data);
          this.handleEvent(discussionEvent);
        } catch (error) {
          console.error('[UAIP WebSocket] Failed to parse event:', error);
        }
      };

      this.socket.onclose = () => {
        if (isDevelopment) {
          console.log('[UAIP WebSocket] Connection closed');
        }
        this.attemptReconnect();
      };

      this.socket.onerror = (error) => {
        console.error('[UAIP WebSocket] Connection error:', error);
      };
    } catch (error) {
      console.error('[UAIP WebSocket] Failed to connect:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      setTimeout(() => {
        if (isDevelopment) {
          console.log(`[UAIP WebSocket] Reconnecting... (attempt ${this.reconnectAttempts})`);
        }
        this.connect();
      }, delay);
    }
  }

  private handleEvent(event: DiscussionEvent): void {
    // Notify global listeners
    const globalListeners = this.listeners.get('*') || new Set();
    globalListeners.forEach(listener => listener(event));

    // Notify event-specific listeners
    const eventListeners = this.listeners.get(event.type) || new Set();
    eventListeners.forEach(listener => listener(event));

    // Notify discussion-specific listeners
    const discussionListeners = this.listeners.get(`discussion:${event.discussionId}`) || new Set();
    discussionListeners.forEach(listener => listener(event));
  }

  subscribe(eventType: string, listener: (event: DiscussionEvent) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    };
  }

  subscribeToDiscussion(discussionId: string, listener: (event: DiscussionEvent) => void): () => void {
    return this.subscribe(`discussion:${discussionId}`, listener);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.listeners.clear();
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

// Global WebSocket client instance
let wsClient: DiscussionWebSocketClient | null = null;

export function getWebSocketClient(): DiscussionWebSocketClient {
  if (!wsClient) {
    const wsUrl = getEffectiveAPIBaseURL().replace('http', 'ws');
    wsClient = new DiscussionWebSocketClient({
      url: `${wsUrl}/discussions/ws`,
      autoConnect: true,
      reconnectAttempts: 5,
      reconnectDelay: 1000
    });
  }
  return wsClient;
}

// Enhanced API wrapper with error handling and fallbacks
export const uaipAPI = {
  get client() {
    return getAPIClient();
  },
  
  get websocket() {
    return getWebSocketClient();
  },
  
  // Check if backend is available
  async isBackendAvailable(): Promise<boolean> {
    return await checkBackendHealth();
  },
  
  // Get current environment info
  getEnvironmentInfo() {
    return {
      isDevelopment,
      isProduction,
      baseURL: getEffectiveAPIBaseURL(),
      proxyEnabled: isProxyEnabled(),
      backendAvailable,
      lastHealthCheck: new Date(lastHealthCheck),
      config: envConfig,
      routes: API_ROUTES,
      websocketConnected: wsClient?.isConnected() || false
    };
  },
  
  // Force refresh backend availability
  async refreshBackendStatus(): Promise<boolean> {
    backendAvailable = null;
    return await checkBackendHealth();
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
      // This method doesn't exist in the base client, so we'll create a mock response
      return {
        currentParticipantId: 'participant-1',
        turnNumber: 1,
        timeRemaining: 300,
        nextParticipantId: 'participant-2',
        canAdvance: true
      };
    }
  }
};

// Auto-check backend health on module load in development
if (isDevelopment) {
  checkBackendHealth().then(available => {
    if (!available) {
      const proxyStatus = isProxyEnabled() ? 'enabled' : 'disabled';
      console.warn(
        `[UAIP API] Backend services not available. Frontend will use mock data.\n` +
        `Proxy: ${proxyStatus}\n` +
        `Base URL: ${getEffectiveAPIBaseURL()}\n` +
        `Health URL: ${buildAPIURL(API_ROUTES.HEALTH)}\n` +
        `To connect to backend:\n` +
        `1. Ensure Docker is installed and WSL integration is enabled\n` +
        `2. Run: cd backend && docker-compose up\n` +
        `3. Wait for all services to be healthy\n` +
        `4. Refresh the frontend`
      );
    } else {
      console.log(`[UAIP API] Backend services are available and healthy!`);
      console.log(`[UAIP API] Environment info:`, uaipAPI.getEnvironmentInfo());
    }
  });
}

export default uaipAPI; 