import { treaty } from '@elysiajs/eden'
import type { NavratnaCoreApp } from '@uaip/types/eden_app_types'
import type { NavratnaGatewayApp } from '@uaip/types/eden_app_types'
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

const edenConfig = {
  $fetch: {
    credentials: 'include' as RequestCredentials,
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

export const coreClient = treaty<NavratnaCoreApp>(API_BASE_URL || window.location.origin, edenConfig)
export const gatewayClient = treaty<NavratnaGatewayApp>(API_BASE_URL || window.location.origin, edenConfig)

type EdenResponse<T> = { data: T; error: null } | { data: null; error: { status: number; value: unknown } }

export function unwrapEden<T>(result: EdenResponse<T>): T {
  if (result.error) {
    const err = result.error
    const value = err.value as Record<string, unknown> | undefined
    throw new EdenClientError(
      (value?.message as string) ?? (value?.error as string) ?? `Request failed with status ${err.status}`,
      err.status,
      (value?.code as string) ?? (value?.errorCode as string),
      value?.details ?? value?.errors,
    )
  }

  const data = result.data as unknown
  if (data && typeof data === 'object' && 'success' in data && 'data' in data && (data as Record<string, unknown>).success === true) {
    return (data as Record<string, unknown>).data as T
  }

  return result.data
}

export async function edenWithCSRFRetry<T>(fn: () => Promise<EdenResponse<T>>): Promise<T> {
  const result = await fn()

  if (result.error?.status === 403) {
    const value = result.error.value as Record<string, unknown> | undefined
    const errorMsg = (value?.error as string) ?? ''
    if (errorMsg.includes('CSRF')) {
      await csrfService.refreshToken()
      return unwrapEden(await fn())
    }
  }

  return unwrapEden(result)
}

export type { NavratnaCoreApp, NavratnaGatewayApp } from '@uaip/types/eden_app_types'
