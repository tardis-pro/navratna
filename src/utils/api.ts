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

// Re-export types
export type {
  PersonaAnalytics,
  PersonaValidation,
  AgentCapabilityMetrics
};
import { PersonaAnalytics, PersonaValidation, AgentCapabilityMetrics } from '@/types/uaip-interfaces';

// Base configuration
export interface APIConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  meta: {
    timestamp: Date;
    requestId?: string;
    version?: string;
  };
}

// ============================================================================
// AGENT INTELLIGENCE SERVICE TYPES
// ============================================================================

export interface Agent {
  id: string;
  name: string;
  role: 'assistant' | 'analyzer' | 'orchestrator' | 'specialist';
  persona: {
    name: string;
    description: string;
    capabilities: string[];
    constraints?: Record<string, any>;
    preferences?: Record<string, any>;
  };
  intelligenceConfig: {
    analysisDepth: 'basic' | 'intermediate' | 'advanced';
    contextWindowSize: number;
    decisionThreshold: number;
    learningEnabled: boolean;
    collaborationMode: 'independent' | 'collaborative' | 'supervised';
  };
  securityContext: {
    securityLevel: 'low' | 'medium' | 'high' | 'critical';
    allowedCapabilities: string[];
    restrictedDomains?: string[];
    approvalRequired: boolean;
    auditLevel: 'minimal' | 'standard' | 'comprehensive';
  };
  isActive: boolean;
  createdBy: string;
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentCreate {
  name: string;
  role: 'assistant' | 'analyzer' | 'orchestrator' | 'specialist';
  persona: Agent['persona'];
  intelligenceConfig?: Partial<Agent['intelligenceConfig']>;
  securityContext?: Partial<Agent['securityContext']>;
  isActive?: boolean;
  createdBy: string;
}

export interface AgentUpdate {
  name?: string;
  role?: Agent['role'];
  persona?: Agent['persona'];
  intelligenceConfig?: Partial<Agent['intelligenceConfig']>;
  securityContext?: Partial<Agent['securityContext']>;
  isActive?: boolean;
  lastActiveAt?: Date;
}

export interface AgentAnalysisRequest {
  conversationContext: {
    id: string;
    agentId: string;
    userId: string;
    messages: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      metadata?: Record<string, any>;
      timestamp: Date;
    }>;
    metadata?: Record<string, any>;
    startedAt: Date;
    lastActivityAt: Date;
  };
  userRequest: string;
  constraints?: Record<string, any>;
}

export interface AgentAnalysisResponse {
  analysis: {
    context: {
      messageCount: number;
      participants: string[];
      topics: string[];
      sentiment: string;
      complexity: string;
      urgency: string;
    };
    intent: {
      primary: string;
      secondary: string[];
      confidence: number;
      entities: any[];
      complexity: string;
    };
    agentCapabilities: {
      tools: string[];
      artifacts: string[];
      specializations: string[];
      limitations: string[];
    };
    environmentFactors: {
      timeOfDay: number;
      userLoad: number;
      systemLoad: string;
      availableResources: string;
    };
  };
  recommendedActions: Array<{
    type: string;
    confidence: number;
    description: string;
    estimatedDuration: number;
  }>;
  confidence: number;
  explanation: string;
  timestamp: Date;
}

export interface AgentPlanRequest {
  analysis: AgentAnalysisResponse['analysis'];
  userPreferences?: Record<string, any>;
  securityContext?: Record<string, any>;
}

