import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

interface ValidationOptions {
  allowUnknown?: boolean;
  stripUnknown?: boolean;
  abortEarly?: boolean;
}

/**
 * Generic request validation middleware factory
 */
export const validateRequest = (schemas: ValidationSchemas) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request body
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      // Validate query parameters
      if (schemas.query) {
        (req as any).validatedQuery = schemas.query.parse(req.query);
      }

      // Validate route parameters
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      // Validate headers
      if (schemas.headers) {
        req.headers = schemas.headers.parse(req.headers);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        logger.warn('Request validation failed', {
          url: req.url,
          method: req.method,
          errors: errorMessages
        });

        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errorMessages
        });
        return;
      }

      logger.error('Unexpected validation error', { error, url: req.url, method: req.method });
      res.status(500).json({
        success: false,
        message: 'Internal server error during validation'
      });
    }
  };
};

/**
 * Validates numeric ID parameters
 */
export const validateID = (paramName: string = 'id') => {
  return validateRequest({
    params: z.object({
      [paramName]: z.coerce.number().int().positive()
    })
  });
};

/**
 * Validates UUID parameters (for entities that use UUID as primary key)
 */
export const validateUUID = (paramName: string = 'id') => {
  return validateRequest({
    params: z.object({
      [paramName]: z.string().uuid()
    })
  });
};

/**
 * Validates pagination parameters
 */
export const validatePagination = validateRequest({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  })
});

/**
 * Validates JSON content type
 */
export const validateJSON = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      res.status(400).json({
        success: false,
        message: 'Content-Type must be application/json'
      });
      return;
    }
  }
  next();
};

/**
 * Validates required content type
 */
export const requireContentType = (expectedType: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes(expectedType)) {
      res.status(400).json({
        success: false,
        message: `Content-Type must be ${expectedType}`
      });
      return;
    }
    next();
  };
};

/**
 * Validates request size
 */
export const validateRequestSize = (maxSizeBytes: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      res.status(413).json({
        success: false,
        message: `Request too large. Maximum size: ${maxSizeBytes} bytes`
      });
      return;
    }
    next();
  };
};

/**
 * Creates a custom validator with specific schema
 */
export const createCustomValidator = (schema: ZodSchema) => {
  return validateRequest({ body: schema });
}; 