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
  LLMUsage
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
    details?: Record<string, unknown>;
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
  userPreferences?: Record<string, unknown>;
  securityContext?: Record<string, unknown>;
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

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  memory: {
    used: number;
    total: number;
    external: number;
  };
}

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
          }
        } catch (refreshError) {
          // Token refresh failed, redirect to login
          this.handleAuthFailure();
          throw new Error('Authentication failed');
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
      const newToken = data.tokens?.accessToken;

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
    
    // Redirect to login if in browser environment
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = '/login';
    }
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
     * Health check endpoints
     */
    health: {
      basic: async (): Promise<APIResponse<HealthStatus>> => {
        return this.request<HealthStatus>(buildAPIURL(API_ROUTES.HEALTH));
      },
      detailed: async (): Promise<APIResponse<HealthStatus & { dependencies: Record<string, any> }>> => {
        return this.request<HealthStatus & { dependencies: Record<string, any> }>(buildAPIURL(`${API_ROUTES.HEALTH}/detailed`));
      },
      ready: async (): Promise<APIResponse<{ ready: boolean }>> => {
        return this.request<{ ready: boolean }>(buildAPIURL(`${API_ROUTES.HEALTH}/ready`));
      },
      live: async (): Promise<APIResponse<{ alive: boolean }>> => {
        return this.request<{ alive: boolean }>(buildAPIURL(`${API_ROUTES.HEALTH}/live`));
      },
      metrics: async (): Promise<APIResponse<Record<string, any>>> => {
        return this.request<Record<string, any>>(buildAPIURL(`${API_ROUTES.HEALTH}/metrics`));
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
     * Search personas
     */
    search: async (query?: string, expertise?: string): Promise<APIResponse<Persona[]>> => {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (expertise) params.append('expertise', expertise);
      params.append('offset', '0');
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/search?${params}`));
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

      return this.request<CapabilitySearchResponse>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/search?${params}`));
    },

    /**
     * Get capability categories
     */
    getCategories: async (): Promise<APIResponse<string[]>> => {
      return this.request<string[]>(buildAPIURL(`${API_ROUTES.CAPABILITIES}/categories`));
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
    getStatus: async (operationId: string): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/operations/${operationId}/status`);
    },

    /**
     * Pause operation
     */
    pause: async (operationId: string, pauseRequest: PauseOperationRequest): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/operations/${operationId}/pause`, {
        method: 'POST',
        body: JSON.stringify(pauseRequest),
      });
    },

    /**
     * Resume operation
     */
    resume: async (operationId: string, resumeRequest: ResumeOperationRequest): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/operations/${operationId}/resume`, {
        method: 'POST',
        body: JSON.stringify(resumeRequest),
      });
    },

    /**
     * Cancel operation
     */
    cancel: async (operationId: string, cancelRequest: CancelOperationRequest): Promise<APIResponse<any>> => {
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
    login: async (credentials: {
      email: string;
      password: string;
      rememberMe?: boolean;
    }): Promise<APIResponse<{ user: any; tokens: { accessToken: string; refreshToken: string } }>> => {
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
    me: async (): Promise<APIResponse<any>> => {
      return this.request('/api/v1/auth/me');
    },

    /**
     * Change password
     */
    changePassword: async (passwordData: {
      currentPassword: string;
      newPassword: string;
    }): Promise<APIResponse<void>> => {
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
    }): Promise<APIResponse<any>> => {
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
    }): Promise<APIResponse<{ required: boolean; approvers?: string[] }>> => {
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
    createWorkflow: async (workflowData: {
      operation: any;
      requestor: any;
      justification: string;
      urgency: string;
      expectedDuration: string;
    }): Promise<APIResponse<any>> => {
      return this.request('/api/v1/approvals/workflows', {
        method: 'POST',
        body: JSON.stringify(workflowData),
      });
    },

    /**
     * Submit approval decision
     */
    submitDecision: async (workflowId: string, decision: {
      decision: 'approved' | 'rejected';
      comments: string;
      conditions?: string[];
    }): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/approvals/${workflowId}/decisions`, {
        method: 'POST',
        body: JSON.stringify(decision),
      });
    },

    /**
     * Get approval workflow
     */
    getWorkflow: async (workflowId: string): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/approvals/${workflowId}`);
    },

    /**
     * Get all workflows
     */
    getWorkflows: async (status?: string, limit?: number): Promise<APIResponse<any[]>> => {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (limit) params.append('limit', limit.toString());
      return this.request(`/api/v1/approvals/workflows?${params}`);
    },

    /**
     * Get pending approvals
     */
    getPendingApprovals: async (): Promise<APIResponse<any[]>> => {
      return this.request('/api/v1/approvals/pending');
    },

    /**
     * Cancel workflow
     */
    cancelWorkflow: async (workflowId: string, reason: string): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/approvals/${workflowId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },

    /**
     * Get approval stats
     */
    getStats: async (): Promise<APIResponse<any>> => {
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
    getAll: async (params?: {
      page?: number;
      limit?: number;
      role?: string;
    }): Promise<APIResponse<any[]>> => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.append('page', params.page.toString());
      if (params?.limit) searchParams.append('limit', params.limit.toString());
      if (params?.role) searchParams.append('role', params.role);
      return this.request(`/api/v1/users?${searchParams}`);
    },

    /**
     * Get user by ID
     */
    get: async (userId: string): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/users/${userId}`);
    },

    /**
     * Create user
     */
    create: async (userData: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: string;
      department: string;
      permissions: string[];
    }): Promise<APIResponse<any>> => {
      return this.request('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
    },

    /**
     * Update user
     */
    update: async (userId: string, updates: any): Promise<APIResponse<any>> => {
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
    resetPassword: async (userId: string, passwordData: {
      newPassword: string;
      forcePasswordChange: boolean;
    }): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify(passwordData),
      });
    },

    /**
     * Unlock user
     */
    unlock: async (userId: string, reason: string): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/users/${userId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    },

    /**
     * Bulk user action
     */
    bulkAction: async (actionData: {
      action: string;
      userIds: string[];
      reason: string;
    }): Promise<APIResponse<any>> => {
      return this.request('/api/v1/users/bulk-action', {
        method: 'POST',
        body: JSON.stringify(actionData),
      });
    },

    /**
     * Get user stats
     */
    getStats: async (): Promise<APIResponse<any>> => {
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
    getLogs: async (params?: {
      eventType?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }): Promise<APIResponse<any[]>> => {
      const searchParams = new URLSearchParams();
      if (params?.eventType) searchParams.append('eventType', params.eventType);
      if (params?.startDate) searchParams.append('startDate', params.startDate);
      if (params?.endDate) searchParams.append('endDate', params.endDate);
      if (params?.limit) searchParams.append('limit', params.limit.toString());
      return this.request(`/api/v1/audit/logs?${searchParams}`);
    },

    /**
     * Get audit log by ID
     */
    getLog: async (logId: string): Promise<APIResponse<any>> => {
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
    getModels: async (): Promise<APIResponse<Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
      apiType: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
      provider: string;
      isAvailable: boolean;
    }>>> => {
      return this.request(`${API_ROUTES.LLM}/models`, {
        method: 'GET',
      });
    },

    getModelsFromProvider: async (providerType: string): Promise<APIResponse<Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
    }>>> => {
      return this.request(`${API_ROUTES.LLM}/models/${providerType}`, {
        method: 'GET',
      });
    },

    getProviders: async (): Promise<APIResponse<Array<{
      name: string;
      type: string;
      baseUrl: string;
      isActive: boolean;
      defaultModel?: string;
      modelCount: number;
      status: 'active' | 'inactive' | 'error';
    }>>> => {
      return this.request(`${API_ROUTES.LLM}/providers`, {
        method: 'GET',
      });
    },

    getProviderStats: async (): Promise<APIResponse<Array<{
      name: string;
      type: string;
      available: boolean;
    }>>> => {
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
    getProviders: async (): Promise<APIResponse<Array<{
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
      healthCheckResult?: Record<string, unknown>;
      hasApiKey: boolean;
      createdAt: string;
      updatedAt: string;
    }>>> => {
      return this.request(`${API_ROUTES.USER_LLM}/providers`, {
        method: 'GET',
      });
    },

    createProvider: async (providerData: {
      name: string;
      description?: string;
      type: string;
      baseUrl: string;
      apiKey?: string;
      defaultModel?: string;
      configuration?: Record<string, unknown>;
      priority?: number;
    }): Promise<APIResponse<Record<string, unknown>>> => {
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

    testProvider: async (providerId: string): Promise<APIResponse<{ success: boolean; error?: string; latency?: number }>> => {
      return this.request(`${API_ROUTES.USER_LLM}/providers/${providerId}/test`, {
        method: 'POST',
      });
    },

    deleteProvider: async (providerId: string): Promise<APIResponse<void>> => {
      return this.request(`${API_ROUTES.USER_LLM}/providers/${providerId}`, {
        method: 'DELETE',
      });
    },

    getModels: async (): Promise<APIResponse<Array<{
      id: string;
      name: string;
      description?: string;
      source: string;
      apiEndpoint: string;
      apiType: 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom';
      provider: string;
      isAvailable: boolean;
    }>>> => {
      return this.request(`${API_ROUTES.USER_LLM}/models`, {
        method: 'GET',
      });
    },

    generateResponse: async (request: {
      prompt: string;
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
      model?: string;
      preferredType?: string;
    }): Promise<APIResponse<{ response: string; usage?: Record<string, unknown> }>> => {
      return this.request(`${API_ROUTES.USER_LLM}/generate`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
    },

    generateAgentResponse: async (request: {
      agent: Record<string, unknown>;
      messages: Record<string, unknown>[];
      context?: Record<string, unknown>;
      tools?: Record<string, unknown>[];
    }): Promise<APIResponse<{ response: string; reasoning?: string; usage?: Record<string, unknown> }>> => {
      return this.request(`${API_ROUTES.USER_LLM}/agent-response`, {
        method: 'POST',
        body: JSON.stringify(request),
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