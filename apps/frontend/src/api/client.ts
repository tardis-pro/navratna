/**
 * Base API Client
 * Provides core HTTP client functionality with authentication, CSRF protection, and error handling
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { csrfService } from '@/services/CSRFService';
import { buildAPIURL } from '@/config/apiConfig';

export interface APIError {
  message: string;
  code?: string;
  details?: any;
  statusCode?: number;
}

export class APIClientError extends Error {
  public code?: string;
  public details?: any;
  public statusCode?: number;

  constructor(message: string, code?: string, details?: any, statusCode?: number) {
    super(message);
    this.name = 'APIClientError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}

class APIClientClass {
  private client: AxiosInstance;
  private authToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: buildAPIURL(''),
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // Add auth token
        if (this.authToken) {
          config.headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        // Add CSRF token for state-changing requests
        if (['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase() || '')) {
          try {
            const csrfToken = await csrfService.getToken();
            if (csrfToken) {
              config.headers['X-CSRF-Token'] = csrfToken;
            }
          } catch (error) {
            console.warn('Failed to get CSRF token:', error);
          }
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        // Handle 401 Unauthorized
        if (error.response?.status === 401) {
          this.clearAuthToken();
          // Emit auth error event
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }

        // Handle 403 CSRF token errors
        if (error.response?.status === 403 && error.response?.data?.['error']?.includes('CSRF')) {
          // Refresh CSRF token and retry
          await csrfService.refreshToken();
          return this.client.request(error.config!);
        }

        // Extract error details
        const apiError = this.extractErrorDetails(error);
        throw new APIClientError(
          apiError.message,
          apiError.code,
          apiError.details,
          error.response?.status
        );
      }
    );
  }

  private extractErrorDetails(error: AxiosError): APIError {
    if (error.response?.data) {
      const data = error.response.data as any;
      return {
        message: data.message || data.error || 'An error occurred',
        code: data.code || data.errorCode,
        details: data.details || data.errors,
        statusCode: error.response.status,
      };
    }

    if (error.request) {
      return {
        message: 'Network error - please check your connection',
        code: 'NETWORK_ERROR',
      };
    }

    return {
      message: error.message || 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    };
  }

  public setAuthToken(token: string | null): void {
    this.authToken = token;
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
  }

  public clearAuthToken(): void {
    this.setAuthToken(null);
  }

  public getAuthToken(): string | null {
    if (!this.authToken) {
      // Check both authToken and accessToken for backwards compatibility
      this.authToken = localStorage.getItem('authToken') || 
                      localStorage.getItem('accessToken') || 
                      sessionStorage.getItem('accessToken');
    }
    return this.authToken;
  }

  private transformResponse<T>(responseData: any): T {
    // If response has the nested format { success: true, data: ... }, unwrap it
    if (responseData && typeof responseData === 'object' && 
        'success' in responseData && 'data' in responseData && 
        responseData.success === true) {
      return responseData.data as T;
    }
    
    // Otherwise return the response as-is
    return responseData as T;
  }

  public async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return this.transformResponse<T>(response.data);
  }

  public async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return this.transformResponse<T>(response.data);
  }

  public async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return this.transformResponse<T>(response.data);
  }

  public async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return this.transformResponse<T>(response.data);
  }

  public async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return this.transformResponse<T>(response.data);
  }

  public async request<T = any>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.client.request<T>(config);
    return this.transformResponse<T>(response.data);
  }

  public getAxiosInstance(): AxiosInstance {
    return this.client;
  }
}

// Export singleton instance
export const APIClient = new APIClientClass();