export interface AgentPlanResponse {
  operationPlan: {
    id: string;
    type: string;
    agentId: string;
    steps: Array<{
      id: string;
      type: string;
      description: string;
      estimatedDuration: number;
      parameters?: Record<string, any>;
      dependencies?: string[];
    }>;
    dependencies: string[];
    estimatedDuration: number;
    metadata: Record<string, any>;
  };
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
// CAPABILITY REGISTRY SERVICE TYPES
// ============================================================================

export interface Capability {
  id: string;
  name: string;
  description: string;
  type: 'tool' | 'artifact' | 'hybrid';
  status: 'active' | 'deprecated' | 'disabled' | 'experimental';
  metadata: {
    version: string;
    author?: string;
    license?: string;
    documentation?: string;
    examples?: Record<string, any>[];
    tags: string[];
    category: string;
    subcategory?: string;
    trustScore: number;
    usageCount: number;
    lastUsed?: Date;
    performance?: {
      averageLatency?: number;
      successRate?: number;
      errorRate?: number;
    };
  };
  toolConfig?: {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    authentication: {
      type: 'none' | 'api_key' | 'oauth' | 'jwt' | 'basic';
      config?: Record<string, any>;
    };
    parameters: Array<{
      name: string;
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      required: boolean;
      description?: string;
      validation?: Record<string, any>;
    }>;
    responseSchema?: Record<string, any>;
    timeout: number;
    retryPolicy?: {
      maxRetries: number;
      backoffStrategy: 'fixed' | 'exponential';
    };
  };
  artifactConfig?: {
    templateEngine: 'handlebars' | 'mustache' | 'jinja2' | 'ejs';
    template: string;
    outputFormat: 'text' | 'json' | 'yaml' | 'xml' | 'html' | 'markdown' | 'code';
    variables: Array<{
      name: string;
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      required: boolean;
      description?: string;
      defaultValue?: any;
    }>;
    validationRules?: Array<{
      field: string;
      rule: string;
      message: string;
    }>;
    postProcessing?: Array<{
      type: 'format' | 'validate' | 'transform';
      config: Record<string, any>;
    }>;
  };
  dependencies?: string[];
  securityRequirements: {
    minimumSecurityLevel: 'low' | 'medium' | 'high' | 'critical';
    requiredPermissions: string[];
    sensitiveData: boolean;
    auditRequired: boolean;
  };
  resourceRequirements?: {
    cpu?: number;
    memory?: number;
    storage?: number;
    network: boolean;
    estimatedDuration?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CapabilitySearchRequest {
  query?: string;
  type?: 'tool' | 'artifact' | 'hybrid';
  category?: string;
  tags?: string[];
  securityLevel?: 'low' | 'medium' | 'high' | 'critical';
  includeDeprecated?: boolean;
  sortBy?: 'relevance' | 'name' | 'usage_count' | 'trust_score' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface CapabilitySearchResponse {
  capabilities: Capability[];
  totalCount: number;
  recommendations: string[];
  searchTime: number;
}

export interface CapabilityRecommendation {
  capability: Capability;
  relevanceScore: number;
  reasoning: string;
  alternatives?: string[];
  usageExamples?: Record<string, any>[];
}

// ============================================================================
// ORCHESTRATION PIPELINE SERVICE TYPES
// ============================================================================

export interface Operation {
  id: string;
  type: 'tool_execution' | 'artifact_generation' | 'hybrid_workflow' | 'analysis';
  agentId: string;
  userId: string;
  name: string;
  description: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'suspended' | 'paused' | 'compensating';
  context: {
    executionContext: {
      agentId: string;
      userId: string;
      conversationId?: string;
      sessionId?: string;
      environment: 'development' | 'staging' | 'production';
      metadata?: Record<string, any>;
      timeout: number;
      resourceLimits: {
        maxMemory: number;
        maxCpu: number;
        maxDuration: number;
      };
    };
  };
  executionPlan: {
    id: string;
    type: string;
    agentId: string;
    steps: Array<{
      id: string;
      type: string;
      description: string;
      estimatedDuration: number;
      parameters?: Record<string, any>;
      dependencies?: string[];
    }>;
    dependencies: string[];
    estimatedDuration: number;
    metadata: Record<string, any>;
  };
  metadata: {
    priority: 'low' | 'medium' | 'high' | 'urgent';
    tags: string[];
    estimatedDuration: number;
    resourceRequirements: {
      cpu?: number;
      memory?: number;
      storage?: number;
      network: boolean;
      gpu: boolean;
      estimatedDuration?: number;
    };
  };
  estimatedDuration: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperationStatusResponse {
  operation: Operation;
  status: Operation['status'];
  progress: {
    currentStep?: string;
    completedSteps: number;
    totalSteps: number;
    percentage: number;
  };
  metrics: {
    startTime: Date;
    endTime?: Date;
    duration?: number;
    resourceUsage: {
      cpu: number;
      memory: number;
      storage: number;
    };
    stepMetrics: Array<{
      stepId: string;
      startTime: Date;
      endTime?: Date;
      duration?: number;
      status: string;
      retryCount: number;
    }>;
  };
  errors: Array<{
    stepId?: string;
    errorType: string;
    message: string;
    timestamp: Date;
    retryable: boolean;
    context?: Record<string, any>;
  }>;
}

export interface ExecuteOperationRequest {
  operation: Omit<Operation, 'id' | 'status' | 'createdAt' | 'updatedAt'>;
  options?: {
    priority?: 'low' | 'normal' | 'high' | 'critical';
    async?: boolean;
    webhookUrl?: string;
    tags?: string[];
  };
}

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
      ...this.config.headers,
      ...processedOptions.headers,
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
    create: async (personaData: any): Promise<APIResponse<any>> => {
      return this.request(buildAPIURL(API_ROUTES.PERSONAS), {
        method: 'POST',
        body: JSON.stringify(personaData),
      });
    },

    /**
     * Search personas
     */
    search: async (query?: string, expertise?: string): Promise<APIResponse<any[]>> => {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (expertise) params.append('expertise', expertise);
      params.append('offset', '0');
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/search?${params}`));
    },

    /**
     * Get persona recommendations
     */
    getRecommendations: async (context: string): Promise<APIResponse<any[]>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/recommendations?context=${encodeURIComponent(context)}`));
    },

    /**
     * Get persona templates
     */
    getTemplates: async (): Promise<APIResponse<any[]>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/templates`));
    },

    /**
     * Get persona by ID
     */
    get: async (personaId: string): Promise<APIResponse<any>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/${personaId}`));
    },

    /**
     * Update persona
     */
    update: async (personaId: string, updates: any): Promise<APIResponse<any>> => {
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
    getAnalytics: async (personaId: string): Promise<APIResponse<any>> => {
      return this.request(buildAPIURL(`${API_ROUTES.PERSONAS}/${personaId}/analytics`));
    },

    /**
     * Validate persona
     */
    validatePersona: async (personaId: string, validationData: any): Promise<APIResponse<any>> => {
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
    create: async (discussionData: {
      title: string;
      description: string;
      topic: string;
      turnStrategy?: TurnStrategyConfig;
      createdBy: string;
      initialParticipants: Array<{ 
        personaId: string;
        agentId: string;
        role: string; 
      }>;
      settings?: any;
    }): Promise<APIResponse<any>> => {
      return this.request('/api/v1/discussions', {
        method: 'POST',
        body: JSON.stringify(discussionData),
      });
    },

    /**
     * Search discussions
     */
    search: async (query?: string, status?: string): Promise<APIResponse<any[]>> => {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (status) params.append('status', status);
      return this.request(`/api/v1/discussions/search?${params}`);
    },

    /**
     * Get discussion
     */
    get: async (discussionId: string): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/discussions/${discussionId}`);
    },

    /**
     * Update discussion
     */
    update: async (discussionId: string, updates: any): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/discussions/${discussionId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Start discussion
     */
    start: async (discussionId: string): Promise<APIResponse<any>> => {
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
    }): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/discussions/${discussionId}/end`, {
        method: 'POST',
        body: JSON.stringify(endData),
      });
    },

    /**
     * Add participant
     */
    addParticipant: async (discussionId: string, participantData: {
      personaId: string;
      role: string;
    }): Promise<APIResponse<any>> => {
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
    sendMessage: async (discussionId: string, participantId: string, messageData: {
      content: string;
      messageType: string;
      metadata?: any;
    }): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/discussions/${discussionId}/participants/${participantId}/messages`, {
        method: 'POST',
        body: JSON.stringify(messageData),
      });
    },

    /**
     * Get messages
     */
    getMessages: async (discussionId: string, limit = 50, offset = 0): Promise<APIResponse<any[]>> => {
      return this.request(`/api/v1/discussions/${discussionId}/messages?limit=${limit}&offset=${offset}`);
    },

    /**
     * Advance turn
     */
    advanceTurn: async (discussionId: string, turnData: {
      force: boolean;
      reason: string;
    }): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/discussions/${discussionId}/advance-turn`, {
        method: 'POST',
        body: JSON.stringify(turnData),
      });
    },

    /**
     * Get discussion analytics
     */
    getAnalytics: async (discussionId: string): Promise<APIResponse<any>> => {
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
    getPolicies: async (category?: string): Promise<APIResponse<any[]>> => {
      const params = category ? `?category=${encodeURIComponent(category)}` : '';
      return this.request(`/api/v1/security/policies${params}`);
    },

    /**
     * Get policy by ID
     */
    getPolicy: async (policyId: string): Promise<APIResponse<any>> => {
      return this.request(`/api/v1/security/policies/${policyId}`);
    },

    /**
     * Create policy
     */
    createPolicy: async (policyData: any): Promise<APIResponse<any>> => {
      return this.request('/api/v1/security/policies', {
        method: 'POST',
        body: JSON.stringify(policyData),
      });
    },

    /**
     * Update policy
     */
    updatePolicy: async (policyId: string, updates: any): Promise<APIResponse<any>> => {
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
    getStats: async (): Promise<APIResponse<any>> => {
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
    getStats: async (period?: string): Promise<APIResponse<any>> => {
      const params = period ? `?period=${encodeURIComponent(period)}` : '';
      return this.request(`/api/v1/audit/stats${params}`);
    },

    /**
     * Export audit logs
     */
    exportLogs: async (exportData: {
      format: string;
      filters: any;
      includeDetails: boolean;
    }): Promise<APIResponse<any>> => {
      return this.request('/api/v1/audit/export', {
        method: 'POST',
        body: JSON.stringify(exportData),
      });
    },

    /**
     * Generate compliance report
     */
    generateComplianceReport: async (reportData: {
      reportType: string;
      period: { startDate: string; endDate: string };
      includeMetrics: boolean;
      includeRecommendations: boolean;
      format: string;
    }): Promise<APIResponse<any>> => {
      return this.request('/api/v1/audit/compliance-report', {
        method: 'POST',
        body: JSON.stringify(reportData),
      });
    },

    /**
     * Get user activity
     */
    getUserActivity: async (userId: string, startDate?: string, endDate?: string): Promise<APIResponse<any[]>> => {
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
    }): Promise<APIResponse<any>> => {
      return this.request('/api/v1/audit/cleanup', {
        method: 'DELETE',
        body: JSON.stringify(cleanupData),
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