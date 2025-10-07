import { ArtifactService } from '../ArtifactService.js';
import { ArtifactGenerationRequest, ArtifactType } from '@uaip/types';
import { logger } from '@uaip/utils';

export function registerArtifactRoutes(app: any, artifactService: ArtifactService) {
  return app.group('/api/v1/artifacts', (g: any) =>
    g
      .post('/generate', async ({ body, set }: any) => {
        try {
          const request: ArtifactGenerationRequest = body;

          if (!request?.type || !request?.context) {
            set.status = 400;
            return { success: false, error: { code: 'INVALID_REQUEST', message: 'Missing required fields: type and context' } };
          }

          const valid: ArtifactType[] = ['code', 'test', 'documentation', 'prd'];
          if (!valid.includes(request.type)) {
            set.status = 400;
            return { success: false, error: { code: 'INVALID_TYPE', message: `Invalid type. Supported: ${valid.join(', ')}` } };
          }

          const ctx = request.context as any;
          if (!ctx?.agent || !ctx?.persona || !ctx?.discussion) {
            set.status = 400;
            return { success: false, error: { code: 'INVALID_CONTEXT', message: 'Context must include agent, persona, discussion' } };
          }

          logger.info('Artifact generation request received', {
            type: request.type,
            agent: ctx.agent?.id,
            persona: ctx.persona?.role
          });

          const response = await artifactService.generateArtifact(request);
          set.status = response.success ? 200 : 400;
          return response;
        } catch (error) {
          logger.error('Artifact generation error:', error);
          set.status = 500;
          return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error during artifact generation' } };
        }
      })

      .get('/templates', async ({ query, set }: any) => {
        try {
          const { type, language, framework } = query as any;
          const templates = await artifactService.listTemplates(type as ArtifactType);

          let filtered = templates;
          if (language) filtered = filtered.filter(t => !t.language || t.language.toLowerCase() === String(language).toLowerCase());
          if (framework) filtered = filtered.filter(t => !t.framework || t.framework.toLowerCase() === String(framework).toLowerCase());

          return { success: true, templates: filtered, total: filtered.length };
        } catch (error) {
          logger.error('Template listing error:', error);
          set.status = 500;
          return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve templates' } };
        }
      })

      .get('/templates/:id', async ({ params, set }: any) => {
        try {
          const { id } = params as any;
          const template = await artifactService.getTemplate(id);
          if (!template) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } };
          }
          return { success: true, template };
        } catch (error) {
          logger.error('Template retrieval error:', error);
          set.status = 500;
          return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve template' } };
        }
      })

      .post('/validate', async ({ body, set }: any) => {
        try {
          const { content, type } = body as any;
          if (!content || !type) {
            set.status = 400;
            return { success: false, error: { code: 'INVALID_REQUEST', message: 'Missing required fields: content and type' } };
          }
          const validation = await artifactService.validateArtifact(content, type);
          return { success: true, validation };
        } catch (error) {
          logger.error('Validation error:', error);
          set.status = 500;
          return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to validate artifact' } };
        }
      })

      .get('/health', () => {
        const health = artifactService.getServiceHealth();
        return {
          success: true,
          health: {
            status: health.status,
            timestamp: new Date().toISOString(),
            service: 'artifact-service',
            version: '1.0.0',
            generators: health.generators,
            templates: health.templates
          }
        };
      })

      .get('/types', () => {
        const supported: ArtifactType[] = ['code', 'test', 'documentation', 'prd'];
        return { success: true, types: supported.map(type => ({ type, description: getTypeDescription(type) })) };
      })
  );
}

function getTypeDescription(type: ArtifactType): string {
  const descriptions = {
    code: 'Generate code implementations based on requirements and context',
    test: 'Generate test suites and test cases for validation',
    documentation: 'Generate technical documentation and guides',
    prd: 'Generate Product Requirements Documents for planning'
  } as Record<string, string>;
  return descriptions[type] || 'Unknown artifact type';
}

