import { ArtifactService } from '../artifact_service.js';
import type { ArtifactConversationContext, ArtifactGenerationRequest, ArtifactType } from '@uaip/types';
import { logger, isRecord } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import { withRequiredAuth } from '@uaip/middleware';
import { ShortLinkService } from '../services/short_link_service.js';
import { isArtifactType, supportedArtifactTypes } from '../artifact_types.js';

import { Elysia, t } from 'elysia';

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

const ArtifactSchema = t.Any()
const ArtifactErrorSchema = t.Object({ success: t.Literal(false), error: t.Object({ code: t.String(), message: t.String() }) })

/**
 * Read-only projection of an artifact safe to expose on a public share link.
 * Deliberately omits ownership/tenant and internal generation metadata
 * (organizationId, generatedBy, approvedBy, conversationId, sourceMessages,
 * validationResult, projectId, …) — only the human-facing content is shared.
 */
function toPublicArtifact(artifact: Record<string, unknown>) {
  return {
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    description: artifact.description ?? null,
    content: artifact.content,
    language: artifact.language ?? null,
    framework: artifact.framework ?? null,
    tags: Array.isArray(artifact.tags) ? artifact.tags : [],
    version: artifact.version ?? null,
    createdAt: artifact.createdAt ?? null,
  };
}

