import { treaty, type Treaty } from '@elysiajs/eden'
import type { NavratnaCoreApp, NavratnaGatewayApp, QuestionForgeApp } from '@uaip/contracts/eden'
import { csrfService } from '@/services/c_s_r_f_service'
import { resolveApiOrigin } from '@/config/api_config'

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

const baseUrl = resolveApiOrigin()

const CREDENTIALS: RequestCredentials = 'include';

type RemoveIndexSignature<T> = T extends Record<PropertyKey, unknown>
  ? {
      [K in keyof T as string extends K
        ? never
        : number extends K
          ? never
          : symbol extends K
            ? never
            : K]: RemoveIndexSignature<T[K]>
    }
  : T

type CoreClient = Treaty.Sign<RemoveIndexSignature<NavratnaCoreApp['~Routes']>>
type GatewayClient = Treaty.Sign<RemoveIndexSignature<NavratnaGatewayApp['~Routes']>>
type QuestionForgeClient = Treaty.Sign<RemoveIndexSignature<QuestionForgeApp['~Routes']>>

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

export const coreClient = treaty<NavratnaCoreApp>(baseUrl, edenConfig) as CoreClient
export const gatewayClient = treaty<NavratnaGatewayApp>(baseUrl, edenConfig) as GatewayClient
export const questionforgeClient = treaty<QuestionForgeApp>(baseUrl, edenConfig) as QuestionForgeClient

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
    return await performBinaryRequest(path, config) as T
  }

  const requestHeaders = await buildHeaders(config.headers)
  const requestBody = config.body instanceof FormData || typeof config.body === 'string'
    ? config.body
    : config.body

  const response = await fetch(`${baseUrl}${path}`, {
    method: config.method,
    body: requestBody instanceof FormData || typeof requestBody === 'string'
      ? requestBody
      : requestBody === undefined
        ? undefined
        : JSON.stringify(requestBody),
    headers: requestHeaders,
    credentials: 'include',
    signal: config.signal,
  })

  dispatchResponseEvents(response)

  const result: unknown = await response.json()

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

  return result as T
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

  // A JSON endpoint answering with an HTML document means the request never reached
  // the API — typically a static host serving its SPA fallback. That body is not data:
  // callers that only truth-test the result would read it as a successful response.
  if (typeof data === 'string' && data.trimStart().startsWith('<')) {
    throw new EdenClientError(
      'Expected JSON from the API but received an HTML document. The API base URL is likely misconfigured.',
      502,
      'NON_JSON_RESPONSE',
    )
  }

  if (isRecord(data) && 'success' in data && 'data' in data && data.success === true) {
    return data.data as T
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
