import { Request, Response, NextFunction } from 'express';
import { logger, ApiError } from '@uaip/utils';
import { CapabilityDiscoveryService, SecurityValidationService, DatabaseService } from '@uaip/shared-services';
import {
  Capability,
  CapabilityType,
  SecurityLevel,
  SecurityContext,
  CapabilitySearchQuery
} from '@uaip/types';

export class CapabilityController {
  private capabilityDiscoveryService: CapabilityDiscoveryService;
  private securityValidationService: SecurityValidationService;

  constructor(databaseService?: DatabaseService) {
    this.capabilityDiscoveryService = new CapabilityDiscoveryService(databaseService);
    this.securityValidationService = new SecurityValidationService();
  }

  // GET /api/v1/capabilities/search
  public searchCapabilities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query, type, category, securityLevel, limit = 50, offset = 0 } = req.query;

      if (!query || typeof query !== 'string') {
        throw new ApiError(400, 'Query parameter is required', 'INVALID_QUERY');
      }

      const searchQuery: CapabilitySearchQuery = {
        query: query as string,
        type: type as CapabilityType,
        limit: parseInt(limit as string, 10)
      };

      const securityContext = this.extractSecurityContext(req);
      
      // Validate search permissions
      await this.securityValidationService.validateOperation(
        securityContext,
        'capability_search',
        ['capabilities'],
        searchQuery
      );

      const capabilities = await this.capabilityDiscoveryService.searchCapabilities(searchQuery);

      res.status(200).json({
        success: true,
        data: {
          capabilities,
          totalCount: capabilities.length,
          recommendations: []
        },
        meta: {
          query: searchQuery,
          timestamp: new Date(),
          service: 'capability-registry'
        }
      });

    } catch (error) {
      next(error);
    }
  };

  // POST /api/v1/capabilities/register
  public registerCapability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const capability: Capability = req.body;

      if (!capability) {
        throw new ApiError(400, 'Capability definition is required', 'MISSING_CAPABILITY');
      }

      const securityContext = this.extractSecurityContext(req);

      // Validate registration permissions
      await this.securityValidationService.validateOperation(
        securityContext,
        'capability_register',
        ['capabilities'],
        capability
      );

      // For now, return the capability as-is since we don't have a register method
      // This would need to be implemented in the CapabilityDiscoveryService
      logger.info('Capability registration requested', {
        capabilityName: capability.name,
        userId: securityContext.userId
      });

      res.status(201).json({
        success: true,
        data: {
          capability
        },
        meta: {
          timestamp: new Date(),
          service: 'capability-registry'
        }
      });

    } catch (error) {
      next(error);
    }
  };

  // GET /api/v1/capabilities/:id
  public getCapability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ApiError(400, 'Capability ID is required', 'MISSING_ID');
      }

      const securityContext = this.extractSecurityContext(req);

      // Validate read permissions
      await this.securityValidationService.validateOperation(
        securityContext,
        'capability_read',
        [`capability:${id}`],
        { capabilityId: id }
      );

      const capability = await this.capabilityDiscoveryService.getCapabilityById(id);

      if (!capability) {
        throw new ApiError(404, 'Capability not found', 'CAPABILITY_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: {
          capability
        },
        meta: {
          timestamp: new Date(),
          service: 'capability-registry'
        }
      });

    } catch (error) {
      next(error);
    }
  };

  // PUT /api/v1/capabilities/:id
  public updateCapability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        throw new ApiError(400, 'Capability ID is required', 'MISSING_ID');
      }

      const securityContext = this.extractSecurityContext(req);

      // Validate update permissions
      await this.securityValidationService.validateOperation(
        securityContext,
        'capability_update',
        [`capability:${id}`],
        updateData
      );

      // For now, just return success since we don't have an update method
      logger.info('Capability update requested', {
        capabilityId: id,
        userId: securityContext.userId
      });

      res.status(200).json({
        success: true,
        data: {
          capability: { id, ...updateData }
        },
        meta: {
          timestamp: new Date(),
          service: 'capability-registry'
        }
      });

    } catch (error) {
      next(error);
    }
  };

  // DELETE /api/v1/capabilities/:id
  public deleteCapability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ApiError(400, 'Capability ID is required', 'MISSING_ID');
      }

      const securityContext = this.extractSecurityContext(req);

      // Validate delete permissions
      await this.securityValidationService.validateOperation(
        securityContext,
        'capability_delete',
        [`capability:${id}`],
        { capabilityId: id }
      );

      // For now, just log the deletion request
      logger.info('Capability deletion requested', {
        capabilityId: id,
        userId: securityContext.userId
      });

      res.status(204).send();

    } catch (error) {
      next(error);
    }
  };

  // GET /api/v1/capabilities/categories
  public getCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const securityContext = this.extractSecurityContext(req);

      // Validate read permissions
      await this.securityValidationService.validateOperation(
        securityContext,
        'capability_read',
        ['capabilities'],
        {}
      );

      // Return hardcoded categories for now
      const categories = [
        'data-processing',
        'communication',
        'analysis',
        'automation',
        'integration',
        'security',
        'monitoring'
      ];

      res.status(200).json({
        success: true,
        data: {
          categories
        },
        meta: {
          timestamp: new Date(),
          service: 'capability-registry'
        }
      });

    } catch (error) {
      next(error);
    }
  };

  // GET /api/v1/capabilities/:id/dependencies
  public getCapabilityDependencies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ApiError(400, 'Capability ID is required', 'MISSING_ID');
      }

      const securityContext = this.extractSecurityContext(req);

      // Validate read permissions
      await this.securityValidationService.validateOperation(
        securityContext,
        'capability_read',
        [`capability:${id}`],
        { capabilityId: id }
      );

      const dependencies = await this.capabilityDiscoveryService.getCapabilityDependencies(id);

      res.status(200).json({
        success: true,
        data: {
          dependencies
        },
        meta: {
          capabilityId: id,
          timestamp: new Date(),
          service: 'capability-registry'
        }
      });

    } catch (error) {
      next(error);
    }
  };

  // POST /api/v1/capabilities/:id/validate
  public validateCapability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validationContext = req.body;

      if (!id) {
        throw new ApiError(400, 'Capability ID is required', 'MISSING_ID');
      }

      const securityContext = this.extractSecurityContext(req);

      // Validate validation permissions
      await this.securityValidationService.validateOperation(
        securityContext,
        'capability_validate',
        [`capability:${id}`],
        validationContext
      );

      // For now, return a basic validation result
      const validationResult = {
        valid: true,
        issues: [],
        recommendations: []
      };

      res.status(200).json({
        success: true,
        data: {
          validationResult
        },
        meta: {
          capabilityId: id,
          timestamp: new Date(),
          service: 'capability-registry'
        }
      });

    } catch (error) {
      next(error);
    }
  };

  // GET /api/v1/capabilities/recommendations
  public getRecommendations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { context, intent, limit = 10 } = req.query;

      const securityContext = this.extractSecurityContext(req);

      // Validate read permissions
      await this.securityValidationService.validateOperation(
        securityContext,
        'capability_read',
        ['capabilities'],
        { context, intent }
      );

      // For now, return empty recommendations
      const recommendations: any[] = [];

      res.status(200).json({
        success: true,
        data: {
          recommendations
        },
        meta: {
          timestamp: new Date(),
          service: 'capability-registry'
        }
      });

    } catch (error) {
      next(error);
    }
  };

  private extractSecurityContext(req: Request): SecurityContext {
    // Extract security context from request headers/auth
    return {
      userId: req.headers['x-user-id'] as string || 'anonymous',
      sessionId: req.headers['x-session-id'] as string || 'unknown',
      role: req.headers['x-user-role'] as string || 'user',
      permissions: [], // Will be populated by security validation
      securityLevel: SecurityLevel.MEDIUM,
      lastAuthentication: new Date(),
      mfaVerified: false,
      riskScore: 0,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    };
  }
} 