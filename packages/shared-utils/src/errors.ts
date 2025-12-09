import * as winston from 'winston';

// Express-compatible types for middleware (avoiding direct express dependency)
// These are compatible with Express but don't require it as a dependency
export interface ExpressRequest {
  id?: string;
  [key: string]: unknown;
}

export interface ExpressResponse {
  status(code: number): ExpressResponse;
  json(body: unknown): ExpressResponse;
  [key: string]: unknown;
}

export type ExpressNextFunction = (err?: unknown) => void;

// Error details type - used for providing additional error context
export type ErrorDetails = Record<string, unknown>;

// Base API Error class
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ErrorDetails;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    code: string = 'API_ERROR',
    details?: ErrorDetails,
    stack?: string
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // This is a known operational error

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      details: this.details,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }
}

// Specific error classes for different scenarios
export class ValidationError extends ApiError {
  constructor(message: string, details?: ErrorDetails) {
    super(400, message, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed', details?: ErrorDetails) {
    super(401, message, 'AUTHENTICATION_ERROR', details);
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions', details?: ErrorDetails) {
    super(403, message, 'AUTHORIZATION_ERROR', details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found', details?: ErrorDetails) {
    super(404, message, 'NOT_FOUND_ERROR', details);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict', details?: ErrorDetails) {
    super(409, message, 'CONFLICT_ERROR', details);
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded', details?: ErrorDetails) {
    super(429, message, 'RATE_LIMIT_ERROR', details);
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error', details?: ErrorDetails) {
    super(500, message, 'INTERNAL_SERVER_ERROR', details);
  }
}

export class DatabaseError extends ApiError {
  constructor(message: string = 'Database operation failed', details?: ErrorDetails) {
    super(500, message, 'DATABASE_ERROR', details);
  }
}

export class ExternalServiceError extends ApiError {
  constructor(message: string = 'External service error', details?: ErrorDetails) {
    super(502, message, 'EXTERNAL_SERVICE_ERROR', details);
  }
}

export class SecurityError extends ApiError {
  constructor(message: string = 'Security violation detected', details?: ErrorDetails) {
    super(403, message, 'SECURITY_ERROR', details);
  }
}

// Error factory functions
export const createValidationError = (field: string, value: unknown, constraint: string) => {
  return new ValidationError(`Validation failed for field '${field}'`, {
    field,
    value,
    constraint,
  });
};

export const createNotFoundError = (resource: string, identifier: string) => {
  return new NotFoundError(`${resource} not found`, {
    resource,
    identifier,
  });
};

export const createConflictError = (resource: string, field: string, value: unknown) => {
  return new ConflictError(`${resource} already exists`, {
    resource,
    field,
    value,
  });
};

// Error code mappings for different scenarios
export const ErrorCodes = {
  // Authentication & Authorization
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  MISSING_TOKEN: 'MISSING_TOKEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resources
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',

  // Operations
  OPERATION_FAILED: 'OPERATION_FAILED',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',

  // Agent-specific
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_DISABLED: 'AGENT_DISABLED',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  PLAN_GENERATION_FAILED: 'PLAN_GENERATION_FAILED',

  // Security
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  RISK_TOO_HIGH: 'RISK_TOO_HIGH',

  // System
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

// Helper function to determine if an error is operational
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof ApiError) {
    return error.isOperational;
  }
  return false;
};

// Helper function to get appropriate status code from error
export const getStatusCodeFromError = (error: Error): number => {
  if (error instanceof ApiError) {
    return error.statusCode;
  }

  // Default to 500 for unknown errors
  return 500;
};

// Sanitized error response type
interface SanitizedError {
  code: string;
  message: string;
  details?: ErrorDetails;
  name?: string;
  statusCode?: number;
  stack?: string;
}

// Helper function to sanitize error details for client response
export const sanitizeErrorDetails = (error: ApiError): SanitizedError => {
  // In production, we might want to hide sensitive details
  if (process.env.NODE_ENV === 'production') {
    // Only return safe details
    return {
      code: error.code,
      message: error.message,
      // Optionally include some details based on error type
      ...(error.statusCode < 500 && error.details && { details: error.details }),
    };
  }

  // In development, return all details
  return error.toJSON();
};

// Error response structure
interface ErrorResponse {
  success: false;
  error: SanitizedError;
  requestId?: string;
}

// Create standardized error response
export const createErrorResponse = (error: Error, requestId?: string) => {
  let statusCode = 500;
  const response: ErrorResponse = {
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  };

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    response.error = sanitizeErrorDetails(error);
  } else {
    // Log unexpected errors
    console.error('Unexpected error:', error);
  }

