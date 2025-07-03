/**
 * UAIP Backend API Client and Types
 *
 * This file serves as a bridge between the frontend and backend services.
 * It provides typed interfaces and methods for all available API endpoints.
 *
 * All requests go through the API Gateway which routes to appropriate services:
 * - Agent Intelligence Service (via /api/v1/agents)
 * - Capability Registry Service (via /api/v1/capabilities)
 * - Orchestration Pipeline Service (via /api/v1/operations)
 * - Persona Management Service (via /api/v1/personas)
 */

import { API_ROUTES, buildAPIURL } from '@/config/apiConfig';
import { ModelProvider } from '@/types';

// Import types from shared-types package
import type {
  Agent,
  AgentRole,
  AgentCreate,
  AgentUpdate,
  AgentIntelligenceConfig,
  AgentSecurityContext,
  ConversationContext,
  ContextAnalysis,
  AgentAnalysisResult,
  ExecutionPlan,
  Operation,
  OperationStatus,
  OperationType,
  OperationPriority,
  ExecuteOperationRequest,
  OperationStatusResponse,
  Capability,
  CapabilityType,
  CapabilityStatus,
  CapabilitySearchRequest,
  CapabilityRecommendation,
  Persona,
  PersonaAnalytics,
  PersonaValidation,
  PersonaRecommendation,
  PersonaTemplate,
  TurnStrategy,
  TurnStrategyConfig,
  Discussion,
  DiscussionParticipant,
  DiscussionMessage,
  DiscussionSettings,
  DiscussionState,
  DiscussionAnalytics,
  DiscussionSummary,
  CreateDiscussionRequest,
  UpdateDiscussionRequest,
  // Audit types
  AuditLog,
  AuditStats,
  AuditSearchFilters,
  AuditExportConfig,
  ComplianceReport,
  UserActivitySummary,
  AuditCleanupResult,
  // Security types
  RiskAssessment,
  SecurityPolicy,
  SecurityStats,
  ApprovalRequirement,
  ProviderConfig,
  ProviderTestResult,
  // LLM types
  LLMModel,
  LLMGenerationRequest,
  LLMGenerationResponse,
  AgentLLMRequest,
  ContextAnalysisRequest,
  ContextAnalysisResponse,
  ArtifactGenerationRequest,
  ArtifactGenerationResponse,
  ProviderStats,
  LLMUsage,
  // Knowledge Graph types
  KnowledgeItem,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
  KnowledgeType,
  SourceType,
  // User types
  User,
  CreateUserRequest,
  UpdateUserRequest,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  ResetPasswordRequest,
  UserStats,
  BulkUserAction,
  UserSearchFilters,
  ApprovalWorkflow,
  CreateApprovalWorkflowRequest,
  ApprovalDecision,
  ApprovalStats,
  HealthStatus,
  SystemMetrics
} from '@uaip/types';

// Re-export shared types for convenience
export type {
  Agent,
  AgentRole,
  AgentCreate,
  AgentUpdate,
  Operation,
  OperationStatus,
  OperationType,
  OperationPriority,
  ExecuteOperationRequest,
  OperationStatusResponse,
  Capability,
  CapabilityType,
  CapabilityStatus,
  CapabilitySearchRequest,
  CapabilityRecommendation,
  Persona,
  PersonaAnalytics,
  PersonaValidation,
  PersonaRecommendation,
  PersonaTemplate,
  TurnStrategy,
  TurnStrategyConfig,
  Discussion,
  DiscussionParticipant,
  DiscussionMessage,
  DiscussionSettings,
  DiscussionState,
  DiscussionAnalytics,
  DiscussionSummary,
  CreateDiscussionRequest,
  UpdateDiscussionRequest
};

// Base configuration
export interface APIConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: {
      endpoint?: string;
      statusCode?: number;
      validationErrors?: Array<{
        field: string;
        message: string;
      }>;
      [key: string]: any;
    };
  };
  meta: {
    timestamp: Date;
    requestId?: string;
    version?: string;
  };
}

// ============================================================================
// FRONTEND-SPECIFIC TYPES (extending shared types)
// ============================================================================

// Frontend-specific request types that extend shared types
export interface AgentAnalysisRequest extends ContextAnalysis {
  // Additional frontend-specific properties if needed
}

export interface AgentAnalysisResponse extends AgentAnalysisResult {
  // Additional frontend-specific properties if needed
}

export interface AgentPlanRequest {
  analysis: AgentAnalysisResult['analysis'];
  userPreferences?: {
    preferredModels?: string[];
    maxDuration?: number;
    riskTolerance?: 'low' | 'medium' | 'high';
    [key: string]: any;
  };
  securityContext?: {
    userId: string;
    sessionId: string;
    permissions: string[];
    securityLevel: 'low' | 'medium' | 'high' | 'critical';
    [key: string]: any;
  };
}

export interface AgentPlanResponse {
  operationPlan: ExecutionPlan;
  estimatedDuration: number;
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigations?: string[];
  };
  approvalRequired: boolean;
  dependencies: string[];
  meta: {
    timestamp: Date;
    processingTime: number;
    agentId: string;
    version: string;
  };
}

// HealthStatus is now imported from @uaip/types

// ============================================================================
// CAPABILITY REGISTRY SERVICE TYPES (using shared types)
// ============================================================================

export interface CapabilitySearchResponse {
  capabilities: Capability[];
  totalCount: number;
  recommendations: string[];
  searchTime: number;
}

// ============================================================================
// ORCHESTRATION PIPELINE SERVICE TYPES (using shared types)
// ============================================================================

// Frontend-specific operation request types
export interface PauseOperationRequest {
  reason: string;
}

export interface ResumeOperationRequest {
  checkpointId?: string;
}

export interface CancelOperationRequest {
  reason: string;
  compensate?: boolean;
  force?: boolean;
}

// ============================================================================
// API CLIENT CLASS
// ============================================================================

export class UAIPAPIClient {
  private config: APIConfig;
  private authFailureCallbacks: Set<() => void> = new Set();

  constructor(config: APIConfig = {}) {
    this.config = {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      ...config,
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    // Handle both relative and absolute URLs properly
    let url: string;
    
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      // Endpoint is already a full URL, use it as-is
      url = endpoint;
    } else {
      // Endpoint is relative, combine with base URL
      const baseURL = this.config.baseURL || '';
      const cleanBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      url = `${cleanBaseURL}${cleanEndpoint}`;
    }
    
    const token = this.getStoredToken();
    const userId = this.getStoredUserId();
    const sessionId = this.getStoredSessionId();

    // Handle body serialization and Content-Type header
    let processedOptions = { ...options };
    
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      // Automatically serialize objects to JSON and set Content-Type
      processedOptions.body = JSON.stringify(options.body);
      processedOptions.headers = {
        'Content-Type': 'application/json',
        ...processedOptions.headers,
      };
    }

    // Build comprehensive headers including security and user context
    const headers: Record<string, string> = {
      ...(this.config.headers || {}),
      ...(processedOptions.headers as Record<string, string> || {}),
    };

    // Add authentication header
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add security headers
    headers['X-Request-ID'] = this.generateRequestId();
    headers['X-Timestamp'] = new Date().toISOString();
    
