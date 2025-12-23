import { Elysia } from 'elysia';
import { ZodError } from 'zod';
import { logger, logError, ApiError } from '@uaip/utils';
import { config } from '@uaip/config';

// Custom error class
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;
  public details?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Elysia error handler plugin
export function errorHandler(app: Elysia): Elysia {
  return app.onError(({ code, error, set, request }) => {
    let statusCode = 500;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: Record<string, any> | undefined;

    const err = error as Error;

    // Handle different error types
    if (err instanceof AppError) {
      statusCode = err.statusCode;
      errorCode = err.code || 'APPLICATION_ERROR';
      message = err.message;
      details = err.details;
    } else if (err instanceof ApiError || (err as any).name === 'ApiError') {
      statusCode = (err as any).statusCode;
      errorCode = (err as any).code;
      message = err.message;
      details = (err as any).details;
    } else if (err instanceof ZodError) {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = 'Request validation failed';
      details = {
        validationErrors: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      };
    } else if (code === 'NOT_FOUND') {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
      message = 'Resource not found';
    } else if (code === 'VALIDATION') {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = err.message || 'Validation failed';
    } else if (code === 'PARSE') {
      statusCode = 400;
      errorCode = 'PARSE_ERROR';
      message = 'Failed to parse request body';
    }

    // Log the error
    const url = new URL(request.url);
    logError(logger, err, {
      path: url.pathname,
      method: request.method,
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestId: request.headers.get('x-request-id'),
    });

    set.status = statusCode;

    return {
      success: false,
      error: {
        code: errorCode,
        message,
        ...(details && { details }),
      },
      meta: {
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id'),
        version: config.environment,
      },
    };
  });
}

// Error response builder helper
export function buildErrorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, any>
) {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    meta: {
      timestamp: new Date(),
    },
  };
}

// Async error handler options
export interface AsyncHandlerOptions {
  operation: string;
  logError?: boolean;
  rethrow?: boolean;
}

/**
 * Generic async error handler wrapper
 * Reduces boilerplate try-catch blocks in route handlers
 *
 * @example
 * const result = await handleAsyncError(
 *   () => userService.getUser(id),
 *   { operation: 'Get User' }
 * );
 */
export async function handleAsyncError<T>(
  handler: () => Promise<T>,
  options: AsyncHandlerOptions
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const result = await handler();
    return { success: true, data: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (options.logError !== false) {
      logger.error(`${options.operation} failed`, { error: errorMessage });
    }

    if (options.rethrow) {
      throw error;
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Create a route-specific error handler
 * Returns a curried function that handles errors and sets HTTP status
 *
 * @example
 * const handleError = createRouteErrorHandler('Get User');
 * return handleError(() => userService.getUser(id), set);
 */
export function createRouteErrorHandler(operation: string) {
  return async <T>(
    handler: () => Promise<T>,
    set: { status: number }
  ): Promise<{ success: boolean; data?: T; error?: string }> => {
    const result = await handleAsyncError(handler, { operation });

    if (!result.success) {
      set.status = 500;
    }

    return result;
  };
}
