/**
 * API Configuration for Frontend - PRODUCTION READY
 * 
 * This file centralizes all API endpoint configurations for production deployment.
 * All requests go directly to the API Gateway without proxy fallbacks.
 */

// Environment detection
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

/**
 * API Base URL Configuration - PRODUCTION READY
 * 
 * Uses environment variable or dynamically detects current origin
 */
export const API_BASE_URL = import.meta.env.API_BASE_URL || 'http://localhost:8081';


/**
 * API Gateway Configuration
 */
export const API_GATEWAY_CONFIG = {
  // API Gateway URL (production-ready)
  GATEWAY_URL: API_BASE_URL,

  // API version prefix
  API_VERSION: '/api/v1',
};

/**
 * Service Route Configuration
 * 
 * These are the routes as defined in nginx.conf
 * All routes go through the API Gateway
 */
export const API_ROUTES = {
  // Health check route
  HEALTH: '/health',

  // Agent Intelligence Service routes
  AGENTS: {
    BASE: '/api/v1/agents',
    LIST: '/api/v1/agents',
    GET: '/api/v1/agents',
    CREATE: '/api/v1/agents',
    UPDATE: '/api/v1/agents',
    DELETE: '/api/v1/agents',
    ANALYZE: '/api/v1/agents',
    PLAN: '/api/v1/agents',
    CAPABILITIES: '/api/v1/agents',
    LEARN: '/api/v1/agents',
    PARTICIPATE: '/api/v1/agents',
    CHAT: '/api/v1/agents',
    HEALTH: '/api/v1/agents'
  },

  // Orchestration Pipeline Service routes
  OPERATIONS: '/api/v1/operations',

  // Capability Registry Service routes
  CAPABILITIES: '/api/v1/capabilities',

  // Tools routes (from capability registry service)
  TOOLS: {
    BASE: '/api/v1/tools',
    LIST: '/api/v1/tools',
    GET: '/api/v1/tools',
    REGISTER: '/api/v1/tools',
    EXECUTE: '/api/v1/tools',
    CATEGORIES: '/api/v1/tools/categories',
    RECOMMENDATIONS: '/api/v1/tools/recommendations',
    RELATIONS: '/api/v1/tools/relations',
    ANALYTICS: '/api/v1/tools/analytics'
  },

  // Persona Management Service routes
  PERSONAS: {
    BASE: '/api/v1/personas',
    LIST: '/api/v1/personas',
    GET: '/api/v1/personas',
    CREATE: '/api/v1/personas',
    UPDATE: '/api/v1/personas',
    DELETE: '/api/v1/personas',
    SEARCH: '/api/v1/personas/search',
    RECOMMENDATIONS: '/api/v1/personas/recommendations',
    TEMPLATES: '/api/v1/personas/templates',
    ANALYTICS: '/api/v1/personas',
    VALIDATE: '/api/v1/personas/validate'
  },

  // Security Gateway Service routes
  SECURITY: '/api/v1/security',

  // Approval Workflow Service routes
  APPROVALS: {
    BASE: '/api/v1/approvals',
    LIST: '/api/v1/approvals',
    GET: '/api/v1/approvals',
    CREATE: '/api/v1/approvals',
    SUBMIT_DECISION: '/api/v1/approvals',
    PENDING: '/api/v1/approvals/pending',
    MY_PENDING: '/api/v1/approvals/my-pending',
    MY_REQUESTS: '/api/v1/approvals/my-requests',
    CANCEL: '/api/v1/approvals',
    STATS: '/api/v1/approvals/stats',
    HISTORY: '/api/v1/approvals/history',
    BULK_APPROVE: '/api/v1/approvals/bulk-approve',
    BULK_REJECT: '/api/v1/approvals/bulk-reject',
    EXPORT: '/api/v1/approvals/export'
  },

  // Discussion Orchestration Service routes
  DISCUSSIONS: {
    BASE: '/api/v1/discussions',
    LIST: '/api/v1/discussions',
    GET: '/api/v1/discussions',
    CREATE: '/api/v1/discussions',
    UPDATE: '/api/v1/discussions',
    DELETE: '/api/v1/discussions',
    START: '/api/v1/discussions',
    PAUSE: '/api/v1/discussions',
    RESUME: '/api/v1/discussions',
    END: '/api/v1/discussions',
    COMPLETE: '/api/v1/discussions',
    SEARCH: '/api/v1/discussions/search',
    ADD_PARTICIPANT: '/api/v1/discussions',
    REMOVE_PARTICIPANT: '/api/v1/discussions',
    SEND_MESSAGE: '/api/v1/discussions',
    MESSAGES: '/api/v1/discussions',
    MANAGE_TURN: '/api/v1/discussions',
    ANALYTICS: '/api/v1/discussions'
  },

  // LLM Service routes
  LLM: {
    BASE: '/api/v1/llm',
    LIST_MODELS: '/api/v1/llm/models',
    GET_MODEL: '/api/v1/llm/models',
    LIST_PROVIDERS: '/api/v1/llm/providers',
    GET_PROVIDER: '/api/v1/llm/providers',
    GENERATE: '/api/v1/llm/generate',
    ANALYZE_CONTEXT: '/api/v1/llm/analyze'
  },
  USER_LLM: {
    BASE: '/api/v1/llm',
    LIST_PROVIDERS: '/api/v1/llm/my-providers',
    GET_PROVIDER: '/api/v1/llm/my-providers',
    CREATE_PROVIDER: '/api/v1/llm/my-providers',
    UPDATE_PROVIDER: '/api/v1/llm/my-providers',
    DELETE_PROVIDER: '/api/v1/llm/my-providers',
    TEST_PROVIDER: '/api/v1/llm/my-providers',
    SET_DEFAULT: '/api/v1/llm/my-providers',
    GENERATE: '/api/v1/llm/generate',
    LIST_MODELS: '/api/v1/llm/my-providers/models'
  },

  // Knowledge Graph Service routes
  KNOWLEDGE: {
    BASE: '/api/v1/knowledge',
    UPLOAD: '/api/v1/knowledge',
    SEARCH: '/api/v1/knowledge/search',
    GET: '/api/v1/knowledge',
    UPDATE: '/api/v1/knowledge',
    DELETE: '/api/v1/knowledge',
    STATS: '/api/v1/knowledge/stats',
    RELATIONS: '/api/v1/knowledge',
    GRAPH: '/api/v1/knowledge/graph',
    CATEGORIES: '/api/v1/knowledge/categories',
    TAGS: '/api/v1/knowledge/tags',
    EXPORT: '/api/v1/knowledge/export',
    IMPORT: '/api/v1/knowledge/import',
    REINDEX: '/api/v1/knowledge/reindex',
    // Chat ingestion endpoints
    CHAT_IMPORT: '/api/v1/knowledge/chat-import',
    CHAT_JOBS: '/api/v1/knowledge/chat-jobs',
    GENERATE_QA: '/api/v1/knowledge/generate-qa',
    EXTRACT_WORKFLOWS: '/api/v1/knowledge/extract-workflows',
    EXPERTISE: '/api/v1/knowledge/expertise',
    LEARNING_INSIGHTS: '/api/v1/knowledge/learning-insights'
  },

  // Project Management Service routes
  PROJECTS: {
    BASE: '/api/v1/projects',
    LIST: '/api/v1/projects',
    GET: '/api/v1/projects',
    CREATE: '/api/v1/projects',
    UPDATE: '/api/v1/projects',
    DELETE: '/api/v1/projects',
    METRICS: '/api/v1/projects',
    ANALYTICS: '/api/v1/projects/analytics',
    // Task management
    TASKS: '/api/v1/projects',
    CREATE_TASK: '/api/v1/projects',
    UPDATE_TASK: '/api/v1/projects',
    DELETE_TASK: '/api/v1/projects',
    // Agent management
    AGENTS: '/api/v1/projects',
    ADD_AGENT: '/api/v1/projects',
    REMOVE_AGENT: '/api/v1/projects',
    UPDATE_AGENT: '/api/v1/projects',
    // Tool usage
    TOOL_USAGE: '/api/v1/projects',
    RECORD_USAGE: '/api/v1/projects'
  },

  // System metrics and monitoring
  SYSTEM: '/api/v1/system',

  // Authentication routes
  AUTH: {
    BASE: '/api/v1/auth',
    LOGIN: '/api/v1/auth/login',
    LOGOUT: '/api/v1/auth/logout',
    REFRESH: '/api/v1/auth/refresh',
    ME: '/api/v1/auth/me',
    REGISTER: '/api/v1/auth/register',
    RESET_PASSWORD: '/api/v1/auth/forgot-password',
    RESET_PASSWORD_CONFIRM: '/api/v1/auth/reset-password',
    CHANGE_PASSWORD: '/api/v1/auth/change-password',
    VALIDATE_TOKEN: '/api/v1/auth/validate-token'
  },
} as const;

