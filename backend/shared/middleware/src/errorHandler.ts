import { Request, Response, NextFunction } from 'express';
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

// Error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details: Record<string, any> | undefined;

  // Handle different error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.code || 'APPLICATION_ERROR';
    message = error.message;
    details = error.details;
  } else if (error instanceof ApiError || (error as any).name === 'ApiError') {
    statusCode = (error as any).statusCode;
    errorCode = (error as any).code;
    message = error.message;
    details = (error as any).details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = {
      validationErrors: error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code
      }))
    };
  }

  // Log the error
  logError(logger, error, {
    path: req.path,
    method: req.method,
    userAgent: req.headers?.['user-agent'] || 'unknown',
    ip: req.ip,
    userId: req.user?.id,
    requestId: req.id
  });

  // Prepare response
  const response = {
    success: false,
    error: {
      code: errorCode,
      message,
      ...(details && { details })
    },
    meta: {
      timestamp: new Date(),
      requestId: req.headers?.['x-request-id'] as string,
      version: config.environment
    }
  };

  res.status(statusCode).json(response);
} 