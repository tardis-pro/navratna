import { recordError, ErrorContext, setupGlobalErrorHandlers } from './metrics';

export interface StructuredErrorLogger {
  error(error: Error, context?: Partial<ErrorContext>): void;
  warning(error: Error, context?: Partial<ErrorContext>): void;
  critical(error: Error, context?: Partial<ErrorContext>): void;
  business(error: Error, context?: Partial<ErrorContext>): void;
}

export class ServiceErrorLogger implements StructuredErrorLogger {
  constructor(private serviceName: string) {
    // Setup global error handlers for this service
    setupGlobalErrorHandlers(serviceName);
  }

  private createContext(
    severity: 'error' | 'critical' | 'warning',
    partialContext?: Partial<ErrorContext>
  ): ErrorContext {
    return {
      service: this.serviceName,
      severity,
      ...partialContext,
    };
  }

  error(error: Error, context?: Partial<ErrorContext>): void {
    recordError(error, this.createContext('error', context));
  }

  warning(error: Error, context?: Partial<ErrorContext>): void {
    recordError(error, this.createContext('warning', context));
  }

  critical(error: Error, context?: Partial<ErrorContext>): void {
    recordError(error, this.createContext('critical', context));
  }

  business(error: Error, context?: Partial<ErrorContext>): void {
    // Business logic errors are typically non-critical but important for analytics
    recordError(
      error,
      this.createContext('error', {
        ...context,
        metadata: {
          category: 'business-logic',
          ...context?.metadata,
        },
      })
    );
  }
}

// Factory function for creating service-specific loggers
export function createErrorLogger(serviceName: string): ServiceErrorLogger {
  return new ServiceErrorLogger(serviceName);
}

// Predefined error types for common scenarios
export class DatabaseConnectionError extends Error {
  constructor(database: string, originalError?: Error) {
    super(`Failed to connect to ${database}: ${originalError?.message || 'Unknown error'}`);
    this.name = 'DatabaseConnectionError';
    this.message = originalError.message;
  }
}

export class ValidationError extends Error {
  constructor(field: string, value: any, expectedType: string) {
    super(`Validation failed for field '${field}': expected ${expectedType}, got ${typeof value}`);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(reason: string) {
    super(`Authentication failed: ${reason}`);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(resource: string, action: string, userId?: string) {
    super(`Authorization failed: user ${userId || 'unknown'} cannot ${action} ${resource}`);
    this.name = 'AuthorizationError';
  }
}

export class BusinessLogicError extends Error {
  constructor(operation: string, reason: string) {
    super(`Business logic error in ${operation}: ${reason}`);
    this.name = 'BusinessLogicError';
  }
}

export class ExternalServiceError extends Error {
  constructor(service: string, operation: string, statusCode?: number) {
    super(`External service error: ${service} ${operation} ${statusCode ? `(${statusCode})` : ''}`);
    this.name = 'ExternalServiceError';
  }
}

// Helper function for wrapping async operations with error tracking
export function withErrorTracking<T>(
  operation: () => Promise<T>,
  logger: StructuredErrorLogger,
  context: Partial<ErrorContext>
): Promise<T> {
  return operation().catch((error) => {
    logger.error(error instanceof Error ? error : new Error(String(error)), context);
    throw error;
  });
}

// Helper function for wrapping sync operations with error tracking
export function withSyncErrorTracking<T>(
  operation: () => T,
  logger: StructuredErrorLogger,
  context: Partial<ErrorContext>
): T {
  try {
    return operation();
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error(String(error)), context);
    throw error;
  }
}
