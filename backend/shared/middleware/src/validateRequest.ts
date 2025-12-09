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
          validatedHeaders
        };
      } catch (error) {
        if (error instanceof ZodError) {
          const errorMessages = error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }));

          logger.warn('Request validation failed', {
            errors: errorMessages
          });

          set.status = 400;
          return {
            validationError: {
              success: false,
              message: 'Validation failed',
              errors: errorMessages
            }
          };
        }

        logger.error('Unexpected validation error', { error });
        set.status = 500;
        return {
          validationError: {
            success: false,
            message: 'Internal server error during validation'
          }
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
            const errorMessages = error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code
            }));

            logger.warn('Request validation failed', { errors: errorMessages });

            set.status = 400;
            return {
              success: false,
              message: 'Validation failed',
              errors: errorMessages
            };
          }

          set.status = 500;
          return {
            success: false,
            message: 'Internal server error during validation'
          };
        }
      }
    });
  };
}

// Validates numeric ID parameters
export const validateID = (paramName: string = 'id') => {
  return withValidation({
    params: z.object({
      [paramName]: z.coerce.number().int().positive()
    })
  });
};

// Validates UUID parameters
export const validateUUID = (paramName: string = 'id') => {
  return withValidation({
    params: z.object({
      [paramName]: z.string().uuid()
    })
  });
};

// Validates pagination parameters
export const validatePagination = withValidation({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  })
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
            message: 'Content-Type must be application/json'
          };
        }
      }
    }
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
            message: `Content-Type must be ${expectedType}`
          };
        }
      }
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
            message: `Request too large. Maximum size: ${maxSizeBytes} bytes`
          };
        }
      }
    });
  };
}

// Creates a custom validator with specific schema
export const createCustomValidator = (schema: ZodSchema) => {
  return withValidation({ body: schema });
};
