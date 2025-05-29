/**
 * UAIP Frontend API Service
 * 
 * This service provides a clean interface between the frontend components
 * and the UAIP backend services. It handles API calls, error handling,
 * and data transformation for the frontend.
 */

// Import the backend API client
export * from '../../backend/api';
import { UAIPAPIClient, createAPIClient, APIConfig } from '../../backend/api';

// Create singleton API client instance
let apiClient: UAIPAPIClient | null = null;

export function getAPIClient(): UAIPAPIClient {
  if (!apiClient) {
    const config: APIConfig = {
      baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    apiClient = createAPIClient(config);
  }
  return apiClient;
}

// Re-export for convenience
export const uaipAPI = {
  get client() {
    return getAPIClient();
  }
};

export default uaipAPI; 