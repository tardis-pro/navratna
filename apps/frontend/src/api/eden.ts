import { edenFetch, treaty } from '@elysiajs/eden'
import type { Elysia } from 'elysia'
import type { NavratnaCoreApp, NavratnaGatewayApp, QuestionForgeApp } from '@uaip/contracts/eden'
import { csrfService } from '@/services/c_s_r_f_service'
import { API_BASE_URL } from '@/config/api_config'

export class EdenClientError extends Error {
  public statusCode?: number
  public code?: string
  public details?: unknown

  constructor(message: string, statusCode?: number, code?: string, details?: unknown) {
    super(message)
    this.name = 'EdenClientError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

const baseUrl = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')

const CREDENTIALS: RequestCredentials = 'include';

const edenConfig = {
  fetch: {
    credentials: CREDENTIALS,
  },
  headers: async () => {
    try {
      const csrfToken = await csrfService.getToken()
      return csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
    } catch {
      return {}
    }
  },
  onResponse(response: Response) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10)
      window.dispatchEvent(new CustomEvent('api:rate-limited', { detail: { retryAfter } }))
    }
  },
}

export const coreClient = treaty<NavratnaCoreApp>(baseUrl, edenConfig)
export const gatewayClient = treaty<NavratnaGatewayApp>(baseUrl, edenConfig)
export const questionforgeClient = treaty<QuestionForgeApp>(baseUrl, edenConfig)

type EdenFetchClient = (path: string, options?: Record<string, unknown>) => Promise<unknown>

function createFetchClient<T extends Elysia>(url: string): EdenFetchClient {
  if (typeof edenFetch !== 'function') {
    throw new Error('Eden fetch is unavailable')
  }

  const client = edenFetch<T>(url)
  const clientAny: any = client; // oxlint-disable-line @typescript-eslint/no-explicit-any -- edenFetch typed client wrapped as generic fetch
  const dynamicClient: EdenFetchClient = clientAny
  return async (path, options) => await dynamicClient(path, options ?? {})
}

const coreFetchClient = createFetchClient<NavratnaCoreApp>(baseUrl)
const gatewayFetchClient = createFetchClient<NavratnaGatewayApp>(baseUrl)
const questionforgeFetchClient = createFetchClient<QuestionForgeApp>(baseUrl)

type EdenFetchResult<T> =
  | { data: T | null; error: null }
  | { data: null; error: { status: number; value: unknown } }

type EdenRequestConfig = {
  body?: BodyInit | FormData | string | unknown
  headers?: HeadersInit
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  responseType?: 'blob' | 'json' | 'text'
  signal?: AbortSignal
}

type EdenService = 'core' | 'gateway' | 'questionforge'

function dispatchResponseEvents(response: Response): void {
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'))
  }

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10)
    window.dispatchEvent(new CustomEvent('api:rate-limited', { detail: { retryAfter } }))
  }
}

function resolveService(path: string): EdenService {
  if (path.startsWith('/api/v1/questionforge')) {
    return 'questionforge'
  }

  if (
    path.startsWith('/api/v1/auth') ||
    path.startsWith('/api/v1/users') ||
    path.startsWith('/api/v1/approvals') ||
    path.startsWith('/api/v1/audit') ||
    path.startsWith('/api/v1/security') ||
    path.startsWith('/api/v1/providers') ||
    path.startsWith('/api/v1/oauth') ||
    path.startsWith('/api/v1/knowledge') ||
    path.startsWith('/api/v1/contacts') ||
    path.startsWith('/api/v1/projects') ||
    path.startsWith('/api/v1/tasks') ||
    path.startsWith('/api/v1/operations') ||
    path.startsWith('/api/v1/workflows') ||
    path.startsWith('/api/v1/capabilities') ||
    path.startsWith('/api/v1/mcp') ||
    path.startsWith('/api/v1/tools') ||
    path.startsWith('/api/v1/workspaces') ||
    path.startsWith('/api/v1/webhooks')
  ) {
    return 'gateway'
  }

  return 'core'
}

function getFetchClient(service: EdenService) {
  switch (service) {
    case 'gateway':
      return gatewayFetchClient
    case 'questionforge':
      return questionforgeFetchClient
    default:
      return coreFetchClient
  }
}

