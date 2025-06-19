import express from 'express';
import { ArtifactService } from '../ArtifactService';
import { 
  ArtifactGenerationRequest, 
  ArtifactType,
  ValidationResult 
} from '@uaip/types';
import { logger } from '@uaip/utils';

export function artifactRoutes(artifactService: ArtifactService): express.Router {
  const router = express.Router();

  // POST /api/v1/artifacts/generate
  router.post('/generate', async (req, res) => {
    try {
      const request: ArtifactGenerationRequest = req.body;
      
      // Validate request
      if (!request.type || !request.context) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing required fields: type and context'
          }
        });
      }

      // Validate artifact type
      const validTypes: ArtifactType[] = ['code', 'test', 'documentation', 'prd'];
      if (!validTypes.includes(request.type)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TYPE',
            message: `Invalid artifact type. Supported types: ${validTypes.join(', ')}`
          }
        });
      }

      // Validate context structure
      if (!request.context.agent || !request.context.persona || !request.context.discussion) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CONTEXT',
            message: 'Context must include agent, persona, and discussion'
          }
        });
      }

      logger.info('Artifact generation request received', {
        type: request.type,
        agent: request.context.agent.id,
        persona: request.context.persona.role
      });

      const response = await artifactService.generateArtifact(request);
      
      if (response.success) {
        res.status(200).json(response);
      } else {
        res.status(400).json(response);
      }

    } catch (error) {
      logger.error('Artifact generation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error during artifact generation'
        }
      });
    }
  });

  // GET /api/v1/artifacts/templates
  router.get('/templates', async (req, res) => {
    try {
      const { type, language, framework } = req.query;
      
      const templates = await artifactService.listTemplates(type as ArtifactType);
      
      // Apply additional filters if provided
      let filteredTemplates = templates;
      if (language) {
        filteredTemplates = filteredTemplates.filter(t => 
          !t.language || t.language.toLowerCase() === (language as string).toLowerCase()
        );
      }
      if (framework) {
        filteredTemplates = filteredTemplates.filter(t => 
          !t.framework || t.framework.toLowerCase() === (framework as string).toLowerCase()
        );
      }

      res.json({
        success: true,
        templates: filteredTemplates,
        total: filteredTemplates.length
      });

    } catch (error) {
      logger.error('Template listing error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve templates'
        }
      });
    }
  });

  // GET /api/v1/artifacts/templates/:id
  router.get('/templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const template = await artifactService.getTemplate(id);
      
      if (!template) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: `Template with id '${id}' not found`
          }
        });
      }

      res.json({
        success: true,
        template
      });

    } catch (error) {
      logger.error('Template retrieval error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve template'
        }
      });
    }
  });

  // POST /api/v1/artifacts/validate
  router.post('/validate', async (req, res) => {
    try {
      const { content, type, language } = req.body;
      
      if (!content || !type) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing required fields: content and type'
          }
        });
      }

      const validation = await artifactService.validateArtifact(content, type);
      
      res.json({
        success: true,
        validation
      });

    } catch (error) {
      logger.error('Validation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to validate artifact'
        }
      });
    }
  });

  // GET /api/v1/artifacts/health
  router.get('/health', (req, res) => {
    try {
      const health = artifactService.getServiceHealth();
      
      res.json({
        success: true,
        health: {
          status: health.status,
          timestamp: new Date().toISOString(),
          service: 'artifact-service',
          version: '1.0.0',
          generators: health.generators,
          templates: health.templates
        }
      });

    } catch (error) {
      logger.error('Health check error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Service health check failed'
        }
      });
    }
  });

  // GET /api/v1/artifacts/types
  router.get('/types', (req, res) => {
    try {
      const supportedTypes: ArtifactType[] = ['code', 'test', 'documentation', 'prd'];
      
      res.json({
        success: true,
        types: supportedTypes.map(type => ({
          type,
          description: getTypeDescription(type)
        }))
      });

    } catch (error) {
      logger.error('Types listing error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve supported types'
        }
      });
    }
  });

  return router;
}

function getTypeDescription(type: ArtifactType): string {
  const descriptions = {
    code: 'Generate code implementations based on requirements and context',
    test: 'Generate test suites and test cases for validation',
    documentation: 'Generate technical documentation and guides',
    prd: 'Generate Product Requirements Documents for planning'
  };
  
  return descriptions[type] || 'Unknown artifact type';
} 