/**
 * API Configuration Object - PRODUCTION READY
 */
export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  baseURL: API_BASE_URL,
  timeout: isProduction ? 30000 : 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Version': '1.0.0',
    'X-Environment': isDevelopment ? 'development' : 'production'
  },
  API_ROUTES
};

/**
 * Production Configuration
 */
export const PROD_CONFIG = {
  // Health check interval
  HEALTH_CHECK_INTERVAL: 60000, // 60 seconds

  // Disable debug logging in production
  DEBUG_LOGGING: false,
};

/**
 * Development Configuration
 */
export const DEV_CONFIG = {
  // Health check interval
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds

  // Enable debug logging in development
  DEBUG_LOGGING: true,
};

/**
 * Get environment-specific configuration
 */
export const getEnvironmentConfig = () => {
  return isDevelopment ? DEV_CONFIG : PROD_CONFIG;
};

/**
 * Get the effective API base URL - PRODUCTION READY
 */
export const getEffectiveAPIBaseURL = () => {
  return API_BASE_URL;
};

/**
 * Build a complete API URL - PRODUCTION READY
 */
export const buildAPIURL = (route: string) => {
  const baseURL = getEffectiveAPIBaseURL();

  // Ensure proper URL construction
  const cleanBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
  const cleanRoute = route.startsWith('/') ? route : `/${route}`;

  return `${cleanBaseURL}${cleanRoute}`;
};

/**
 * Socket.IO URL Configuration - PRODUCTION READY
 * Socket.IO client should connect to HTTP URL, not WebSocket URL
 */
export const getWebSocketURL = () => {
  const baseURL = getEffectiveAPIBaseURL();
  // Socket.IO client expects HTTP/HTTPS URL, not WS/WSS
  // The nginx configuration routes /socket.io/ to discussion-orchestration service
  return baseURL; // Returns http://localhost:8081
}; 