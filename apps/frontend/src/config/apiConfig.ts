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
 * Uses environment variable or defaults to API Gateway URL
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081';

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
  AGENTS: '/api/v1/agents',

  // Orchestration Pipeline Service routes
  OPERATIONS: '/api/v1/operations',

  // Capability Registry Service routes
  CAPABILITIES: '/api/v1/capabilities',
  
  // Tools routes (from capability registry service)
  TOOLS: '/api/v1/tools',

  // Persona Management Service routes
  PERSONAS: '/api/v1/personas',

  // Security Gateway Service routes
  SECURITY: '/api/v1/security',

  // Approval Workflow Service routes
  APPROVALS: '/api/v1/approvals',

  // Discussion Orchestration Service routes
  DISCUSSIONS: '/api/v1/discussions',

  // LLM Service routes
  LLM: '/api/v1/llm',
  USER_LLM: '/api/v1/user/llm',
  
  // Knowledge Graph Service routes
  KNOWLEDGE: '/api/v1/knowledge',
  
  // System metrics and monitoring
  SYSTEM: '/api/v1/system',

  // Authentication routes
  AUTH: '/api/v1/auth',
} as const;

/**
 * API Configuration Object - PRODUCTION READY
 */
export const API_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: isProduction ? 30000 : 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Version': '1.0.0',
    'X-Environment': isDevelopment ? 'development' : 'production'
  }
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
 * WebSocket URL Configuration - PRODUCTION READY
 */
export const getWebSocketURL = () => {
  const baseURL = getEffectiveAPIBaseURL();
  const wsURL = baseURL.replace('http', 'ws');
  return `${wsURL}/ws`;
}; 