function isResponseWrapper<T>(value: unknown): value is EdenFetchResult<T> {
  return typeof value === 'object' && value !== null && 'data' in value && 'error' in value
}

async function buildHeaders(headers?: HeadersInit): Promise<Headers> {
  const resolved = new Headers(headers)

  if (!resolved.has('Content-Type')) {
    resolved.set('Content-Type', 'application/json')
  }

  try {
    const csrfToken = await csrfService.getToken()
    if (csrfToken) {
      resolved.set('X-CSRF-Token', csrfToken)
    }
  } catch {
  }

  return resolved
}

async function performBinaryRequest(path: string, config: EdenRequestConfig): Promise<Blob | string> {
  const headers = await buildHeaders(config.headers)
  const response = await fetch(`${baseUrl}${path}`, {
    method: config.method,
    body: config.body instanceof FormData || typeof config.body === 'string'
      ? config.body
      : config.body === undefined
        ? undefined
        : JSON.stringify(config.body),
    credentials: 'include',
    headers,
    signal: config.signal,
  })

  dispatchResponseEvents(response)

  if (!response.ok) {
    throw new EdenClientError(`Request failed with status ${response.status}`, response.status)
  }

  if (config.responseType === 'blob') {
    return await response.blob()
  }

  return await response.text()
}

export async function edenRequest<T>(path: string, config: EdenRequestConfig = {}): Promise<T> {
  if (config.responseType === 'blob' || config.responseType === 'text') {
    const binaryResult: any = await performBinaryRequest(path, config); // oxlint-disable-line @typescript-eslint/no-explicit-any -- T is Blob|string for blob/text responseType
    return binaryResult
  }

  const service = resolveService(path)
  const request = getFetchClient(service)
  const requestHeaders = await buildHeaders(config.headers)
  const requestBody = config.body instanceof FormData || typeof config.body === 'string'
    ? config.body
    : config.body

  const result = await request(path, {
    method: config.method,
    body: requestBody,
    headers: requestHeaders,
    credentials: 'include',
    signal: config.signal,
  })

  if (isResponseWrapper<T>(result)) {
    if (result.error?.status === 403) {
      const errorValue = isRecord(result.error.value) ? result.error.value : undefined
      const message = typeof errorValue?.error === 'string' ? errorValue.error : ''
      if (message.includes('CSRF')) {
        await csrfService.refreshToken()
        return await edenRequest<T>(path, config)
      }
    }

    return unwrapEden(result)
  }

  const resultAny: any = result; // oxlint-disable-line @typescript-eslint/no-explicit-any -- result is unknown from dynamic fetch client; caller guarantees T
  return resultAny
}

type EdenResponse<T> = { data: T; error: null } | { data: null; error: { status: number; value: unknown } }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function unwrapEden<T>(result: EdenResponse<T>): T {
  if (result.error) {
    const err = result.error
    const value = isRecord(err.value) ? err.value : undefined
    throw new EdenClientError(
      (typeof value?.message === 'string' ? value.message : undefined) ??
        (typeof value?.error === 'string' ? value.error : undefined) ??
        `Request failed with status ${err.status}`,
      err.status,
      (typeof value?.code === 'string' ? value.code : undefined) ??
        (typeof value?.errorCode === 'string' ? value.errorCode : undefined),
      value?.details ?? value?.errors,
    )
  }

  const data: unknown = result.data
  if (isRecord(data) && 'success' in data && 'data' in data && data.success === true) {
    const dataAny: any = data; // oxlint-disable-line @typescript-eslint/no-explicit-any -- data.data is unknown; T is the expected runtime shape
    const unwrapped: T = dataAny.data
    return unwrapped
  }

  return result.data
}

export async function edenWithCSRFRetry<T>(fn: () => Promise<EdenResponse<T>>): Promise<T> {
  const result = await fn()

  if (result.error?.status === 403) {
    const value = isRecord(result.error.value) ? result.error.value : undefined
    const errorMsg = (typeof value?.error === 'string' ? value.error : '') ?? ''
    if (errorMsg.includes('CSRF')) {
      await csrfService.refreshToken()
      return unwrapEden(await fn())
    }
  }

  return unwrapEden(result)
}

export type { NavratnaCoreApp, NavratnaGatewayApp, QuestionForgeApp } from '@uaip/contracts/eden'
