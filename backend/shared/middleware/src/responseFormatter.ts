/**
 * Standardized API response helpers.
 * Eliminates duplicated response formatting across 40+ route handlers.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: Date;
    page?: number;
    limit?: number;
    total?: number;
  };
}

export function successResponse<T>(data: T, meta?: Partial<ApiResponse['meta']>): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date(),
      ...meta,
    },
  };
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown,
): ApiResponse<never> {
  return {
    success: false,
    error: { code, message, details },
    meta: { timestamp: new Date() },
  };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): ApiResponse<T[]> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date(),
      page,
      limit,
      total,
    },
  };
}

/** Common error responses */
export const CommonErrors = {
  notFound: (resource: string) => errorResponse('NOT_FOUND', `${resource} not found`),
  unauthorized: (message = 'Authentication required') => errorResponse('UNAUTHORIZED', message),
  forbidden: (message = 'Insufficient permissions') => errorResponse('FORBIDDEN', message),
  badRequest: (message: string, details?: unknown) => errorResponse('BAD_REQUEST', message, details),
  internal: (message = 'Internal server error') => errorResponse('INTERNAL_ERROR', message),
  validationError: (details: unknown) => errorResponse('VALIDATION_ERROR', 'Request validation failed', details),
} as const;