    // Add user context headers if available
    if (userId) {
      headers['X-User-ID'] = userId;
    } else {
      // For unauthenticated requests, use a temporary anonymous user ID
      headers['X-User-ID'] = 'anonymous_' + Date.now();
    }
    
    if (sessionId) {
      headers['X-Session-ID'] = sessionId;
    } else {
      // Generate a temporary session ID for request tracking
      headers['X-Session-ID'] = 'temp_sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // Add security level header for UAIP backend
    headers['X-Security-Level'] = 'standard';
    
    // Add correlation ID for request tracing
    headers['X-Correlation-ID'] = this.generateCorrelationId();

    const config: RequestInit = {
      ...processedOptions,
      headers,
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    };

    try {
      let response = await fetch(url, config);

      // Handle token expiration
      if (response.status === 401 && token) {
        try {
          const newToken = await this.refreshAuthToken();
          if (newToken) {
            // Retry with new token
            headers['Authorization'] = `Bearer ${newToken}`;
            config.headers = headers;
            response = await fetch(url, config);
          } else {
            // No new token received, clear auth and fail
            this.handleAuthFailure();
            throw new Error('Authentication failed: Unable to refresh token');
          }
        } catch (refreshError) {
          // Token refresh failed, redirect to login
          console.error('Token refresh failed:', refreshError);
          this.handleAuthFailure();
          throw new Error('Authentication failed: Token refresh error');
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Ensure response follows APIResponse format
      if (data && typeof data === 'object' && 'success' in data) {
        return data;
      }
      
      // Wrap raw data in APIResponse format
      return {
        success: true,
        data,
        meta: {
          timestamp: new Date(),
          requestId: response.headers.get('x-request-id') || headers['X-Request-ID'],
          version: response.headers.get('x-api-version') || undefined,
        },
      };
    } catch (error) {
      console.error('API Request failed:', error);
      
      // Return error in APIResponse format
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { endpoint, options },
        },
        meta: {
          timestamp: new Date(),
        },
      };
    }
  }

