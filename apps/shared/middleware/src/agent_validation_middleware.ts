import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger, ApiError } from '@uaip/utils';
import { AgentCreateRequestSchema, AgentUpdateSchema, AgentRole } from '@uaip/types';
import type { ValidationMeta, AgentCreateRequest } from '@uaip/types';
import { AgentTransformationService } from './agent_transformation_service.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Enhanced Agent Validation Middleware for Elysia
 * Handles both persona and agent formats with comprehensive validation
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- static utility class pattern
export class AgentValidationMiddleware {
  private static validateBodyObject(
    body: unknown,
    set: { status?: number | string }
  ): Record<string, unknown> | { validationError: { error: string; code: string } } {
    if (!isRecord(body)) {
      set.status = 400;
      return {
        validationError: {
          error: 'Request body is required and must be an object',
          code: 'INVALID_REQUEST_BODY',
        },
      };
    }
    return body;
  }

  private static deriveWithValidBody(
    operation: string,
    handler: (rawData: Record<string, unknown>, set: { status?: number | string }) => Record<string, unknown>
  ) {
    return (app: Elysia) => {
      return app.derive(({ body, set }) => {
        const bodyResult = AgentValidationMiddleware.validateBodyObject(body, set);
        if ('validationError' in bodyResult) return bodyResult;
        try {
          return handler(bodyResult, set);
        } catch (error) {
          return AgentValidationMiddleware.handleValidationError(error, operation, set);
        }
      });
    };
  }

  static validateAgentCreation() {
    return AgentValidationMiddleware.deriveWithValidBody('agent creation', (rawData) => {
      logger.info('Validating agent creation request', {
        hasName: !!rawData.name,
        hasRole: !!rawData.role,
        hasCapabilities: !!rawData.capabilities,
        hasPersona: !!rawData.persona,
        inputFormat: AgentValidationMiddleware.detectInputFormat(rawData),
      });

      const needsTransformation = AgentValidationMiddleware.needsPersonaTransformation(rawData);

      let validatedData;

      if (needsTransformation) {
        logger.info('Applying persona transformation', { name: rawData.name });

        const transformedData = AgentTransformationService.transformPersonaToAgentRequest(rawData);
        validatedData = AgentCreateRequestSchema.parse(transformedData);

        logger.info('Persona transformation and validation successful', {
          originalRole: rawData.role || (isRecord(rawData.persona) ? rawData.persona.role : undefined),
          transformedRole: validatedData.role,
          capabilities: validatedData.capabilities?.length,
        });
      } else {
        validatedData = AgentCreateRequestSchema.parse(rawData);

        logger.info('Direct agent validation successful', {
          role: validatedData.role,
          capabilities: validatedData.capabilities?.length,
        });
      }

      AgentValidationMiddleware.validateBusinessRules(validatedData);

      const validationMeta: ValidationMeta = {
        transformationApplied: needsTransformation,
        originalFormat: AgentValidationMiddleware.detectInputFormat(rawData),
        validatedAt: new Date(),
      };

      return { validatedBody: validatedData, validationMeta };
    });
  }

  static validateAgentUpdate() {
    return AgentValidationMiddleware.deriveWithValidBody('agent update', (rawData) => {
      const validatedData = AgentUpdateSchema.parse(rawData);

      if (validatedData.role) {
        AgentValidationMiddleware.validateRole(validatedData.role);
      }

      if (validatedData.persona?.capabilities) {
        AgentValidationMiddleware.validateCapabilities(validatedData.persona.capabilities);
      }

      const validationMeta: ValidationMeta = {
        transformationApplied: false,
        originalFormat: 'agent-update',
        validatedAt: new Date(),
      };

      return { validatedBody: validatedData, validationMeta };
    });
  }

  static validateAgentQuery() {
    return (app: Elysia) => {
      return app.derive(({ query, set }) => {
        try {
          const querySchema = z.object({
            role: z.nativeEnum(AgentRole).optional(),
            isActive: z
              .string()
              .transform((val) => val === 'true')
              .optional(),
            capabilities: z
              .string()
              .transform((val) => val.split(','))
              .optional(),
            securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
            limit: z
              .string()
              .transform((val) => parseInt(val, 10))
              .refine((val) => val > 0 && val <= 100)
              .optional(),
            offset: z
              .string()
              .transform((val) => parseInt(val, 10))
              .refine((val) => val >= 0)
              .optional(),
            sortBy: z.enum(['name', 'role', 'createdAt', 'lastActiveAt']).optional(),
            sortOrder: z.enum(['asc', 'desc']).optional(),
          });

          const validatedQuery = querySchema.parse(query);

          const validationMeta: ValidationMeta = {
            transformationApplied: false,
            originalFormat: 'query-parameters',
            validatedAt: new Date(),
          };

          return {
            validatedQuery,
            validationMeta,
          };
        } catch (error) {
          return AgentValidationMiddleware.handleValidationError(error, 'agent query', set);
        }
      });
    };
  }

  /**
   * Detects if the input needs persona transformation
   */
  private static needsPersonaTransformation(input: Record<string, unknown>): boolean {
    const agentRoleValues = Object.values(AgentRole);
    const hasPersonaStructure =
      !!input.persona ||
      !!(input.role && typeof input.role === 'string' && !agentRoleValues.some((v) => v === input.role)) ||
      !!(input.expertise && !input.capabilities) ||
      !!input.traits ||
      !!input.background;

    const missingAgentFields = !input.capabilities || !input.description;

    return hasPersonaStructure || missingAgentFields;
  }

