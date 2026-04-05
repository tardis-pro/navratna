import { csrfService } from '@/services/c_s_r_f_service';
import { buildAPIURL } from '@/config/api_config';
import type { APIError } from '@uaip/types';
import { edenRequest } from './eden';

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

function toBodyInit(value: unknown): BodyInit | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    value instanceof FormData ||
    value instanceof Blob ||
    value instanceof URLSearchParams ||
    value instanceof ReadableStream ||
    typeof value === 'string' ||
    value instanceof ArrayBuffer
  ) {
    return value;
  }

  return JSON.stringify(value);
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

    const resolvedBody = toBodyInit(body);

    return {
      ...config,
      method,
      headers,
      body: resolvedBody,
      credentials: 'include',
    };
  }

  private transformResponse<T>(responseData: unknown): T {
    if (
      isRecord(responseData) &&
      responseData.success === true &&
      'data' in responseData
    ) {
      // @ts-expect-error -- responseData.data is the unwrapped API payload; T matches at runtime
      return responseData.data;
    }

    // @ts-expect-error -- responseData is the API payload; T matches at runtime
    return responseData;
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
      const relativeUrl = `${resolvedUrl.pathname}${resolvedUrl.search}`;
      const responseData = await edenRequest<unknown>(relativeUrl, {
        method: config?.method,
        body: config?.data,
        headers: requestInit.headers,
        responseType,
        signal: controller.signal,
      });

      return this.transformResponse<T>(responseData);
    } catch (error) {
      if (error instanceof APIClientError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIClientError('Request timed out', 'TIMEOUT_ERROR');
      }

      if (error instanceof Error && 'statusCode' in error) {
        const rawStatusCode = Reflect.get(error, 'statusCode');
        const statusCode = typeof rawStatusCode === 'number' ? rawStatusCode : undefined;
        const rawCode = Reflect.get(error, 'code');
        const code = typeof rawCode === 'string' ? rawCode : undefined;
        const details = Reflect.get(error, 'details');
        throw new APIClientError(error.message, code, details, statusCode);
      }

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
