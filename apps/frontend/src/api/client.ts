/**
 * Base API Client
 * Provides core HTTP client functionality with authentication, CSRF protection, and error handling
 */

import axios, { AxiosInstance, AxiosRequestConfig, _AxiosResponse, AxiosError } from 'axios';
import { csrfService } from '@/services/CSRFService';
import { buildAPIURL } from '@/config/apiConfig';

export interface APIError {
  message: string;
  code?: string;
  details?: unknown;
  statusCode?: number;
}

export class APIClientError extends Error {
  public code?: string;
  public details?: unknown;
  public statusCode?: number;

  constructor(message: string, code?: string, details?: unknown, statusCode?: number) {
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
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      async (config) => {
        if (this.authToken) {
          config.headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        if (config.data instanceof FormData) {
          delete config.headers['Content-Type'];
        }

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

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.clearAuthToken();
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }

        if (error.response?.status === 403 && error.response?.data?.['error']?.includes('CSRF')) {
          await csrfService.refreshToken();
          return this.client.request(error.config!);
        }

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
      const data = error.response.data as unknown;
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
  }

  public clearAuthToken(): void {
    this.authToken = null;
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  private transformResponse<T>(responseData: unknown): T {
    // If response has the nested format { success: true, data: ... }, unwrap it
    if (
      responseData &&
      typeof responseData === 'object' &&
      'success' in responseData &&
      'data' in responseData &&
      responseData.success === true
    ) {
      return responseData.data as T;
    }

    // Otherwise return the response as-is
    return responseData as T;
  }

  public async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return this.transformResponse<T>(response.data);
  }

  public async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return this.transformResponse<T>(response.data);
  }

  public async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return this.transformResponse<T>(response.data);
  }

  public async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return this.transformResponse<T>(response.data);
  }

  public async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return this.transformResponse<T>(response.data);
  }

  public async request<T = unknown>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.client.request<T>(config);
    return this.transformResponse<T>(response.data);
  }

  public getAxiosInstance(): AxiosInstance {
    return this.client;
  }
}

// Export singleton instance
export const APIClient = new APIClientClass();