  /**
   * Get stored authentication token
   */
  private getStoredToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    }
    return null;
  }

  /**
   * Get stored user ID
   */
  private getStoredUserId(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userId') || sessionStorage.getItem('userId');
    }
    return null;
  }

  /**
   * Get stored session ID
   */
  private getStoredSessionId(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId') || sessionStorage.getItem('sessionId');
    }
    return null;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Generate correlation ID for request tracing
   */
  private generateCorrelationId(): string {
    return 'corr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Store authentication token
   */
  private storeToken(token: string, rememberMe = false): void {
    if (typeof window !== 'undefined') {
      if (rememberMe) {
        localStorage.setItem('accessToken', token);
      } else {
        sessionStorage.setItem('accessToken', token);
      }
    }
  }

  /**
   * Remove stored authentication token
   */
  private removeStoredToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
    }
  }

  /**
   * Refresh authentication token
   */
  private async refreshAuthToken(): Promise<string | null> {
    const refreshToken = typeof window !== 'undefined' 
      ? localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken')
      : null;

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      // Construct the refresh URL properly
      const baseURL = this.config.baseURL || '';
      const cleanBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
      const refreshUrl = `${cleanBaseURL}/api/v1/auth/refresh`;
      
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      
      // Handle both old and new response formats
      let newToken: string | null = null;
      if (data.success && data.data?.tokens?.accessToken) {
        // New APIResponse format
        newToken = data.data.tokens.accessToken;
      } else if (data.tokens?.accessToken) {
        // Old format (fallback)
        newToken = data.tokens.accessToken;
      } else if (data.accessToken) {
        // Even older format (fallback)
        newToken = data.accessToken;
      }

      if (newToken) {
        this.storeToken(newToken);
        return newToken;
      }

      throw new Error('No access token in refresh response');
    } catch (error) {
      this.removeStoredToken();
      throw error;
    }
  }

  /**
   * Handle authentication failure
   */
  private handleAuthFailure(): void {
    this.removeStoredToken();
    
    // Notify all registered callbacks
    this.authFailureCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Auth failure callback error:', error);
      }
    });
    
    // Redirect to login if in browser environment and not already on login page
    if (typeof window !== 'undefined' && window.location) {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/') {
        console.log('Authentication failed, redirecting to login');
        window.location.href = '/login';
      }
    }
  }

  /**
   * Register callback for authentication failures
   */
  public onAuthFailure(callback: () => void): () => void {
    this.authFailureCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.authFailureCallbacks.delete(callback);
    };
  }

  /**
   * Set authentication token
   */
  public setAuthToken(token: string, refreshToken?: string, rememberMe = false): void {
    this.storeToken(token, rememberMe);
    
    if (refreshToken && typeof window !== 'undefined') {
      if (rememberMe) {
        localStorage.setItem('refreshToken', refreshToken);
      } else {
        sessionStorage.setItem('refreshToken', refreshToken);
      }
    }
  }

  /**
   * Set complete authentication context (token + user info)
   */
  public setAuthContext(authData: {
    token: string;
    refreshToken?: string;
    userId: string;
    sessionId?: string;
    rememberMe?: boolean;
  }): void {
    const { token, refreshToken, userId, sessionId, rememberMe = false } = authData;
    
    // Set authentication token
    this.setAuthToken(token, refreshToken, rememberMe);
    
    // Set user context
    this.setUserContext(userId, sessionId, rememberMe);
  }

  /**
   * Set user context for security headers
   */
  public setUserContext(userId: string, sessionId?: string, rememberMe = false): void {
    if (typeof window !== 'undefined') {
      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem('userId', userId);
      
      if (sessionId) {
        storage.setItem('sessionId', sessionId);
      } else {
        // Generate a session ID if not provided
        const generatedSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        storage.setItem('sessionId', generatedSessionId);
      }
    }
  }

  /**
   * Clear authentication
   */
  public clearAuth(): void {
    this.removeStoredToken();
    this.clearUserContext();
  }

  /**
   * Get current authentication token (public method)
   */
  public getAuthToken(): string | null {
    return this.getStoredToken();
  }

  /**
   * Get current user ID (public method)
   */
  public getUserId(): string | null {
    return this.getStoredUserId();
  }

  /**
   * Get current session ID (public method)
   */
  public getSessionId(): string | null {
    return this.getStoredSessionId();
  }

  /**
   * Check if user is authenticated (has valid token)
   */
  public isAuthenticated(): boolean {
    const token = this.getStoredToken();
    if (!token) return false;
    
    try {
      // Basic JWT structure check without verification
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      // Decode payload to check expiration
      const payload = JSON.parse(atob(parts[1]));
      const now = Math.floor(Date.now() / 1000);
      
      // Check if token is expired (with 30 second buffer)
      return payload.exp && payload.exp > (now + 30);
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear user context
   */
  private clearUserContext(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userId');
      localStorage.removeItem('sessionId');
      sessionStorage.removeItem('userId');
      sessionStorage.removeItem('sessionId');
    }
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    const token = this.getStoredToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  // ============================================================================
  // AGENT INTELLIGENCE SERVICE METHODS
  // ============================================================================

  /**
   * Agent Intelligence Service API methods
   */
  agents = {
    /**
     * Create a new agent
     */
    create: async (agentData: AgentCreate): Promise<APIResponse<Agent>> => {
      return this.request<Agent>(buildAPIURL(API_ROUTES.AGENTS), {
        method: 'POST',
        body: JSON.stringify(agentData),
      });
    },

    /**
     * List all agents
     */
    list: async (): Promise<APIResponse<Agent[]>> => {
      return this.request<Agent[]>(buildAPIURL(API_ROUTES.AGENTS));
    },

    /**
     * Get agent by ID
     */
    get: async (agentId: string): Promise<APIResponse<Agent>> => {
      return this.request<Agent>(buildAPIURL(`${API_ROUTES.AGENTS}/${agentId}`));
    },

    /**
     * Update agent
     */
    update: async (agentId: string, updates: AgentUpdate): Promise<APIResponse<Agent>> => {
      return this.request<Agent>(buildAPIURL(`${API_ROUTES.AGENTS}/${agentId}`), {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Delete agent
     */
    delete: async (agentId: string): Promise<APIResponse<void>> => {
      return this.request<void>(buildAPIURL(`${API_ROUTES.AGENTS}/${agentId}`), {
        method: 'DELETE',
      });
    },

    /**
     * Analyze conversation context
     */
    analyze: async (agentId: string, analysisRequest: AgentAnalysisRequest): Promise<APIResponse<AgentAnalysisResponse>> => {
      return this.request<AgentAnalysisResponse>(buildAPIURL(`${API_ROUTES.AGENTS}/${agentId}/analyze`), {
        method: 'POST',
        body: JSON.stringify(analysisRequest),
      });
    },

    /**
     * Generate operation plan
     */
    plan: async (agentId: string, planRequest: AgentPlanRequest): Promise<APIResponse<AgentPlanResponse>> => {
      return this.request<AgentPlanResponse>(buildAPIURL(`${API_ROUTES.AGENTS}/${agentId}/plan`), {
        method: 'POST',
        body: JSON.stringify(planRequest),
      });
    },

    /**
     * Get agent capabilities
     */
    getCapabilities: async (agentId: string): Promise<APIResponse<string[]>> => {
      return this.request<string[]>(buildAPIURL(`${API_ROUTES.AGENTS}/${agentId}/capabilities`));
    },

    /**
     * Agent learning endpoint
     */
    learn: async (agentId: string, learningData: Record<string, any>): Promise<APIResponse<void>> => {
      return this.request<void>(buildAPIURL(`${API_ROUTES.AGENTS}/${agentId}/learn`), {
        method: 'POST',
        body: JSON.stringify(learningData),
      });
    },

    /**
     * Agent participation in discussion
     */
    participate: async (agentId: string, participationData: {
      discussionId: string;
      comment?: string;
    }): Promise<APIResponse<any>> => {
      return this.request<any>(buildAPIURL(`${API_ROUTES.AGENTS}/${agentId}/participate`), {
        method: 'POST',
        body: JSON.stringify(participationData),
      });
    },

    /**
     * Chat with agent
     */
    chat: async (agentId: string, chatData: {
      message: string;
      conversationHistory?: Array<{
        content: string;
        sender: string;
        timestamp: string;
      }>;
      context?: any;
    }): Promise<APIResponse<{
      response: string;
      agentName: string;
      confidence: number;
      model?: string;
      tokensUsed?: number;
      memoryEnhanced?: boolean;
      knowledgeUsed?: number;
      persona?: any;
      conversationContext?: any;
      timestamp?: string;
      toolsExecuted?: Array<any>;
    }>> => {
      return this.request<{
        response: string;
        agentName: string;
        confidence: number;
        model?: string;
        tokensUsed?: number;
        memoryEnhanced?: boolean;
        knowledgeUsed?: number;
        persona?: any;
        conversationContext?: any;
        timestamp?: string;
        toolsExecuted?: Array<any>;
      }>(buildAPIURL(`${API_ROUTES.AGENTS}/${agentId}/chat`), {
        method: 'POST',
        body: JSON.stringify(chatData),
      });
    },

    /**
     * Health check endpoints
     */
    health: {
      basic: async (): Promise<APIResponse<HealthStatus>> => {
        return this.request<HealthStatus>(buildAPIURL(API_ROUTES.HEALTH));
      },
      detailed: async (): Promise<APIResponse<HealthStatus>> => {
        return this.request<HealthStatus>(buildAPIURL(`${API_ROUTES.HEALTH}/detailed`));
      },
      ready: async (): Promise<APIResponse<{ ready: boolean }>> => {
        return this.request<{ ready: boolean }>(buildAPIURL(`${API_ROUTES.HEALTH}/ready`));
      },
      live: async (): Promise<APIResponse<{ alive: boolean }>> => {
        return this.request<{ alive: boolean }>(buildAPIURL(`${API_ROUTES.HEALTH}/live`));
      },
      metrics: async (): Promise<APIResponse<SystemMetrics>> => {
        return this.request<SystemMetrics>(buildAPIURL(`${API_ROUTES.HEALTH}/metrics`));
      },
    },
  };

  // ============================================================================
  // PERSONA MANAGEMENT SERVICE METHODS
  // ============================================================================

  /**
   * Persona Management Service API methods
   */
  personas = {
    /**
     * Create a new persona
     */
    create: async (personaData: Partial<Persona>): Promise<APIResponse<Persona>> => {
      return this.request(buildAPIURL(API_ROUTES.PERSONAS), {
        method: 'POST',
        body: JSON.stringify(personaData),
      });
    },

    /**
     * Search personas - uses display endpoint for frontend with proper categorization
     */
    search: async (query?: string, expertise?: string): Promise<APIResponse<any[]>> => {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (expertise) params.append('expertise', expertise);
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/display?${params}`));
    },

    /**
     * Get all personas for display (used by PersonaSelector)
     */
    getForDisplay: async (): Promise<APIResponse<any[]>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/display`));
    },

    /**
     * Simple search for personas (frontend optimized)
     */
    searchSimple: async (query?: string, expertise?: string): Promise<APIResponse<any[]>> => {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (expertise) params.append('expertise', expertise);
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/search/simple?${params}`));
    },

    /**
     * Get persona recommendations
     */
    getRecommendations: async (context: string): Promise<APIResponse<PersonaRecommendation[]>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/recommendations?context=${encodeURIComponent(context)}`));
    },

    /**
     * Get persona templates
     */
    getTemplates: async (): Promise<APIResponse<PersonaTemplate[]>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/templates`));
    },

    /**
     * Get persona by ID
     */
    get: async (personaId: string): Promise<APIResponse<Persona>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/${personaId}`));
    },

    /**
     * Update persona
     */
    update: async (personaId: string, updates: Partial<Persona>): Promise<APIResponse<Persona>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/${personaId}`), {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Delete persona
     */
    delete: async (personaId: string): Promise<APIResponse<void>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/${personaId}`), {
        method: 'DELETE',
      });
    },

    /**
     * Get persona analytics
     */
    getAnalytics: async (personaId: string): Promise<APIResponse<PersonaAnalytics>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/${personaId}/analytics`));
    },

    /**
     * Validate persona
     */
    validatePersona: async (personaId: string, validationData: Record<string, unknown>): Promise<APIResponse<PersonaValidation>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/${personaId}/validate`), {
        method: 'POST',
        body: JSON.stringify(validationData),
      });
    }
  };

  // ============================================================================
  // CAPABILITY REGISTRY SERVICE METHODS
  // ============================================================================

  /**
   * Capability Registry Service API methods
   */
  capabilities = {
    /**
     * Search capabilities
     */
    search: async (searchParams: CapabilitySearchRequest): Promise<APIResponse<CapabilitySearchResponse>> => {
      try {
        const params = new URLSearchParams();

        if (searchParams.query) params.append('query', searchParams.query);
        if (searchParams.type) params.append('type', searchParams.type);
        if (searchParams.category) params.append('category', searchParams.category);
        if (searchParams.tags) params.append('tags', searchParams.tags.join(','));
        if (searchParams.securityLevel) params.append('securityLevel', searchParams.securityLevel);
        if (searchParams.includeDeprecated) params.append('includeDeprecated', searchParams.includeDeprecated.toString());
        if (searchParams.sortBy) params.append('sortBy', searchParams.sortBy);
        if (searchParams.sortOrder) params.append('sortOrder', searchParams.sortOrder);
        if (searchParams.limit) params.append('limit', searchParams.limit.toString());
        if (searchParams.offset) params.append('offset', searchParams.offset.toString());

        const response = await this.request<CapabilitySearchResponse>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/search?${params}`));
        
        // DON'T RETRY - just return empty response if it fails
        if (!response.success) {
          console.warn('Capabilities search not available');
          return {
            success: true,
            data: {
              capabilities: [],
              totalCount: 0,
              recommendations: [],
              searchTime: 0
            },
            meta: {
              timestamp: new Date(),
              requestId: this.generateRequestId()
            }
          };
        }
        
        return response;
      } catch (error) {
        console.warn('Capabilities search failed:', error);
        // DON'T RETRY - just return empty response
        return {
          success: true,
          data: {
            capabilities: [],
            totalCount: 0,
            recommendations: [],
            searchTime: 0
          },
          meta: {
            timestamp: new Date(),
            requestId: this.generateRequestId()
          }
        };
      }
    },

    /**
     * Get capability categories
     */
    getCategories: async (): Promise<APIResponse<string[]>> => {
      try {
        const response = await this.request<string[]>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/categories`));
        
        // If the API call fails, return a mock successful response to prevent infinite retries
        if (!response.success) {
          console.warn('Capability categories API endpoint not available, returning mock response');
          return {
            success: true,
            data: ['System', 'External', 'Analysis', 'Communication', 'Development'],
            meta: {
              timestamp: new Date(),
              requestId: this.generateRequestId()
            }
          };
        }
        
        return response;
      } catch (error) {
        console.warn('Failed to get capability categories, returning mock response:', error);
        // Return successful mock response instead of throwing to prevent infinite retries
        return {
          success: true,
          data: ['System', 'External', 'Analysis', 'Communication', 'Development'],
          meta: {
            timestamp: new Date(),
            requestId: this.generateRequestId()
          }
        };
      }
    },

    /**
     * Get capability recommendations
     */
    getRecommendations: async (context?: Record<string, any>): Promise<APIResponse<CapabilityRecommendation[]>> => {
      const params = context ? `?${new URLSearchParams(context)}` : '';
      return this.request<CapabilityRecommendation[]>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/recommendations${params}`));
    },

    /**
     * Register new capability
     */
    register: async (capability: Omit<Capability, 'id' | 'createdAt' | 'updatedAt'>): Promise<APIResponse<Capability>> => {
      return this.request<Capability>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/register`), {
        method: 'POST',
        body: JSON.stringify(capability),
      });
    },

    /**
     * Get capability by ID
     */
    get: async (capabilityId: string): Promise<APIResponse<Capability>> => {
      return this.request<Capability>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/${capabilityId}`));
    },

    /**
     * Update capability
     */
    update: async (capabilityId: string, updates: Partial<Capability>): Promise<APIResponse<Capability>> => {
      return this.request<Capability>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/${capabilityId}`), {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Delete capability
     */
    delete: async (capabilityId: string): Promise<APIResponse<void>> => {
      return this.request<void>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/${capabilityId}`), {
        method: 'DELETE',
      });
    },

    /**
     * Get capability dependencies
     */
    getDependencies: async (capabilityId: string): Promise<APIResponse<string[]>> => {
      return this.request<string[]>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/${capabilityId}/dependencies`));
    },

    /**
     * Validate capability
     */
    validate: async (capabilityId: string, validationData?: Record<string, any>): Promise<APIResponse<{ valid: boolean; errors?: string[] }>> => {
      return this.request<{ valid: boolean; errors?: string[] }>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/${capabilityId}/validate`), {
        method: 'POST',
        body: JSON.stringify(validationData || {}),
      });
    },
  };

  // ============================================================================
  // TOOLS API METHODS (from Capability Registry Service)
  // ============================================================================

  /**
   * Tools API methods - from Capability Registry Service
   */
  tools = {
    /**
     * Get all tools
     */
    list: async (criteria?: {
      category?: string;
      type?: string;
      status?: string;
      tags?: string[];
      limit?: number;
      offset?: number;
    }): Promise<APIResponse<any[]>> => {
      try {
        const params = new URLSearchParams();
        if (criteria?.category) params.append('category', criteria.category);
        if (criteria?.type) params.append('type', criteria.type);
        if (criteria?.status) params.append('status', criteria.status);
        if (criteria?.tags) params.append('tags', criteria.tags.join(','));
        if (criteria?.limit) params.append('limit', criteria.limit.toString());
        if (criteria?.offset) params.append('offset', criteria.offset.toString());

        const queryString = params.toString();
        const endpoint = queryString ? `${API_ROUTES.TOOLS}?${queryString}` : API_ROUTES.TOOLS;
        
        const response = await this.request<any[]>(buildAPIURL(endpoint));
        
        if (!response.success) {
          console.warn('Tools API not available, returning empty array');
          return {
            success: true,
            data: [],
            meta: {
              timestamp: new Date(),
              requestId: this.generateRequestId()
            }
          };
        }
        
        return response;
      } catch (error) {
        console.warn('Failed to fetch tools, returning empty array:', error);
        return {
          success: true,
          data: [],
          meta: {
            timestamp: new Date(),
            requestId: this.generateRequestId()
          }
        };
      }
    },

    /**
     * Get tool by ID
     */
    get: async (toolId: string): Promise<APIResponse<any>> => {
      return this.request<any>(buildAPIURL(`${API_ROUTES.TOOLS}/${toolId}`));
    },

    /**
     * Register new tool
     */
    register: async (toolData: any): Promise<APIResponse<any>> => {
      return this.request<any>(buildAPIURL(API_ROUTES.TOOLS), {
        method: 'POST',
        body: JSON.stringify(toolData),
      });
    },

    /**
     * Update tool
     */
    update: async (toolId: string, updates: any): Promise<APIResponse<any>> => {
      return this.request<any>(buildAPIURL(`${API_ROUTES.TOOLS}/${toolId}`), {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Delete tool
     */
    delete: async (toolId: string): Promise<APIResponse<void>> => {
      return this.request<void>(buildAPIURL(`${API_ROUTES.TOOLS}/${toolId}`), {
        method: 'DELETE',
      });
    },

    /**
     * Execute tool
     */
    execute: async (toolId: string, parameters: any, options?: {
      approvalRequired?: boolean;
      maxCost?: number;
      timeout?: number;
    }): Promise<APIResponse<any>> => {
      return this.request<any>(buildAPIURL(`${API_ROUTES.TOOLS}/${toolId}/execute`), {
        method: 'POST',
        body: JSON.stringify({ parameters, options }),
      });
    },

    /**
     * Get tool categories
     */
    getCategories: async (): Promise<APIResponse<string[]>> => {
      try {
        const response = await this.request<string[]>(buildAPIURL(`${API_ROUTES.TOOLS}/categories`));
        
        if (!response.success) {
          console.warn('Tool categories API not available, returning mock categories');
          return {
            success: true,
            data: ['System', 'External', 'Analysis', 'Communication', 'Development'],
            meta: {
              timestamp: new Date(),
              requestId: this.generateRequestId()
            }
          };
        }
        
        return response;
      } catch (error) {
        console.warn('Failed to get tool categories, returning mock categories:', error);
        return {
          success: true,
          data: ['System', 'External', 'Analysis', 'Communication', 'Development'],
          meta: {
            timestamp: new Date(),
            requestId: this.generateRequestId()
          }
        };
      }
    },

    /**
     * Get tool recommendations
     */
    getRecommendations: async (context?: any): Promise<APIResponse<any[]>> => {
      const params = context ? `?${new URLSearchParams(context)}` : '';
      return this.request<any[]>(buildAPIURL(`${API_ROUTES.TOOLS}/recommendations${params}`));
    },

    /**
     * Get related tools
     */
    getRelated: async (toolId: string): Promise<APIResponse<any[]>> => {
      return this.request<any[]>(buildAPIURL(`${API_ROUTES.TOOLS}/${toolId}/related`));
    },

    /**
     * Get similar tools
     */
    getSimilar: async (toolId: string): Promise<APIResponse<any[]>> => {
      return this.request<any[]>(buildAPIURL(`${API_ROUTES.TOOLS}/${toolId}/similar`));
    },

    /**
     * Get tool dependencies
     */
    getDependencies: async (toolId: string): Promise<APIResponse<string[]>> => {
      return this.request<string[]>(buildAPIURL(`${API_ROUTES.TOOLS}/${toolId}/dependencies`));
    },

    /**
     * Validate tool
     */
    validate: async (toolData: any): Promise<APIResponse<{ valid: boolean; errors?: string[] }>> => {
      return this.request<{ valid: boolean; errors?: string[] }>(buildAPIURL(`${API_ROUTES.TOOLS}/validate`), {
        method: 'POST',
        body: JSON.stringify(toolData),
      });
    },

    /**
     * Get tool executions
     */
    getExecutions: async (filters?: {
      toolId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<APIResponse<any[]>> => {
      const params = new URLSearchParams();
      if (filters?.toolId) params.append('toolId', filters.toolId);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const queryString = params.toString();
      const endpoint = queryString ? `${API_ROUTES.TOOLS}/executions?${queryString}` : `${API_ROUTES.TOOLS}/executions`;
      
      return this.request<any[]>(buildAPIURL(endpoint));
    },

    /**
     * Get usage analytics
     */
    getUsageAnalytics: async (period?: string): Promise<APIResponse<any>> => {
      const params = period ? `?period=${encodeURIComponent(period)}` : '';
      return this.request<any>(buildAPIURL(`${API_ROUTES.TOOLS}/analytics/usage${params}`));
    },

    /**
     * Get popular tools
     */
    getPopular: async (limit?: number): Promise<APIResponse<any[]>> => {
      const params = limit ? `?limit=${limit}` : '';
      return this.request<any[]>(buildAPIURL(`${API_ROUTES.TOOLS}/analytics/popular${params}`));
    }
  };

  // ============================================================================
  // ORCHESTRATION PIPELINE SERVICE METHODS
  // ============================================================================

  /**
   * Orchestration Pipeline Service API methods
   */
  orchestration = {
    /**
     * Execute operation
     */
    execute: async (operationRequest: ExecuteOperationRequest): Promise<APIResponse<{ workflowInstanceId: string }>> => {
      return this.request<{ workflowInstanceId: string }>('/api/v1/operations', {
        method: 'POST',
        body: JSON.stringify(operationRequest),
      });
    },

    /**
     * List operations
     */
    list: async (): Promise<APIResponse<Operation[]>> => {
      return this.request<Operation[]>('/api/v1/operations');
    },

    /**
     * Get operation status
     */
    getStatus: async (operationId: string): Promise<APIResponse<OperationStatusResponse>> => {
      return this.request(`/api/v1/operations/${operationId}/status`);
    },

    /**
     * Pause operation
     */
    pause: async (operationId: string, pauseRequest: PauseOperationRequest): Promise<APIResponse<OperationStatusResponse>> => {
      return this.request(`/api/v1/operations/${operationId}/pause`, {
        method: 'POST',
        body: JSON.stringify(pauseRequest),
      });
    },

    /**
     * Resume operation
     */
    resume: async (operationId: string, resumeRequest: ResumeOperationRequest): Promise<APIResponse<OperationStatusResponse>> => {
      return this.request(`/api/v1/operations/${operationId}/resume`, {
        method: 'POST',
        body: JSON.stringify(resumeRequest),
      });
    },

    /**
     * Cancel operation
     */
    cancel: async (operationId: string, cancelRequest: CancelOperationRequest): Promise<APIResponse<OperationStatusResponse>> => {
      return this.request(`/api/v1/operations/${operationId}/cancel`, {
        method: 'POST',
        body: JSON.stringify(cancelRequest),
      });
    }
  };

  // ============================================================================
  // DISCUSSION MANAGEMENT METHODS
  // ============================================================================

  /**
   * Discussion Management Service API methods
   */
  discussions = {
    /**
     * Create discussion
     */
    create: async (discussionData: CreateDiscussionRequest): Promise<APIResponse<Discussion>> => {
      return this.request('/api/v1/discussions', {
        method: 'POST',
        body: JSON.stringify(discussionData),
      });
    },

    /**
     * Search discussions
     */
    search: async (query?: string, status?: string): Promise<APIResponse<Discussion[]>> => {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (status) params.append('status', status);
      return this.request(`/api/v1/discussions/search?${params}`);
    },

    /**
     * Get discussion
     */
    get: async (discussionId: string): Promise<APIResponse<Discussion>> => {
      return this.request(`/api/v1/discussions/${discussionId}`);
    },

    /**
     * Update discussion
     */
    update: async (discussionId: string, updates: UpdateDiscussionRequest): Promise<APIResponse<Discussion>> => {
      return this.request(`/api/v1/discussions/${discussionId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Start discussion
     */
    start: async (discussionId: string): Promise<APIResponse<Discussion>> => {
      return this.request(`/api/v1/discussions/${discussionId}/start`, {
        method: 'POST',
      });
    },

    /**
     * End discussion
     */
    end: async (discussionId: string, endData: {
      reason: string;
      summary: string;
    }): Promise<APIResponse<DiscussionSummary>> => {
      return this.request(`/api/v1/discussions/${discussionId}/end`, {
        method: 'POST',
        body: JSON.stringify(endData),
      });
    },

    /**
     * Add participant
     */
    addParticipant: async (discussionId: string, participantData: Omit<DiscussionParticipant, 'id' | 'createdAt' | 'updatedAt'>): Promise<APIResponse<DiscussionParticipant>> => {
      return this.request(`/api/v1/discussions/${discussionId}/participants`, {
        method: 'POST',
        body: JSON.stringify(participantData),
      });
    },

    /**
     * Remove participant
     */
    removeParticipant: async (discussionId: string, participantId: string): Promise<APIResponse<void>> => {
      return this.request(`/api/v1/discussions/${discussionId}/participants/${participantId}`, {
        method: 'DELETE',
      });
    },

    /**
     * Send message
     */
    sendMessage: async (discussionId: string, participantId: string, messageData: Omit<DiscussionMessage, 'id' | 'createdAt' | 'updatedAt'>): Promise<APIResponse<DiscussionMessage>> => {
      return this.request(`/api/v1/discussions/${discussionId}/participants/${participantId}/messages`, {
        method: 'POST',
        body: JSON.stringify(messageData),
      });
    },

    /**
     * Get messages
     */
    getMessages: async (discussionId: string, limit = 50, offset = 0): Promise<APIResponse<DiscussionMessage[]>> => {
      return this.request(`/api/v1/discussions/${discussionId}/messages?limit=${limit}&offset=${offset}`);
    },

    /**
     * Advance turn
     */
    advanceTurn: async (discussionId: string, turnData: {
      force: boolean;
      reason: string;
    }): Promise<APIResponse<DiscussionState>> => {
      return this.request(`/api/v1/discussions/${discussionId}/advance-turn`, {
        method: 'POST',
        body: JSON.stringify(turnData),
      });
    },

    /**
     * Get discussion analytics
     */
    getAnalytics: async (discussionId: string): Promise<APIResponse<DiscussionAnalytics>> => {
      return this.request(`/api/v1/discussions/${discussionId}/analytics`);
    }
  };

  // ============================================================================
  // SECURITY GATEWAY SERVICE METHODS
  // ============================================================================

  /**
   * Authentication Service API methods
   */
  auth = {
    /**
     * Login
     */
    login: async (credentials: LoginRequest): Promise<APIResponse<LoginResponse>> => {
      return this.request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
    },

    /**
     * Refresh token
     */
    refresh: async (refreshToken: string): Promise<APIResponse<{ tokens: { accessToken: string } }>> => {
      return this.request('/api/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    },

    /**
     * Logout
     */
    logout: async (): Promise<APIResponse<void>> => {
      return this.request('/api/v1/auth/logout', {
        method: 'POST',
      });
    },

    /**
     * Get current user
     */
    me: async (): Promise<APIResponse<User>> => {
      return this.request('/api/v1/auth/me');
    },

    /**
     * Change password
     */
    changePassword: async (passwordData: ChangePasswordRequest): Promise<APIResponse<void>> => {
      return this.request('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(passwordData),
      });
    },

    /**
     * Forgot password
     */
    forgotPassword: async (email: string): Promise<APIResponse<void>> => {
      return this.request('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    }
  };

  /**
   * Security Service API methods
   */
  security = {
    /**
     * Assess risk
     */
    assessRisk: async (riskData: {
      operation: {
        type: string;
        resource: string;
        action: string;
      };
      context: {
        userId: string;
        department: string;
        purpose: string;
      };
    }): Promise<APIResponse<RiskAssessment>> => {
      return this.request('/api/v1/security/assess-risk', {
        method: 'POST',
        body: JSON.stringify(riskData),
      });
    },

    /**
     * Check approval required
     */
    checkApprovalRequired: async (operationData: {
      operation: {
        type: string;
        resource: string;
        action: string;
      };
      requestor: {
        userId: string;
        role: string;
      };
    }): Promise<APIResponse<ApprovalRequirement>> => {
      return this.request('/api/v1/security/check-approval-required', {
        method: 'POST',
        body: JSON.stringify(operationData),
      });
    },

    /**
     * Get policies
     */
    getPolicies: async (category?: string): Promise<APIResponse<SecurityPolicy[]>> => {
      const params = category ? `?category=${encodeURIComponent(category)}` : '';
      return this.request(`/api/v1/security/policies${params}`);
    },

    /**
     * Get policy by ID
     */
    getPolicy: async (policyId: string): Promise<APIResponse<SecurityPolicy>> => {
      return this.request(`/api/v1/security/policies/${policyId}`);
    },

    /**
     * Create policy
     */
    createPolicy: async (policyData: Partial<SecurityPolicy>): Promise<APIResponse<SecurityPolicy>> => {
      return this.request('/api/v1/security/policies', {
        method: 'POST',
        body: JSON.stringify(policyData),
      });
    },

    /**
     * Update policy
     */
    updatePolicy: async (policyId: string, updates: Partial<SecurityPolicy>): Promise<APIResponse<SecurityPolicy>> => {
      return this.request(`/api/v1/security/policies/${policyId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Delete policy
     */
    deletePolicy: async (policyId: string): Promise<APIResponse<void>> => {
      return this.request(`/api/v1/security/policies/${policyId}`, {
        method: 'DELETE',
      });
    },

    /**
     * Get security stats
     */
    getStats: async (): Promise<APIResponse<SecurityStats>> => {
      return this.request('/api/v1/security/stats');
    }
  };

  /**
   * Approval Workflow Service API methods
   */
  approvals = {
    /**
     * Create approval workflow
     */
    createWorkflow: async (workflowData: CreateApprovalWorkflowRequest): Promise<APIResponse<ApprovalWorkflow>> => {
      return this.request('/api/v1/approvals/workflows', {
        method: 'POST',
        body: JSON.stringify(workflowData),
      });
    },

    /**
     * Submit approval decision
     */
    submitDecision: async (workflowId: string, decision: ApprovalDecision): Promise<APIResponse<ApprovalWorkflow>> => {
      return this.request(`/api/v1/approvals/${workflowId}/decisions`, {
        method: 'POST',
        body: JSON.stringify(decision),
      });
    },

    /**
     * Get approval workflow
     */
    getWorkflow: async (workflowId: string): Promise<APIResponse<ApprovalWorkflow>> => {
      return this.request(`/api/v1/approvals/${workflowId}`);
    },

    /**
     * Get all workflows
     */
    getWorkflows: async (status?: string, limit?: number): Promise<APIResponse<ApprovalWorkflow[]>> => {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (limit) params.append('limit', limit.toString());
      return this.request(`/api/v1/approvals/workflows?${params}`);
    },

    /**
     * Get pending approvals
     */
    getPendingApprovals: async (): Promise<APIResponse<ApprovalWorkflow[]>> => {
      try {
        const response = await this.request<ApprovalWorkflow[]>('/api/v1/approvals/pending');
        
        // DON'T RETRY - just return empty response if it fails
        if (!response.success) {
          console.warn('Pending approvals API not available');
          return {
            success: true,
            data: [],
            meta: {
              timestamp: new Date(),
              requestId: this.generateRequestId()
            }
          };
        }
        
        return response;
      } catch (error) {
        console.warn('Failed to fetch pending approvals:', error);
        // DON'T RETRY - just return empty response
        return {
          success: true,
          data: [],
          meta: {
            timestamp: new Date(),
            requestId: this.generateRequestId()
          }
        };
      }
    },

    /**
     * Cancel workflow
     */
    cancelWorkflow: async (workflowId: string, reason: string): Promise<APIResponse<ApprovalWorkflow>> => {
      return this.request(`/api/v1/approvals/${workflowId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },

    /**
     * Get approval stats
     */
    getStats: async (): Promise<APIResponse<ApprovalStats>> => {
      return this.request('/api/v1/approvals/stats');
    }
  };

  /**
   * User Management Service API methods
   */
  users = {
    /**
     * Get all users
     */
    getAll: async (params?: UserSearchFilters): Promise<APIResponse<User[]>> => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.append('page', params.page.toString());
      if (params?.limit) searchParams.append('limit', params.limit.toString());
      if (params?.role) searchParams.append('role', params.role);
      if (params?.department) searchParams.append('department', params.department);
      if (params?.status) searchParams.append('status', params.status);
      return this.request(`/api/v1/users?${searchParams}`);
    },

    /**
     * Get user by ID
     */
    get: async (userId: string): Promise<APIResponse<User>> => {
      return this.request(`/api/v1/users/${userId}`);
    },

    /**
     * Create user
     */
    create: async (userData: CreateUserRequest): Promise<APIResponse<User>> => {
      return this.request('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
    },

    /**
     * Update user
     */
    update: async (userId: string, updates: UpdateUserRequest): Promise<APIResponse<User>> => {
      return this.request(`/api/v1/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Delete user
     */
    delete: async (userId: string): Promise<APIResponse<void>> => {
      return this.request(`/api/v1/users/${userId}`, {
        method: 'DELETE',
      });
    },

    /**
     * Reset user password
     */
    resetPassword: async (userId: string, passwordData: ResetPasswordRequest): Promise<APIResponse<void>> => {
      return this.request(`/api/v1/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify(passwordData),
      });
    },

    /**
     * Unlock user
     */
    unlock: async (userId: string, reason: string): Promise<APIResponse<void>> => {
      return this.request(`/api/v1/users/${userId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },

    /**
     * Bulk user action
     */
    bulkAction: async (actionData: BulkUserAction): Promise<APIResponse<{ affectedUsers: number; results: Array<{ userId: string; success: boolean; error?: string }> }>> => {
      return this.request('/api/v1/users/bulk-action', {
        method: 'POST',
        body: JSON.stringify(actionData),
      });
    },

    /**
     * Get user stats
     */
    getStats: async (): Promise<APIResponse<UserStats>> => {
      return this.request('/api/v1/users/stats');
    }
  };

  /**
   * Audit & Logging Service API methods
   */
  audit = {
    /**
     * Get audit logs
     */
    getLogs: async (params?: AuditSearchFilters): Promise<APIResponse<AuditLog[]>> => {
      const searchParams = new URLSearchParams();
      if (params?.eventType) searchParams.append('eventType', params.eventType);
      if (params?.startDate) searchParams.append('startDate', params.startDate);
      if (params?.endDate) searchParams.append('endDate', params.endDate);
      if (params?.limit) searchParams.append('limit', params.limit.toString());
      if (params?.offset) searchParams.append('offset', params.offset.toString());
      if (params?.userId) searchParams.append('userId', params.userId);
      if (params?.agentId) searchParams.append('agentId', params.agentId);
      if (params?.resourceType) searchParams.append('resourceType', params.resourceType);
      if (params?.outcome) searchParams.append('outcome', params.outcome);
      if (params?.severity) searchParams.append('severity', params.severity);
      return this.request(`/api/v1/audit/logs?${searchParams}`);
    },

    /**
     * Get audit log by ID
     */
    getLog: async (logId: string): Promise<APIResponse<AuditLog>> => {
      return this.request(`/api/v1/audit/logs/${logId}`);
    },

    /**
     * Get event types
     */
    getEventTypes: async (): Promise<APIResponse<string[]>> => {
      return this.request('/api/v1/audit/events/types');
    },

    /**
     * Get audit stats
     */
    getStats: async (period?: string): Promise<APIResponse<AuditStats>> => {
      const params = period ? `?period=${encodeURIComponent(period)}` : '';
      return this.request(`/api/v1/audit/stats${params}`);
    },

    /**
     * Export audit logs
     */
    exportLogs: async (exportData: AuditExportConfig): Promise<APIResponse<string | Blob>> => {
      return this.request('/api/v1/audit/export', {
        method: 'POST',
        body: JSON.stringify(exportData),
      });
    },

    /**
     * Generate compliance report
     */
    generateComplianceReport: async (reportData: {
      reportType: 'sox' | 'gdpr' | 'hipaa' | 'pci' | 'custom';
      period: { startDate: string; endDate: string };
      includeMetrics: boolean;
      includeRecommendations: boolean;
      format: 'pdf' | 'html' | 'json';
    }): Promise<APIResponse<ComplianceReport>> => {
      return this.request('/api/v1/audit/compliance-report', {
        method: 'POST',
        body: JSON.stringify(reportData),
      });
    },

    /**
     * Get user activity
     */
    getUserActivity: async (userId: string, startDate?: string, endDate?: string): Promise<APIResponse<UserActivitySummary[]>> => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      return this.request(`/api/v1/audit/user-activity/${userId}?${params}`);
    },

    /**
     * Cleanup old logs
     */
    cleanupLogs: async (cleanupData: {
      retentionDays: number;
      dryRun: boolean;
      eventTypes?: string[];
    }): Promise<APIResponse<AuditCleanupResult>> => {
      return this.request('/api/v1/audit/cleanup', {
        method: 'DELETE',
        body: JSON.stringify(cleanupData),
      });
    },

    async getAuditLogs(filters?: AuditSearchFilters): Promise<APIResponse<AuditLog[]>> {
      return this.request(`${API_ROUTES.SECURITY}/audit/logs`, {
        method: 'GET',
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    },

    async exportAuditLogs(format: 'json' | 'csv' = 'json'): Promise<APIResponse<string | Blob>> {
      return this.request(`${API_ROUTES.SECURITY}/audit/export?format=${format}`, {
        method: 'GET',
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    }
  };

  llm = {
    getModels: async (): Promise<APIResponse<LLMModel[]>> => {
      return this.request(`${API_ROUTES.LLM}/models`, {
        method: 'GET',
      });
    },

    getModelsFromProvider: async (providerType: string): Promise<APIResponse<LLMModel[]>> => {
      return this.request(`${API_ROUTES.LLM}/models/${providerType}`, {
        method: 'GET',
      });
    },

    getProviders: async (): Promise<APIResponse<ProviderConfig[]>> => {
      return this.request(`${API_ROUTES.LLM}/providers`, {
        method: 'GET',
      });
    },

    getProviderStats: async (): Promise<APIResponse<ProviderStats[]>> => {
      return this.request(`${API_ROUTES.LLM}/providers/stats`, {
        method: 'GET',
      });
    },

    generateResponse: async (request: LLMGenerationRequest): Promise<APIResponse<LLMGenerationResponse>> => {
      return this.request(`${API_ROUTES.LLM}/generate`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
    },

    generateAgentResponse: async (request: AgentLLMRequest): Promise<APIResponse<LLMGenerationResponse>> => {
      return this.request(`${API_ROUTES.LLM}/agent-response`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
    },

    generateArtifact: async (request: ArtifactGenerationRequest): Promise<APIResponse<ArtifactGenerationResponse>> => {
      return this.request(`${API_ROUTES.LLM}/artifact`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
    },

    analyzeContext: async (request: ContextAnalysisRequest): Promise<APIResponse<ContextAnalysisResponse>> => {
      return this.request(`${API_ROUTES.LLM}/analyze-context`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
    }
  };

  // User-specific LLM methods (using user LLM routes)
  userLLM = {
    getProviders: async (): Promise<APIResponse<ProviderConfig[]>> => {
      return this.request(`${API_ROUTES.USER_LLM}/providers`, {
        method: 'GET',
      });
    },

    createProvider: async (providerData: ModelProvider): Promise<APIResponse<ProviderConfig>> => {
      return this.request(`${API_ROUTES.USER_LLM}/providers`, {
        method: 'POST',
        body: JSON.stringify(providerData),
      });
    },

    updateProviderConfig: async (providerId: string, config: {
      name?: string;
      description?: string;
      baseUrl?: string;
      defaultModel?: string;
      priority?: number;
      configuration?: Record<string, unknown>;
    }): Promise<APIResponse<void>> => {
      return this.request(`${API_ROUTES.USER_LLM}/providers/${providerId}`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
    },

    updateProviderApiKey: async (providerId: string, apiKey: string): Promise<APIResponse<void>> => {
      return this.request(`${API_ROUTES.USER_LLM}/providers/${providerId}/api-key`, {
        method: 'PUT',
        body: JSON.stringify({ apiKey }),
      });
    },

    testProvider: async (providerId: string): Promise<APIResponse<ProviderTestResult>> => {
      return this.request(`${API_ROUTES.USER_LLM}/providers/${providerId}/test`, {
        method: 'POST',
      });
    },

    deleteProvider: async (providerId: string): Promise<APIResponse<void>> => {
      return this.request(`${API_ROUTES.USER_LLM}/providers/${providerId}`, {
        method: 'DELETE',
      });
    },

    getModels: async (): Promise<APIResponse<LLMModel[]>> => {
      return this.request(`${API_ROUTES.USER_LLM}/models`, {
        method: 'GET',
      });
    },

    generateResponse: async (request: LLMGenerationRequest): Promise<APIResponse<LLMGenerationResponse>> => {
      return this.request(`${API_ROUTES.USER_LLM}/generate`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
    },

    generateAgentResponse: async (request: AgentLLMRequest): Promise<APIResponse<LLMGenerationResponse>> => {
      return this.request(`${API_ROUTES.USER_LLM}/agent-response`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
    }
  };

  // Knowledge Graph API methods
  knowledge = {
    uploadKnowledge: async (items: KnowledgeIngestRequest[]): Promise<APIResponse<KnowledgeIngestResponse>> => {
      return this.request(`${API_ROUTES.KNOWLEDGE}`, {
        method: 'POST',
        body: JSON.stringify(items),
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    },

    searchKnowledge: async (query: KnowledgeSearchRequest): Promise<APIResponse<KnowledgeSearchResponse>> => {
      const params = new URLSearchParams();
      params.append('query', query.query);
      if (query.filters?.tags) {
        query.filters.tags.forEach(tag => params.append('tags', tag));
      }
      if (query.filters?.types) {
        query.filters.types.forEach(type => params.append('types', type));
      }
      if (query.filters?.sourceTypes) {
        query.filters.sourceTypes.forEach(sourceType => params.append('sourceTypes', sourceType));
      }
      if (query.options?.limit) {
        params.append('limit', query.options.limit.toString());
      }
      if (query.options?.offset) {
        params.append('offset', query.options.offset.toString());
      }

      return this.request(`${API_ROUTES.KNOWLEDGE}/search?${params.toString()}`, {
        method: 'GET',
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    },

    updateKnowledge: async (itemId: string, updates: Partial<KnowledgeItem>): Promise<APIResponse<KnowledgeItem>> => {
      return this.request(`${API_ROUTES.KNOWLEDGE}/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    },

    deleteKnowledge: async (itemId: string): Promise<APIResponse<void>> => {
      return this.request(`${API_ROUTES.KNOWLEDGE}/${itemId}`, {
        method: 'DELETE',
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    },

    getKnowledgeStats: async (): Promise<APIResponse<{
      totalItems: number;
      itemsByType: Record<KnowledgeType, number>;
      itemsBySource: Record<SourceType, number>;
      recentActivity: Array<{
        date: string;
        uploads: number;
        searches: number;
      }>;
    }>> => {
      return this.request(`${API_ROUTES.KNOWLEDGE}/stats`, {
        method: 'GET',
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    },

    getRelatedKnowledge: async (itemId: string): Promise<APIResponse<KnowledgeItem[]>> => {
      return this.request(`${API_ROUTES.KNOWLEDGE}/${itemId}/related`, {
        method: 'GET',
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    },

    getKnowledgeByTag: async (tag: string): Promise<APIResponse<KnowledgeItem[]>> => {
      return this.request(`${API_ROUTES.KNOWLEDGE}/tags/${encodeURIComponent(tag)}`, {
        method: 'GET',
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    },

    getKnowledgeItem: async (itemId: string): Promise<APIResponse<KnowledgeItem>> => {
      return this.request(`${API_ROUTES.KNOWLEDGE}/${itemId}`, {
        method: 'GET',
        headers: {
          ...this.getAuthHeaders(),
        },
      });
    }
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a pre-configured API client instance
 */
export function createAPIClient(config?: APIConfig): UAIPAPIClient {
  return new UAIPAPIClient(config);
}

/**
 * Default API client instance
 */
export const apiClient = createAPIClient();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if API response indicates success
 */
export function isSuccessResponse<T>(response: APIResponse<T>): response is APIResponse<T> & { success: true; data: T } {
  return response.success === true && response.data !== undefined;
}

/**
 * Extract error message from API response
 */
export function getErrorMessage(response: APIResponse): string {
  return response.error?.message || 'Unknown error occurred';
}

/**
 * Extract error code from API response
 */
export function getErrorCode(response: APIResponse): string {
  return response.error?.code || 'UNKNOWN_ERROR';
}

/**
 * Type guard for checking if response has error
 */
export function hasError(response: APIResponse): response is APIResponse & { success: false; error: NonNullable<APIResponse['error']> } {
  return response.success === false && response.error !== undefined;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default UAIPAPIClient; 