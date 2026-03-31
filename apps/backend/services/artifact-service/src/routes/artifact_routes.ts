import { ArtifactService } from '../artifact_service.js';
import type { ArtifactConversationContext, ArtifactGenerationRequest, ArtifactType } from '@uaip/types';
import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import { withNginxAuth } from '@uaip/middleware';

type Elysia = { group: Function };

const supportedArtifactTypes: readonly ArtifactType[] = ['code', 'test', 'documentation', 'prd'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isArtifactType(value: unknown): value is ArtifactType {
  return (
    value === 'code' ||
    value === 'test' ||
    value === 'documentation' ||
    value === 'prd'
  );
}

function isArtifactConversationContext(value: unknown): value is ArtifactConversationContext {
  return (
    isRecord(value) &&
    typeof value.conversationId === 'string' &&
    Array.isArray(value.messages) &&
    Array.isArray(value.participants) &&
    Array.isArray(value.topics) &&
    Array.isArray(value.decisions) &&
    Array.isArray(value.actionItems)
  );
}

function buildArtifactGenerationRequest(body: unknown): ArtifactGenerationRequest | null {
  if (!isRecord(body) || !isArtifactType(body.type) || !isArtifactConversationContext(body.context)) {
    return null;
  }

  const options = isRecord(body.options)
    ? {
        ...(typeof body.options.template === 'string' ? { template: body.options.template } : {}),
        ...(typeof body.options.language === 'string' ? { language: body.options.language } : {}),
        ...(typeof body.options.framework === 'string' ? { framework: body.options.framework } : {}),
      }
    : undefined;

  return {
    type: body.type,
    context: body.context,
    ...(Array.isArray(body.requirements)
      ? { requirements: body.requirements.filter((value): value is string => typeof value === 'string') }
      : {}),
    ...(Array.isArray(body.constraints)
      ? { constraints: body.constraints.filter((value): value is string => typeof value === 'string') }
      : {}),
    ...(isRecord(body.preferences) ? { preferences: body.preferences } : {}),
    ...(isRecord(body.metadata) ? { metadata: body.metadata } : {}),
    ...(options && Object.keys(options).length > 0 ? { options } : {}),
  };
}

export function registerArtifactRoutes<T extends Elysia>(
  app: T,
  artifactService: ArtifactService
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- withNginxAuth type flows through Elysia group generics
  (app as { group: Function }).group(
    '/api/v1/artifacts',
    (g) => withNginxAuth(g)
      // List all artifacts
      .get(
        '/',
        async ({ query, set }) => {
          try {
            const databaseService = DatabaseService.getInstance();
            const artifactRepo = databaseService.getArtifactRepository();
    
            const type = query.type as string | undefined;
            const projectId = query.projectId as string | undefined;
            const limit = query.limit ? parseInt(query.limit) : 50;
            const offset = query.offset ? parseInt(query.offset) : 0;
    
            const artifacts = await artifactRepo.findMany({
              ...(type ? { type } : {}),
              ...(projectId ? { projectId } : {}),
            });
    
            // Apply pagination
            const paginatedArtifacts = artifacts.slice(offset, offset + limit);
    
            return {
              success: true,
              data: paginatedArtifacts,
              total: artifacts.length,
              limit,
              offset,
            };
          } catch (error) {
            logger.error('Failed to list artifacts', { error });
            set.status = 500;
            return {
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Failed to list artifacts' },
            };
          }
        }
      )
    
      // Get artifact by ID
      .get(
        '/:id',
        async ({ params, set }) => {
          try {
            const { id } = params;
            const databaseService = DatabaseService.getInstance();
            const artifactRepo = databaseService.getArtifactRepository();
    
            const artifact = await artifactRepo.findById(id);
            if (!artifact) {
              set.status = 404;
              return {
                success: false,
                error: { code: 'NOT_FOUND', message: 'Artifact not found' },
              };
            }
            return { success: true, data: artifact };
          } catch (error) {
            logger.error('Failed to get artifact', {
              error,
              id: (params as Record<string, string>).id,
            });
            set.status = 500;
            return {
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Failed to get artifact' },
            };
          }
        }
      )
    
      .post(
        '/generate',
        async ({ body, set }) => {
          try {
            const request = buildArtifactGenerationRequest(body);
    
            if (!request?.type || !request?.context) {
              set.status = 400;
              return {
                success: false,
                error: {
                  code: 'INVALID_REQUEST',
                  message: 'Missing required fields: type and context',
                },
              };
            }
    
            if (!supportedArtifactTypes.includes(request.type)) {
              set.status = 400;
              return {
                success: false,
                error: {
                  code: 'INVALID_TYPE',
                  message: `Invalid type. Supported: ${supportedArtifactTypes.join(', ')}`,
                },
              };
            }
    
            if (!request.context.agent || !request.context.persona || !request.context.discussion) {
              set.status = 400;
              return {
                success: false,
                error: {
                  code: 'INVALID_CONTEXT',
                  message: 'Context must include agent, persona, discussion',
                },
              };
            }
    
            logger.info('Artifact generation request received', {
              type: request.type,
              agent: request.context.agent.id,
              persona: request.context.persona.role,
            });
    
            const response = await artifactService.generateArtifact(request);
            set.status = response.success ? 200 : 400;
            return response;
          } catch (error) {
            logger.error('Artifact generation error:', error);
            set.status = 500;
            return {
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error during artifact generation',
              },
            };
          }
        }
      )
    
      .get(
        '/templates',
        async ({ query, set }) => {
          try {
            const { type, language, framework } = query;
            const templates = await artifactService.listTemplates(
              type as ArtifactType | undefined
            );
    
            let filtered = templates;
            if (language)
              filtered = filtered.filter(
                (t) => !t.language || t.language.toLowerCase() === String(language).toLowerCase()
              );
            if (framework)
              filtered = filtered.filter(
                (t) =>
                  !t.framework || t.framework.toLowerCase() === String(framework).toLowerCase()
              );
    
            return { success: true, templates: filtered, total: filtered.length };
          } catch (error) {
            logger.error('Template listing error:', error);
            set.status = 500;
            return {
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve templates' },
            };
          }
        }
      )
    
      .get(
        '/templates/:id',
        async ({ params, set }) => {
          try {
            const { id } = params;
            const template = await artifactService.getTemplate(id);
            if (!template) {
              set.status = 404;
              return {
                success: false,
                error: { code: 'NOT_FOUND', message: 'Template not found' },
              };
            }
            return { success: true, template };
          } catch (error) {
            logger.error('Template retrieval error:', error);
            set.status = 500;
            return {
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve template' },
            };
          }
        }
      )
    
      .post(
        '/validate',
        async ({ body, set }) => {
          try {
            const { content, type } = body as Record<string, unknown>;
            if (typeof content !== 'string' || !isArtifactType(type)) {
              set.status = 400;
              return {
                success: false,
                error: {
                  code: 'INVALID_REQUEST',
                  message: 'Missing required fields: content and type',
                },
              };
            }
            const validation = await artifactService.validateArtifact(content, type);
            return { success: true, validation };
          } catch (error) {
            logger.error('Validation error:', error);
            set.status = 500;
            return {
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Failed to validate artifact' },
            };
          }
        }
      )
    
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
            templates: health.templates,
          },
        };
      })
    
      .get('/types', () => {
        return {
          success: true,
          types: supportedArtifactTypes.map((type) => ({ type, description: getTypeDescription(type) })),
        };
      })
  );

  return app;
}

function getTypeDescription(type: ArtifactType): string {
  const descriptions = {
    code: 'Generate code implementations based on requirements and context',
    test: 'Generate test suites and test cases for validation',
    documentation: 'Generate technical documentation and guides',
    prd: 'Generate Product Requirements Documents for planning',
  } as Record<string, string>;
  return descriptions[type] || 'Unknown artifact type';
}
