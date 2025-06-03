import { Request, Response, NextFunction } from 'express';
import { PersonaService } from '@uaip/shared-services';
import { logger, ApiError } from '@uaip/utils';
import { 
  Persona,
  CreatePersonaRequest,
  UpdatePersonaRequest,
  PersonaSearchFilters,
  PersonaAnalytics,
  PersonaRecommendation
} from '@uaip/types';

export class PersonaController {
  private personaService: PersonaService;

  constructor(personaService: PersonaService) {
    this.personaService = personaService;
  }

  public async createPersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Extract user ID from authenticated user
      const userId = req.user?.id;
      if (!userId) {
        throw new Error('User authentication required');
      }

      // Create request with authenticated user ID
      const createRequest: CreatePersonaRequest = {
        ...req.body,
        createdBy: userId // Override any createdBy in request body with authenticated user ID
      };

      logger.info('Creating new persona', { 
        name: createRequest.name,
        createdBy: createRequest.createdBy 
      });

      const persona = await this.personaService.createPersona(createRequest);

      logger.info('Persona created successfully', { 
        personaId: persona.id,
        name: persona.name
      });

      res.status(201).json({
        success: true,
        data: persona,
        meta: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error creating persona', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        requestBody: req.body
      });
      next(error);
    }
  }

  public async getPersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { personaId } = req.params;

      logger.info('Retrieving persona', { personaId });

      const persona = await this.personaService.getPersona(personaId);
      if (!persona) {
        throw new ApiError(404, 'Persona not found', 'PERSONA_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: persona,
        meta: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error retrieving persona', { 
        personaId: req.params.personaId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async updatePersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { personaId } = req.params;
      const updateRequest: UpdatePersonaRequest = req.body;

      logger.info('Updating persona', { 
        personaId,
        updates: Object.keys(updateRequest)
      });

      const persona = await this.personaService.updatePersona(personaId, updateRequest);

      logger.info('Persona updated successfully', { 
        personaId,
        name: persona.name
      });

      res.status(200).json({
        success: true,
        data: persona,
        meta: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error updating persona', { 
        personaId: req.params.personaId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async deletePersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { personaId } = req.params;
      const { deletedBy } = req.body;

      logger.info('Deleting persona', { personaId, deletedBy });

      await this.personaService.deletePersona(personaId, deletedBy);

      logger.info('Persona deleted successfully', { personaId });

      res.status(204).send();

    } catch (error) {
      logger.error('Error deleting persona', { 
        personaId: req.params.personaId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async searchPersonas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: PersonaSearchFilters = {
        query: req.query.query as string,
        expertise: req.query.expertiseDomains ? 
          (req.query.expertiseDomains as string).split(',') : undefined,
        traits: req.query.traits ? 
          (req.query.traits as string).split(',') : undefined,
        status: req.query.status as any,
        visibility: req.query.visibility as any,
        createdBy: req.query.createdBy ? 
          (req.query.createdBy as string).split(',') : undefined,
        tags: req.query.tags ? 
          (req.query.tags as string).split(',') : undefined
      };

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      logger.info('Searching personas', { 
        filters: Object.keys(filters).filter(key => filters[key as keyof PersonaSearchFilters] !== undefined),
        limit,
        offset
      });

      const result = await this.personaService.searchPersonas(filters, limit, offset);

      res.status(200).json({
        success: true,
        data: result.personas,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: result.hasMore
        },
        meta: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error searching personas', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        query: req.query
      });
      next(error);
    }
  }

  public async getPersonaAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { personaId } = req.params;
      const timeframe = req.query.timeframe ? {
        start: new Date(req.query.start as string),
        end: new Date(req.query.end as string)
      } : undefined;

      logger.info('Retrieving persona analytics', { personaId, timeframe });

      const analytics = await this.personaService.getPersonaAnalytics(personaId, timeframe);
      if (!analytics) {
        throw new ApiError(404, 'Persona analytics not found', 'ANALYTICS_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: analytics,
        meta: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error retrieving persona analytics', { 
        personaId: req.params.personaId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async getPersonaRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.query.userId as string || 'anonymous';
      const context = req.query.query as string;
      const limit = parseInt(req.query.limit as string) || 5;

      logger.info('Getting persona recommendations', { 
        userId,
        context,
        limit
      });

      const recommendations = await this.personaService.getPersonaRecommendations(userId, context, limit);

      res.status(200).json({
        success: true,
        data: recommendations,
        meta: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error getting persona recommendations', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        query: req.query
      });
      next(error);
    }
  }

  public async validatePersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { personaId } = req.params;

      logger.info('Validating persona', { personaId });

      // Get the persona first
      const persona = await this.personaService.getPersona(personaId);
      if (!persona) {
        throw new ApiError(404, 'Persona not found', 'PERSONA_NOT_FOUND');
      }

      const validation = await this.personaService.validatePersona(persona);

      res.status(200).json({
        success: true,
        data: validation,
        meta: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error validating persona', { 
        personaId: req.params.personaId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async getPersonaTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const category = req.query.category as string;

      logger.info('Retrieving persona templates', { category });

      const templates = await this.personaService.getPersonaTemplates(category);

      res.status(200).json({
        success: true,
        data: templates,
        meta: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error retrieving persona templates', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        category: req.query.category
      });
      next(error);
    }
  }
} 