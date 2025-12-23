import { Elysia } from 'elysia';
import { z, ZodSchema, ZodError } from 'zod';
import { logger } from '@uaip/utils';

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

// Elysia plugin for request validation
export function validateRequest(schemas: ValidationSchemas) {
  return (app: Elysia) => {
    return app.derive(({ body, query, params, headers, set }) => {
      try {
        let validatedBody = body;
        let validatedQuery = query;
        let validatedParams = params;
        let validatedHeaders = headers;

        if (schemas.body && body) {
          validatedBody = schemas.body.parse(body);
        }

        if (schemas.query && query) {
          validatedQuery = schemas.query.parse(query);
        }

        if (schemas.params && params) {
          validatedParams = schemas.params.parse(params);
        }

        if (schemas.headers && headers) {
          validatedHeaders = schemas.headers.parse(headers);
        }

        return {
          validatedBody,
          validatedQuery,
          validatedParams,
          validatedHeaders,
        };
      } catch (error) {
        if (error instanceof ZodError) {
          const errorMessages = error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));

          logger.warn('Request validation failed', {
            errors: errorMessages,
          });

          set.status = 400;
          return {
            validationError: {
              success: false,
              message: 'Validation failed',
              errors: errorMessages,
            },
          };
        }

        logger.error('Unexpected validation error', { error });
        set.status = 500;
        return {
          validationError: {
            success: false,
            message: 'Internal server error during validation',
          },
        };
      }
    });
  };
}

// Elysia guard for validation - throws on invalid data
export function withValidation(schemas: ValidationSchemas) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle({ body, query, params, headers, set }) {
        try {
          if (schemas.body && body) {
            schemas.body.parse(body);
          }
          if (schemas.query && query) {
            schemas.query.parse(query);
          }
          if (schemas.params && params) {
            schemas.params.parse(params);
          }
          if (schemas.headers && headers) {
            schemas.headers.parse(headers);
          }
        } catch (error) {
          if (error instanceof ZodError) {
            const errorMessages = error.errors.map((err) => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            }));

            logger.warn('Request validation failed', { errors: errorMessages });

            set.status = 400;
            return {
              success: false,
              message: 'Validation failed',
              errors: errorMessages,
            };
          }

          set.status = 500;
          return {
            success: false,
            message: 'Internal server error during validation',
          };
        }
      },
    });
  };
}

// Validates numeric ID parameters
export const validateID = (paramName: string = 'id') => {
  return withValidation({
    params: z.object({
      [paramName]: z.coerce.number().int().positive(),
    }),
  });
};

// Validates UUID parameters
export const validateUUID = (paramName: string = 'id') => {
  return withValidation({
    params: z.object({
      [paramName]: z.string().uuid(),
    }),
  });
};

// Validates pagination parameters
export const validatePagination = withValidation({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

// Elysia guard for JSON content type validation
export function validateJSON(app: Elysia): Elysia {
  return app.guard({
    beforeHandle({ request, set }) {
      const method = request.method;
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const contentType = request.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          set.status = 400;
          return {
            success: false,
            message: 'Content-Type must be application/json',
          };
        }
      }
    },
  });
}

// Elysia guard for required content type
export function requireContentType(expectedType: string) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle({ request, set }) {
        const contentType = request.headers.get('content-type');
        if (!contentType || !contentType.includes(expectedType)) {
          set.status = 400;
          return {
            success: false,
            message: `Content-Type must be ${expectedType}`,
          };
        }
      },
    });
  };
}

// Elysia guard for request size validation
export function validateRequestSize(maxSizeBytes: number) {
  return (app: Elysia) => {
    return app.guard({
      beforeHandle({ request, set }) {
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > maxSizeBytes) {
          set.status = 413;
          return {
            success: false,
            message: `Request too large. Maximum size: ${maxSizeBytes} bytes`,
          };
        }
      },
    });
  };
}

// Creates a custom validator with specific schema
export const createCustomValidator = (schema: ZodSchema) => {
  return withValidation({ body: schema });
};

/**
 * Generic validator factory - creates a type-safe validator from a Zod schema
 * Useful for creating reusable validators across the codebase
 *
 * @example
 * const validateUser = createValidator(userSchema);
 * const user = validateUser(data);
 */
export const createValidator = <T extends z.ZodType>(schema: T) => {
  return (data: unknown): z.infer<T> => {
    return schema.parse(data);
  };
};

/**
 * Async validator factory - creates a type-safe async validator from a Zod schema
 * Useful for validators that need to perform async operations (e.g., database checks)
 *
 * @example
 * const validateUserAsync = createAsyncValidator(userSchemaWithDb);
 * const user = await validateUserAsync(data);
 */
export const createAsyncValidator = <T extends z.ZodType>(schema: T) => {
  return async (data: unknown): Promise<z.infer<T>> => {
    return schema.parseAsync(data);
  };
};

/**
 * Common validation schemas for reuse across the application
 * Reduces duplicate schema definitions and ensures consistency
 */
export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid('Invalid UUID format'),

  // Email validation
  email: z.string().email('Invalid email format'),

  // URL validation
  url: z.string().url('Invalid URL format'),

  // Pagination schema
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
  }),

  // Date range validation
  dateRange: z.object({
    startDate: z.string().datetime('Invalid start date format'),
    endDate: z.string().datetime('Invalid end date format'),
  }).refine(
    (data) => new Date(data.startDate) <= new Date(data.endDate),
    { message: 'Start date must be before or equal to end date' }
  ),

  // ID validation (numeric or UUID)
  id: z.union([
    z.string().uuid(),
    z.number().int().positive(),
  ]),

  // Optional ID
  optionalId: z.union([
    z.string().uuid(),
    z.number().int().positive(),
  ]).optional(),

  // Search query
  searchQuery: z.object({
    q: z.string().min(1, 'Search query cannot be empty'),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  }),

  // Sort parameters
  sort: z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc', 'ASC', 'DESC']).default('desc'),
  }),
};
