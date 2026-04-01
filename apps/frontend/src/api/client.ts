import { csrfService } from '@/services/c_s_r_f_service';
import { buildAPIURL } from '@/config/api_config';
import type { APIError } from '@uaip/types';

export type { APIError };

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

type APIRequestConfig = Omit<RequestInit, 'body' | 'headers' | 'method'> & {
  data?: unknown;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: Record<string, unknown>;
  responseType?: 'blob' | 'json' | 'text';
  timeout?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function appendQueryParams(url: URL, params?: Record<string, unknown>): void {
  if (!params) {
    return;
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }

    if (value instanceof Date) {
      url.searchParams.append(key, value.toISOString());
      continue;
    }

    url.searchParams.append(key, String(value));
  }
}

async function parseResponseBody(response: Response, responseType: 'blob' | 'json' | 'text') {
  if (responseType === 'blob') {
    return await response.blob();
  }

  if (responseType === 'text') {
    return await response.text();
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    return text.length > 0 ? text : null;
  }

  return await response.json();
}

class APIClientClass {
  private async createRequestInit(config?: APIRequestConfig): Promise<RequestInit> {
    const method = config?.method ?? 'GET';
    const headers = new Headers(config?.headers);
    const body = config?.data;

    if (!(body instanceof FormData) && body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      try {
        const csrfToken = await csrfService.getToken();
        if (csrfToken) {
          headers.set('X-CSRF-Token', csrfToken);
        }
      } catch {
      }
    }

    const resolvedBody: BodyInit | null | undefined =
      body instanceof FormData || typeof body === 'string' || body === undefined
        ? body
        : JSON.stringify(body);

    return {
      ...config,
      method,
      headers,
      body: resolvedBody,
      credentials: 'include',
    };
  }

  private extractErrorDetails(statusCode: number, responseData: unknown): APIError {
    if (isRecord(responseData)) {
      const message = Reflect.get(responseData, 'message');
      const error = Reflect.get(responseData, 'error');
      const code = Reflect.get(responseData, 'code');
      const errorCode = Reflect.get(responseData, 'errorCode');

      return {
        message:
          (typeof message === 'string' && message) ||
          (typeof error === 'string' && error) ||
          'An error occurred',
        code:
          (typeof code === 'string' && code) ||
          (typeof errorCode === 'string' && errorCode) ||
          undefined,
        details: Reflect.get(responseData, 'details') ?? Reflect.get(responseData, 'errors'),
      };
    }

    return {
      message: statusCode >= 500 ? 'Server error' : 'Request failed',
      code: 'UNKNOWN_ERROR',
    };
  }

  private transformResponse<T>(responseData: unknown): T {
    if (
      isRecord(responseData) &&
      responseData.success === true &&
      'data' in responseData
    ) {
      return responseData.data as T;
    }

    return responseData as T;
  }

  private async performRequest<T>(url: string, config?: APIRequestConfig): Promise<T> {
    const resolvedUrl = new URL(buildAPIURL(url));
    appendQueryParams(resolvedUrl, config?.params);

    const responseType = config?.responseType ?? 'json';
    const timeout = config?.timeout ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const requestInit = await this.createRequestInit({ ...config, signal: controller.signal });
      const response = await fetch(resolvedUrl, requestInit);
      const responseData = await parseResponseBody(response, responseType);

      if (response.status === 401) {
        this.clearAuthToken();
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
        window.dispatchEvent(new CustomEvent('api:rate-limited', { detail: { retryAfter } }));
      }

      if (!response.ok) {
        const errorMessage = isRecord(responseData) ? Reflect.get(responseData, 'error') : undefined;
        if (
          response.status === 403 &&
          typeof errorMessage === 'string' &&
          errorMessage.includes('CSRF')
        ) {
          await csrfService.refreshToken();
          return await this.performRequest<T>(url, config);
        }

        const apiError = this.extractErrorDetails(response.status, responseData);
        throw new APIClientError(apiError.message, apiError.code, apiError.details, response.status);
      }

      if (responseType === 'blob') {
        return responseData as T;
      }

      return this.transformResponse<T>(responseData);
    } catch (error) {
      if (error instanceof APIClientError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIClientError('Request timed out', 'TIMEOUT_ERROR');
      }

      throw new APIClientError(
        error instanceof Error ? error.message : 'Network error - please check your connection',
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public setAuthToken(_token: string | null): void {}

  public clearAuthToken(): void {}

  public getAuthToken(): string | null {
    return null;
  }

  public async get<T = unknown>(url: string, config?: APIRequestConfig): Promise<T> {
    return await this.performRequest<T>(url, { ...config, method: 'GET' });
  }

  public async post<T = unknown>(url: string, data?: unknown, config?: APIRequestConfig): Promise<T> {
    return await this.performRequest<T>(url, { ...config, data, method: 'POST' });
  }

  public async put<T = unknown>(url: string, data?: unknown, config?: APIRequestConfig): Promise<T> {
    return await this.performRequest<T>(url, { ...config, data, method: 'PUT' });
  }

  public async patch<T = unknown>(url: string, data?: unknown, config?: APIRequestConfig): Promise<T> {
    return await this.performRequest<T>(url, { ...config, data, method: 'PATCH' });
  }

  public async delete<T = unknown>(url: string, config?: APIRequestConfig): Promise<T> {
    return await this.performRequest<T>(url, { ...config, method: 'DELETE' });
  }

  public async request<T = unknown>(config: APIRequestConfig & { url: string }): Promise<T> {
    return await this.performRequest<T>(config.url, config);
  }
}

export const APIClient = new APIClientClass();

export function createFileUpload(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}