export function registerArtifactRoutes(
  artifactService: ArtifactService
){
  return new Elysia()
    // Public, read-only view of an artifact that was explicitly shared. Keyed by
    // the share short code (not the artifact id), so only artifacts with an
    // active 'artifact' short link are reachable — never arbitrary ids. No auth:
    // this is what a peer opens from a shared link. Registered outside the
    // withRequiredAuth group below.
    .get(
      '/api/v1/artifacts/public/:shortCode',
      async ({ params, set, headers }) => {
        try {
          const links = new ShortLinkService();
          const link = await links.getShortLink(params.shortCode);
          if (!link || link.type !== 'artifact' || !link.artifactId) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND', message: 'Shared artifact not found' } };
          }
          if (link.expiresAt && new Date() > link.expiresAt) {
            set.status = 410;
            return { success: false, error: { code: 'GONE', message: 'This share link has expired' } };
          }

          const artifactRepo = DatabaseService.getInstance().getArtifactRepository();
          const artifact = await artifactRepo.findById(link.artifactId);
          if (!artifact) {
            set.status = 404;
            return { success: false, error: { code: 'NOT_FOUND', message: 'Shared artifact not found' } };
          }

          // Best-effort click analytics; never fail the read on a tracking error.
          links
            .recordShareView(link.id, {
              userAgent: headers['user-agent'],
              ip: headers['x-forwarded-for'] || undefined,
              referer: headers['referer'],
            })
            .catch((error: unknown) => logger.warn('Failed to record shared-artifact view', { error }));

          return { success: true, data: toPublicArtifact(artifact as unknown as Record<string, unknown>) };
        } catch (error) {
          logger.error('Failed to load shared artifact', { error, shortCode: params.shortCode });
          set.status = 500;
          return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load shared artifact' } };
        }
      },
      {
        response: {
          200: t.Object({ success: t.Literal(true), data: t.Any() }),
          404: ArtifactErrorSchema,
          410: ArtifactErrorSchema,
          500: ArtifactErrorSchema,
        },
      }
    )
    .group(
    '/api/v1/artifacts',
    (g) => withRequiredAuth(g)
      // List all artifacts
      .get(
        '/',
        async ({ query, set }) => {
          try {
            const databaseService = DatabaseService.getInstance();
            const artifactRepo = databaseService.getArtifactRepository();
    
            const type = query.type;
            const limit = Math.min(query.limit ? parseInt(query.limit) : 50, 200);
            const offset = query.offset ? parseInt(query.offset) : 0;
    
            const [artifacts, total] = await Promise.all([
              artifactRepo.findMany({
                limit,
                offset,
                ...(type ? { type } : {}),
              }),
              artifactRepo.count(),
            ]);
    
            return {
              success: true,
              data: artifacts,
              total,
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
        },
        {
          query: t.Object({
            type: t.Optional(t.String()),
            projectId: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
          }),
          response: {
            200: t.Object({ success: t.Literal(true), data: t.Array(ArtifactSchema), total: t.Number(), limit: t.Number(), offset: t.Number() }),
            500: ArtifactErrorSchema,
          },
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
              id: params.id,
            });
            set.status = 500;
            return {
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Failed to get artifact' },
            };
          }
        },
        {
          response: {
            200: t.Object({ success: t.Literal(true), data: ArtifactSchema }),
            404: ArtifactErrorSchema,
            500: ArtifactErrorSchema,
          },
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
    
            const response = await artifactService.generateAndPersistArtifact(request, {
              generatedBy: request.context.agent.id,
              generator: 'artifact-service-http',
            });
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
        },
        {
          body: t.Object({
            type: t.String(),
            context: t.Any(),
            requirements: t.Optional(t.Array(t.String())),
            constraints: t.Optional(t.Array(t.String())),
            preferences: t.Optional(t.Any()),
            metadata: t.Optional(t.Any()),
            options: t.Optional(t.Object({
              template: t.Optional(t.String()),
              language: t.Optional(t.String()),
              framework: t.Optional(t.String()),
            })),
          }),
          response: { 200: t.Any(), 400: ArtifactErrorSchema, 500: ArtifactErrorSchema },
        }
      )
    
      .get(
        '/templates',
        async ({ query, set }) => {
          try {
            const { type, language, framework } = query;
            const templates = await artifactService.listTemplates(
              isArtifactType(type) ? type : undefined
            );
    
            let filtered = templates;
            if (language)
              filtered = filtered.filter(
                (tmpl) => !tmpl.language || tmpl.language.toLowerCase() === String(language).toLowerCase()
              );
            if (framework)
              filtered = filtered.filter(
                (tmpl) =>
                  !tmpl.framework || tmpl.framework.toLowerCase() === String(framework).toLowerCase()
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
        },
        {
          query: t.Object({ type: t.Optional(t.String()), language: t.Optional(t.String()), framework: t.Optional(t.String()) }),
          response: {
            200: t.Object({ success: t.Literal(true), templates: t.Array(ArtifactSchema), total: t.Number() }),
            500: ArtifactErrorSchema,
          },
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
        },
        {
          response: {
            200: t.Object({ success: t.Literal(true), template: ArtifactSchema }),
            404: ArtifactErrorSchema,
            500: ArtifactErrorSchema,
          },
        }
      )
    
      .post(
        '/validate',
        async ({ body, set }) => {
          try {
            if (!isRecord(body)) {
              set.status = 400;
              return {
                success: false,
                error: { code: 'INVALID_REQUEST', message: 'Invalid request body' },
              };
            }
            const { content, type } = body;
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
        },
        {
          body: t.Object({ content: t.String(), type: t.String() }),
          response: {
            200: t.Object({ success: t.Literal(true), validation: ArtifactSchema }),
            400: ArtifactErrorSchema,
            500: ArtifactErrorSchema,
          },
        }
      )
    
      .get('/health', (_ctx) => {
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
    
      .get('/types', (_ctx) => {
        return {
          success: true,
          types: supportedArtifactTypes.map((type) => ({ type, description: getTypeDescription(type) })),
        };
      })
  );
}

function getTypeDescription(type: ArtifactType): string {
  const descriptions: Partial<Record<ArtifactType, string>> = {
    code: 'Generate code implementations based on requirements and context',
    test: 'Generate test suites and test cases for validation',
    documentation: 'Generate technical documentation and guides',
    prd: 'Generate Product Requirements Documents for planning',
  };
  return descriptions[type] ?? 'Unknown artifact type';
}
