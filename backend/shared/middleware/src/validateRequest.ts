import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';

interface ValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  headers?: z.ZodTypeAny;
}

interface ValidationOptions {
  allowUnknown?: boolean;
  stripUnknown?: boolean;
  abortEarly?: boolean;
}

export const validateRequest = (
  schemas: ValidationSchemas,
  options: ValidationOptions = {}
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const errors: string[] = [];

      // Validate request body
      if (schemas.body && req.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          errors.push(...result.error.issues.map(issue => `Body: ${issue.message}`));
        } else {
          req.body = result.data; // Use validated and potentially converted values
        }
      }

      // Validate query parameters
      if (schemas.query && req.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          errors.push(...result.error.issues.map(issue => `Query: ${issue.message}`));
        } else {
          req.query = result.data;
        }
      }

      // Validate URL parameters
      if (schemas.params && req.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          errors.push(...result.error.issues.map(issue => `Params: ${issue.message}`));
        } else {
          req.params = result.data;
        }
      }

      // Validate headers
      if (schemas.headers && req.headers) {
        const result = schemas.headers.safeParse(req.headers);
        if (!result.success) {
          errors.push(...result.error.issues.map(issue => `Headers: ${issue.message}`));
        } else {
          // Don't replace headers as they might contain other required fields
          Object.assign(req.headers, result.data);
        }
      }

      // If there are validation errors, return 400 Bad Request
      if (errors.length > 0) {
        logger.warn('Request validation failed', {
          path: req.path,
          method: req.method,
          errors,
          userId: req.user?.id,
          requestId: req.id
        });

        throw new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', {
          errors,
          details: errors
        });
      }

      // Log successful validation for debugging
      logger.debug('Request validation passed', {
        path: req.path,
        method: req.method,
        requestId: req.id,
        schemasValidated: Object.keys(schemas)
      });

      next();
    } catch (error) {
      if (error instanceof ApiError) {
        return next(error);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Unexpected error during request validation', {
        error: errorMessage,
        path: req.path,
        method: req.method,
        requestId: req.id
      });

      next(new ApiError(500, 'Validation error', 'VALIDATION_SYSTEM_ERROR'));
    }
  };
};

// Specific validation middleware for common patterns
export const validateUUID = (paramName: string = 'id') => {
  const schema = z.object({
    [paramName]: z.string().uuid()
  });

  return validateRequest({ params: schema });
};

export const validatePagination = () => {
  const schema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['created_at', 'updated_at', 'name']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc')
  });

  return validateRequest({ query: schema });
};

export const validateJSON = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.is('application/json')) {
      try {
        // Express should have already parsed JSON, but let's validate it's valid
        if (typeof req.body === 'string') {
          req.body = JSON.parse(req.body);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Invalid JSON';
        logger.warn('Invalid JSON in request body', {
          path: req.path,
          method: req.method,
          error: errorMessage,
          requestId: req.id
        });

        return next(new ApiError(400, 'Invalid JSON format', 'INVALID_JSON'));
      }
    }
    next();
  };
};

// Middleware to validate content type
export const requireContentType = (contentType: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.is(contentType)) {
      logger.warn('Invalid content type', {
        expected: contentType,
        received: req.get('Content-Type'),
        path: req.path,
        method: req.method,
        requestId: req.id
      });

      return next(new ApiError(415, `Content-Type must be ${contentType}`, 'INVALID_CONTENT_TYPE'));
    }
    next();
  };
};

// Middleware to validate request size
export const validateRequestSize = (maxSize: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      logger.warn('Request too large', {
        size: contentLength,
        maxSize,
        path: req.path,
        method: req.method,
        requestId: req.id
      });

      return next(new ApiError(413, 'Request entity too large', 'REQUEST_TOO_LARGE'));
    }
    
    next();
  };
};

// Custom validation helpers
export const createCustomValidator = (
  validationFunction: (data: any) => { isValid: boolean; errors?: string[] }
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = validationFunction(req.body);
      
      if (!result.isValid) {
        logger.warn('Custom validation failed', {
          errors: result.errors,
          path: req.path,
          method: req.method,
          requestId: req.id
        });

        throw new ApiError(400, 'Custom validation failed', 'CUSTOM_VALIDATION_ERROR', {
          errors: result.errors || ['Validation failed']
        });
      }

      next();
    } catch (error) {
      if (error instanceof ApiError) {
        return next(error);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in custom validation', {
        error: errorMessage,
        path: req.path,
        method: req.method,
        requestId: req.id
      });

      next(new ApiError(500, 'Validation error', 'VALIDATION_SYSTEM_ERROR'));
    }
  };
}; 