  if (requestId) {
    response.requestId = requestId;
  }

  return { statusCode, response };
};

// Async handler wrapper to catch async errors
export const asyncHandler = (
  fn: (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => Promise<unknown>
) => {
  return (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Create and log error helper
export const logAndCreateError = (
  logger: winston.Logger,
  statusCode: number,
  message: string,
  code: string,
  context: Record<string, unknown> = {},
  details?: ErrorDetails
): ApiError => {
  const error = new ApiError(statusCode, message, code, details);
  logger.error(message, { ...context, error: error.toJSON() });
  return error;
};

// Convenience functions for common errors
export const createAndLogValidationError = (
  logger: winston.Logger,
  message: string,
  context: Record<string, unknown> = {}
) => {
  return logAndCreateError(logger, 400, message, 'VALIDATION_ERROR', context);
};

export const createAndLogNotFoundError = (
  logger: winston.Logger,
  resource: string,
  identifier: string
) => {
  return logAndCreateError(logger, 404, `${resource} not found`, 'RESOURCE_NOT_FOUND', {
    resource,
    identifier,
  });
};

export const createAndLogAuthError = (
  logger: winston.Logger,
  message: string,
  context: Record<string, unknown> = {}
) => {
  return logAndCreateError(logger, 401, message, 'AUTHENTICATION_ERROR', context);
};

export const createAndLogAuthzError = (
  logger: winston.Logger,
  message: string,
  context: Record<string, unknown> = {}
) => {
  return logAndCreateError(logger, 403, message, 'AUTHORIZATION_ERROR', context);
};

export const createAndLogDatabaseError = (
  logger: winston.Logger,
  message: string,
  context: Record<string, unknown> = {}
) => {
  return logAndCreateError(logger, 500, message, 'DATABASE_ERROR', context);
};

// Database error type for transformation
interface DatabaseErrorLike {
  code?: string;
  constraint?: string;
  detail?: string;
  column?: string;
  message?: string;
}

// Transform common database errors to API errors
export const transformDatabaseError = (error: DatabaseErrorLike): ApiError => {
  // PostgreSQL error codes
  if (error.code) {
    switch (error.code) {
      case '23505': // unique violation
        return new ConflictError('Resource already exists', {
          constraint: error.constraint,
          detail: error.detail,
        });
      case '23503': // foreign key violation
        return new ValidationError('Invalid reference', {
          constraint: error.constraint,
          detail: error.detail,
        });
      case '23502': // not null violation
        return new ValidationError('Required field missing', {
          column: error.column,
          detail: error.detail,
        });
      case '42P01': // undefined table
        return new InternalServerError('Database schema error');
      default:
        return new DatabaseError('Database operation failed', {
          code: error.code,
          detail: error.detail,
        });
    }
  }

  return new DatabaseError('Database operation failed', { error: error.message });
};

// Express error handler middleware
export const errorHandler = (
  error: Error,
  req: ExpressRequest,
  res: ExpressResponse,
  _next: ExpressNextFunction
) => {
  // Log the error
  console.error('Error:', error);

  const { statusCode, response } = createErrorResponse(error, req.id);

  res.status(statusCode).json(response);
};

// Type guards
export const isApiError = (error: unknown): error is ApiError => {
  return error instanceof ApiError;
};

export const isValidationError = (error: unknown): error is ValidationError => {
  return error instanceof ValidationError;
};

export const isAuthenticationError = (error: unknown): error is AuthenticationError => {
  return error instanceof AuthenticationError;
};

export const isAuthorizationError = (error: unknown): error is AuthorizationError => {
  return error instanceof AuthorizationError;
};

export const isNotFoundError = (error: unknown): error is NotFoundError => {
  return error instanceof NotFoundError;
};
