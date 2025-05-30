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

// Environment detection
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;
const envConfig = getEnvironmentConfig();

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

// Enhanced API wrapper with error handling and fallbacks
export const uaipAPI = {
  get client() {
    return getAPIClient();
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
      routes: API_ROUTES
    };
  },
  
  // Force refresh backend availability
  async refreshBackendStatus(): Promise<boolean> {
    backendAvailable = null;
    return await checkBackendHealth();
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