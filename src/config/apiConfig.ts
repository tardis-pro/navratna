/**
 * API Configuration for Frontend
 * 
 * This file centralizes all API endpoint configurations and handles
 * environment-specific settings for development and production.
 */

// Environment detection
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

/**
 * API Base URL Configuration
 * 
 * In development:
 * - Uses empty string to leverage Vite proxy (recommended)
 * - Falls back to API Gateway URL if proxy is disabled
 * 
 * In production:
 * - Uses the current origin or specified production URL
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
  (isDevelopment ? '' : window.location.origin);

/**
 * API Gateway Configuration
 */
export const API_GATEWAY_CONFIG = {
  // Development API Gateway URL (when not using proxy)
  DEV_GATEWAY_URL: 'http://localhost:8081',

  // Production API Gateway URL (defaults to current origin)
  PROD_GATEWAY_URL: window.location.origin,

  // API version prefix
  API_VERSION: '/api/v1',
};

/**
 * Service Route Configuration
 * 
 * These are the routes as defined in nginx.conf
 * All routes go through the API Gateway in both development and production
 */
export const API_ROUTES = {
  // Agent Intelligence Service routes
  AGENTS: '/api/v1/agents',

  // Orchestration Pipeline Service routes
  OPERATIONS: '/api/v1/operations',

  // Capability Registry Service routes
  CAPABILITIES: '/api/v1/capabilities',

  // Persona Management Service routes
  PERSONAS: '/api/v1/personas',

  // Health check route
  HEALTH: '/health',
} as const;

/**
 * Direct Service URLs (for development debugging only)
 * These should NOT be used in normal operation
 */
export const DIRECT_SERVICE_URLS = {
  AGENT_INTELLIGENCE: 'http://localhost:3001',
  ORCHESTRATION_PIPELINE: 'http://localhost:3002',
  CAPABILITY_REGISTRY: 'http://localhost:3003',
  DISCUSSION_ORCHESTRATION: 'http://localhost:3005',
  SECURITY_AUDITING: 'http://localhost:3004',
} as const;

/**
 * API Configuration Object
 */
export const API_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: isDevelopment ? 10000 : 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Version': '1.0.0',
    'X-Environment': isDevelopment ? 'development' : 'production'
  }
};

/**
 * Development Configuration
 */
export const DEV_CONFIG = {
  // Health check interval
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds

  // Enable debug logging
  DEBUG_LOGGING: true,

  // Use proxy by default in development
  USE_PROXY: false,
};

/**
 * Production Configuration
 */
export const PROD_CONFIG = {
  // Health check interval
  HEALTH_CHECK_INTERVAL: 60000, // 60 seconds

  // Disable debug logging
  DEBUG_LOGGING: false,

  // Always use API Gateway in production
  USE_PROXY: false,
};

/**
 * Get environment-specific configuration
 */
export const getEnvironmentConfig = () => {
  return isDevelopment ? DEV_CONFIG : PROD_CONFIG;
};

/**
 * Utility function to check if proxy is enabled
 */
export const isProxyEnabled = () => {
  const envConfig = getEnvironmentConfig();
  return envConfig.USE_PROXY && API_BASE_URL === '';
};

/**
 * Get the effective API base URL
 */
export const getEffectiveAPIBaseURL = () => {
  if (isProxyEnabled()) {
    return ''; // Use Vite proxy
  }
  console.log('isDevelopment', isDevelopment);
  console.log('API_GATEWAY_CONFIG.DEV_GATEWAY_URL', API_GATEWAY_CONFIG.DEV_GATEWAY_URL);
  console.log('API_BASE_URL', API_BASE_URL);
  console.log('API_GATEWAY_CONFIG.PROD_GATEWAY_URL', API_GATEWAY_CONFIG.PROD_GATEWAY_URL);
  if (isDevelopment) {
    return API_GATEWAY_CONFIG.DEV_GATEWAY_URL;
  }

  return API_BASE_URL || API_GATEWAY_CONFIG.PROD_GATEWAY_URL;
};

/**
 * Build a complete API URL
 */
export const buildAPIURL = (route: string) => {
  const baseURL = getEffectiveAPIBaseURL();

  // Remove leading slash from route if baseURL is empty (proxy mode)
  if (baseURL === '' && route.startsWith('/')) {
    return route;
  }

  // Ensure proper URL construction
  const cleanBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
  const cleanRoute = route.startsWith('/') ? route : `/${route}`;

  return `${cleanBaseURL}${cleanRoute}`;
};

/**
 * Get service-specific URL for direct access (development debugging only)
 */
export const getDirectServiceURL = (service: keyof typeof DIRECT_SERVICE_URLS, route: string) => {
  if (!isDevelopment) {
    throw new Error('Direct service URLs are only available in development');
  }

  const serviceURL = DIRECT_SERVICE_URLS[service];
  const cleanRoute = route.startsWith('/') ? route : `/${route}`;

  return `${serviceURL}${cleanRoute}`;
}; 