  private static detectInputFormat(input: Record<string, unknown>): string {
    const agentRoleValues = Object.values(AgentRole);
    if (input.persona) return 'nested-persona';
    if (input.role && typeof input.role === 'string' && !agentRoleValues.some((v) => v === input.role))
      return 'persona-role';
    if (input.expertise && !input.capabilities) return 'persona-expertise';
    if (input.traits) return 'persona-traits';
    if (input.background && !input.description) return 'persona-background';
    if (input.capabilities && input.description) return 'agent-standard';
    return 'unknown';
  }

  private static validateBusinessRules(data: AgentCreateRequest): void {
    AgentValidationMiddleware.validateRole(data.role ?? AgentRole.ASSISTANT);
    AgentValidationMiddleware.validateCapabilities(data.capabilities);
    AgentValidationMiddleware.validateSecurityLevel(
      data.securityLevel ?? 'medium',
      data.role ?? AgentRole.ASSISTANT
    );

    if (data.configuration) {
      AgentValidationMiddleware.validateConfiguration(data.configuration, data.role ?? AgentRole.ASSISTANT);
    }
  }

  /**
   * Validates agent role
   */
  private static validateRole(role: AgentRole): void {
    if (!Object.values(AgentRole).includes(role)) {
      throw new ApiError(400, `Invalid agent role: ${role}`, 'INVALID_ROLE', {
        validRoles: Object.values(AgentRole),
        hint: 'Use AgentTransformationService.mapPersonaRoleToAgentRole() for persona roles',
      });
    }
  }

  /**
   * Validates capabilities array
   */
  private static validateCapabilities(capabilities: string[]): void {
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      throw new ApiError(400, 'Capabilities must be a non-empty array', 'INVALID_CAPABILITIES');
    }

    const invalidCapabilities = capabilities.filter(
      (cap) => typeof cap !== 'string' || cap.trim().length === 0
    );

    if (invalidCapabilities.length > 0) {
      throw new ApiError(
        400,
        'All capabilities must be non-empty strings',
        'INVALID_CAPABILITY_FORMAT'
      );
    }

    if (capabilities.length > 50) {
      throw new ApiError(400, 'Too many capabilities (max 50)', 'TOO_MANY_CAPABILITIES');
    }
  }

  /**
   * Validates security level consistency with role
   */
  private static validateSecurityLevel(securityLevel: string, role: AgentRole): void {
    const highSecurityRoles = [AgentRole.ORCHESTRATOR];
    const _mediumSecurityRoles = [AgentRole.SPECIALIST, AgentRole.ANALYZER];

    if (highSecurityRoles.includes(role) && securityLevel === 'low') {
      logger.warn('Low security level for high-privilege role', { role, securityLevel });
    }

    if (role === AgentRole.ASSISTANT && securityLevel === 'critical') {
      logger.warn('Critical security level for assistant role', { role, securityLevel });
    }
  }

  private static validateConfiguration(
    config: { analysisDepth?: string; collaborationMode?: string; temperature?: number },
    role: AgentRole
  ): void {
    if (config.analysisDepth === 'advanced' && role === AgentRole.ASSISTANT) {
      logger.warn('Advanced analysis depth for assistant role', {
        role,
        analysisDepth: config.analysisDepth,
      });
    }

    if (config.collaborationMode === 'independent' && role === AgentRole.ASSISTANT) {
      logger.warn('Independent collaboration mode for assistant role', {
        role,
        collaborationMode: config.collaborationMode,
      });
    }

    const temp = config.temperature;
    if (temp !== undefined && (temp < 0 || temp > 2)) {
      throw new ApiError(400, 'Temperature must be between 0 and 2', 'INVALID_TEMPERATURE');
    }
  }

  /**
   * Enhanced error handling with transformation context
   */
  private static handleValidationError(
    error: unknown,
    operation: string,
    set: { status?: number | string }
  ): Record<string, unknown> {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Agent validation error during ${operation}`, {
      error: err.message,
      stack: err.stack,
      operation,
    });

    if (error instanceof z.ZodError) {
      set.status = 400;
      return {
        validationError: {
          success: false,
          message: 'Request validation failed',
          code: 'VALIDATION_ERROR',
          details: error.errors.map((zodErr) => ({
            field: zodErr.path.join('.'),
            message: zodErr.message,
            code: zodErr.code,
            received: 'received' in zodErr ? zodErr.received : undefined,
          })),
          hint: 'If sending persona data, ensure it includes name, role, and expertise/capabilities fields',
          supportedFormats: ['agent-standard', 'persona-legacy'],
          transformationStats: AgentTransformationService.getTransformationStats(),
        },
      };
    } else if (error instanceof ApiError) {
      set.status = error.statusCode;
      return {
        validationError: {
          success: false,
          message: error.message,
          code: error.code,
          details: error.details,
        },
      };
    } else {
      set.status = 500;
      return {
        validationError: {
          success: false,
          message: `Internal validation error during ${operation}`,
          code: 'INTERNAL_VALIDATION_ERROR',
        },
      };
    }
  }
}
