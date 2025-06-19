import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger, ApiError,  } from '@uaip/utils';
import { 
  AgentCreateRequestSchema, 
  AgentUpdateSchema,
  AgentRole 
} from '@uaip/types';
import { AgentTransformationService } from './agentTransformationService.js';

/**
 * Enhanced Agent Validation Middleware
 * Handles both persona and agent formats with comprehensive validation
 * Implements the validation strategy from the TypeORM migration plan
 */
export class AgentValidationMiddleware {
  
  /**
   * Validates agent creation requests with persona transformation support
   */
  static validateAgentCreation(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawData = req.body;
      
      if (!rawData || typeof rawData !== 'object') {
        throw new ApiError(400, 'Request body is required and must be an object', 'INVALID_REQUEST_BODY');
      }

      logger.info('Validating agent creation request', {
        hasName: !!rawData.name,
        hasRole: !!rawData.role,
        hasCapabilities: !!rawData.capabilities,
        hasPersona: !!rawData.persona,
        inputFormat: AgentValidationMiddleware.detectInputFormat(rawData)
      });

      // Check if transformation is needed
      const needsTransformation = AgentValidationMiddleware.needsPersonaTransformation(rawData);
      
      let validatedData;
      
      if (needsTransformation) {
        // Transform persona format to agent format
        logger.info('Applying persona transformation', { name: rawData.name });
        
        const transformedData = AgentTransformationService.transformPersonaToAgentRequest(rawData);
        
        // Validate the transformed data
        validatedData = AgentCreateRequestSchema.parse(transformedData);
        
        logger.info('Persona transformation and validation successful', {
          originalRole: rawData.role || rawData.persona?.role,
          transformedRole: validatedData.role,
          capabilities: validatedData.capabilities?.length
        });
      } else {
        // Direct validation of agent format
        validatedData = AgentCreateRequestSchema.parse(rawData);
        
        logger.info('Direct agent validation successful', {
          role: validatedData.role,
          capabilities: validatedData.capabilities?.length
        });
      }

      // Additional business logic validation
      AgentValidationMiddleware.validateBusinessRules(validatedData);

      // Attach validated data to request
      req.body = validatedData;
      req.validationMeta = {
        transformationApplied: needsTransformation,
        originalFormat: AgentValidationMiddleware.detectInputFormat(rawData),
        validatedAt: new Date()
      };

      next();

    } catch (error) {
      AgentValidationMiddleware.handleValidationError(error, 'agent creation', next);
    }
  }

  /**
   * Validates agent update requests
   */
  static validateAgentUpdate(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawData = req.body;
      
      if (!rawData || typeof rawData !== 'object') {
        throw new ApiError(400, 'Request body is required and must be an object', 'INVALID_REQUEST_BODY');
      }
      
      // For updates, we're more permissive but still validate structure
      const validatedData = AgentUpdateSchema.parse(rawData);

      // Additional business logic validation for updates
      if (validatedData.role) {
        AgentValidationMiddleware.validateRole(validatedData.role);
      }

      if (validatedData.persona?.capabilities) {
        AgentValidationMiddleware.validateCapabilities(validatedData.persona.capabilities);
      }
      console.log('validatedData', validatedData);
      req.body = validatedData;
      req.validationMeta = {
        transformationApplied: false,
        originalFormat: 'agent-update',
        validatedAt: new Date()
      };

      next();

    } catch (error) {
      AgentValidationMiddleware.handleValidationError(error, 'agent update', next);
    }
  }

  /**
   * Validates agent query parameters
   */
  static validateAgentQuery(req: Request, res: Response, next: NextFunction): void {
    try {
      const querySchema = z.object({
        role: z.nativeEnum(AgentRole).optional(),
        isActive: z.string().transform(val => val === 'true').optional(),
        capabilities: z.string().transform(val => val.split(',')).optional(),
        securityLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        limit: z.string().transform(val => parseInt(val, 10)).refine(val => val > 0 && val <= 100).optional(),
        offset: z.string().transform(val => parseInt(val, 10)).refine(val => val >= 0).optional(),
        sortBy: z.enum(['name', 'role', 'createdAt', 'lastActiveAt']).optional(),
        sortOrder: z.enum(['asc', 'desc']).optional()
      });

      const validatedQuery = querySchema.parse(req.query);
      
      // Store validated query in a custom property instead of overwriting req.query
      (req as any).validatedQuery = validatedQuery;

      // Add validation metadata
      req.validationMeta = {
        transformationApplied: false,
        originalFormat: 'query-parameters',
        validatedAt: new Date()
      };

      next();

    } catch (error) {
      AgentValidationMiddleware.handleValidationError(error, 'agent query', next);
    }
  }

  /**
   * Detects if the input needs persona transformation
   */
  private static needsPersonaTransformation(input: any): boolean {
    // Check for persona-specific indicators
    const hasPersonaStructure = input.persona || 
                               (input.role && !Object.values(AgentRole).includes(input.role)) ||
                               (input.expertise && !input.capabilities) ||
                               input.traits ||
                               input.background;
    
    // Check for missing agent-specific required fields
    const missingAgentFields = !input.capabilities || !input.description;
    
    return hasPersonaStructure || missingAgentFields;
  }

  /**
   * Detects the input format for logging and analytics
   */
  private static detectInputFormat(input: any): string {
    if (input.persona) return 'nested-persona';
    if (input.role && !Object.values(AgentRole).includes(input.role)) return 'persona-role';
    if (input.expertise && !input.capabilities) return 'persona-expertise';
    if (input.traits) return 'persona-traits';
    if (input.background && !input.description) return 'persona-background';
    if (input.capabilities && input.description) return 'agent-standard';
    return 'unknown';
  }

  /**
   * Validates business rules for agent creation
   */
  private static validateBusinessRules(data: any): void {
    // Validate role-specific requirements
    AgentValidationMiddleware.validateRole(data.role);
    
    // Validate capabilities
    AgentValidationMiddleware.validateCapabilities(data.capabilities);
    
    // Validate security level consistency
    AgentValidationMiddleware.validateSecurityLevel(data.securityLevel, data.role);
    
    // Validate configuration consistency
    if (data.configuration) {
      AgentValidationMiddleware.validateConfiguration(data.configuration, data.role);
    }
  }

  /**
   * Validates agent role
   */
  private static validateRole(role: AgentRole): void {
    if (!Object.values(AgentRole).includes(role)) {
      throw new ApiError(400, `Invalid agent role: ${role}`, 'INVALID_ROLE', {
        validRoles: Object.values(AgentRole),
        hint: 'Use AgentTransformationService.mapPersonaRoleToAgentRole() for persona roles'
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

    // Check for valid capability format
    const invalidCapabilities = capabilities.filter(cap => 
      typeof cap !== 'string' || cap.trim().length === 0
    );

    if (invalidCapabilities.length > 0) {
      throw new ApiError(400, 'All capabilities must be non-empty strings', 'INVALID_CAPABILITY_FORMAT');
    }

    // Check for reasonable capability count
    if (capabilities.length > 50) {
      throw new ApiError(400, 'Too many capabilities (max 50)', 'TOO_MANY_CAPABILITIES');
    }
  }

  /**
   * Validates security level consistency with role
   */
  private static validateSecurityLevel(securityLevel: string, role: AgentRole): void {
    const highSecurityRoles = [AgentRole.ORCHESTRATOR];
    const mediumSecurityRoles = [AgentRole.SPECIALIST, AgentRole.ANALYZER];
    
    if (highSecurityRoles.includes(role) && securityLevel === 'low') {
      logger.warn('Low security level for high-privilege role', { role, securityLevel });
    }
    
    if (role === AgentRole.ASSISTANT && securityLevel === 'critical') {
      logger.warn('Critical security level for assistant role', { role, securityLevel });
    }
  }

  /**
   * Validates configuration consistency with role
   */
  private static validateConfiguration(config: any, role: AgentRole): void {
    // Validate analysis depth for different roles
    if (config.analysisDepth === 'advanced' && role === AgentRole.ASSISTANT) {
      logger.warn('Advanced analysis depth for assistant role', { role, analysisDepth: config.analysisDepth });
    }

    // Validate collaboration mode
    if (config.collaborationMode === 'independent' && role === AgentRole.ASSISTANT) {
      logger.warn('Independent collaboration mode for assistant role', { role, collaborationMode: config.collaborationMode });
    }

    // Validate temperature settings
    if (config.temperature && (config.temperature < 0 || config.temperature > 2)) {
      throw new ApiError(400, 'Temperature must be between 0 and 2', 'INVALID_TEMPERATURE');
    }
  }

  /**
   * Enhanced error handling with transformation context
   */
  private static handleValidationError(error: any, operation: string, next: NextFunction): void {
    logger.error(`Agent validation error during ${operation}`, {
      error: error.message,
      stack: error.stack,
      operation
    });

    if (error instanceof z.ZodError) {
      // Enhanced Zod validation error handling
      const enhancedError = new ApiError(400, 'Request validation failed', 'VALIDATION_ERROR', {
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
          received: 'received' in err ? err.received : undefined
        })),
        hint: 'If sending persona data, ensure it includes name, role, and expertise/capabilities fields',
        supportedFormats: ['agent-standard', 'persona-legacy'],
        transformationStats: AgentTransformationService.getTransformationStats(),
        documentation: 'See TypeORM Migration Plan for supported formats'
      });
      next(enhancedError);
    } else if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(500, `Internal validation error during ${operation}`, 'INTERNAL_VALIDATION_ERROR'));
    }
  }
}

// Extend Express Request interface to include validation metadata
declare global {
  namespace Express {
    interface Request {
      validationMeta?: {
        transformationApplied: boolean;
        originalFormat: string;
        validatedAt: Date;
      };
      validatedQuery?: any;
    }
  }
} 