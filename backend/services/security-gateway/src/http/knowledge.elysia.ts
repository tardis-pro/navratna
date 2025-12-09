import { withOptionalAuth, withRequiredAuth } from './middleware/auth.plugin.js';
import { z } from 'zod';
import {
  servicesHealthCheck,
  getUserKnowledgeService,
  type UserKnowledgeService,
} from '@uaip/shared-services';

async function getServices(): Promise<{
  userKnowledgeService: UserKnowledgeService | null;
  initializationError: string | null;
}> {
  try {
    const userKnowledgeService = await getUserKnowledgeService();
    return { userKnowledgeService, initializationError: null };
  } catch (error) {
    const initializationError = `Failed to initialize UserKnowledgeService: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return { userKnowledgeService: null, initializationError };
  }
}

export function registerKnowledgeRoutes(app: any): any {
  return app.group('/api/v1/knowledge', (app: any) =>
    withOptionalAuth(app)
      // POST /
      .group('', (g: any) =>
        withRequiredAuth(g)
          .post('/', async ({ set, body, user }) => {
            const userId = user!.id;
            const { userKnowledgeService, initializationError } = await getServices();
            if (initializationError) {
              set.status = 503;
              return { error: 'Knowledge service not available', details: initializationError };
            }

            const requestData = Array.isArray(body) ? body : [body];
            const knowledgeItems = requestData.map((item: any) =>
              item?.source
                ? item
                : {
                    content: item.content,
                    type: item.type || 'document',
                    tags: item.tags || [],
                    source: {
                      type: 'USER_INPUT',
                      identifier: item.title || `upload-${Date.now()}`,
                      metadata: {
                        uploadedAt: new Date().toISOString(),
                        title: item.title,
                        category: item.category,
                        ...item?.metadata,
                      },
                    },
                    confidence: 0.8,
                  }
            );
            for (const i of knowledgeItems) {
              if (!i.content) {
                set.status = 400;
                return { error: 'Each knowledge item must have content' };
              }
            }
            const result = await userKnowledgeService!.addKnowledge(userId, knowledgeItems);
            set.status = 201;
            return {
              success: true,
              data: result,
              message: `Successfully added ${result.processedCount} knowledge items`,
            };
          })

          // PATCH /:itemId
          .patch('/:itemId', async ({ set, params, body, user }) => {
            const userId = user!.id;
            const { userKnowledgeService, initializationError } = await getServices();
            if (initializationError) {
              set.status = 503;
              return { error: 'Knowledge service not available', details: initializationError };
            }
            const itemId = (params as any).itemId as string;
            if (!itemId) {
              set.status = 400;
              return { error: 'Item ID is required' };
            }
            if (!body || Object.keys(body as any).length === 0) {
              set.status = 400;
              return { error: 'Update data is required' };
            }
            try {
              const updated = await userKnowledgeService!.updateKnowledge(userId, itemId, body);
              return {
                success: true,
                data: updated,
                message: 'Knowledge item updated successfully',
              };
            } catch (error: any) {
              if (error instanceof Error && error.message.includes('not found or not accessible')) {
                set.status = 404;
                return {
                  error: 'Knowledge item not found or access denied',
                  details: error.message,
                };
              }
              set.status = 500;
              return {
                error: 'Failed to update knowledge item',
                details: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          })

          // DELETE /:itemId
          .delete('/:itemId', async ({ set, params, user }) => {
            const userId = user!.id;
            const { userKnowledgeService, initializationError } = await getServices();
            if (initializationError) {
              set.status = 503;
              return { error: 'Knowledge service not available', details: initializationError };
            }
            const itemId = (params as any).itemId as string;
            if (!itemId) {
              set.status = 400;
              return { error: 'Item ID is required' };
            }
            try {
              await userKnowledgeService!.deleteKnowledge(userId, itemId);
              return { success: true, message: 'Knowledge item deleted successfully' };
            } catch (error: any) {
              if (error instanceof Error && error.message.includes('not found or not accessible')) {
                set.status = 404;
                return {
                  error: 'Knowledge item not found or access denied',
                  details: error.message,
                };
              }
              set.status = 500;
              return {
                error: 'Failed to delete knowledge item',
                details: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          })

          // GET /tags/:tag
          .get('/tags/:tag', async ({ set, params, query, user }) => {
            const userId = user!.id;
            const { userKnowledgeService, initializationError } = await getServices();
            if (initializationError) {
              set.status = 503;
              return { error: 'Knowledge service not available', details: initializationError };
            }
            const tag = (params as any).tag as string;
            const limit = Number((query as any).limit ?? 20);
            const items = await userKnowledgeService!.getKnowledgeByTags(userId, [tag], limit);
            return {
              success: true,
              data: items,
              message: `Found ${items.length} items with tag "${tag}"`,
            };
          })

          // GET /stats
          .get('/stats', async ({ set, user }) => {
            const userId = user!.id;
            const { userKnowledgeService, initializationError } = await getServices();
            if (initializationError) {
              set.status = 503;
              return { error: 'Knowledge service not available', details: initializationError };
            }
            const stats = await userKnowledgeService!.getUserKnowledgeStats(userId);
            return {
              success: true,
              data: stats,
              message: 'Knowledge statistics retrieved successfully',
            };
          })

          // GET /:itemId/related
          .get('/:itemId/related', async ({ set, params, user }) => {
            const userId = user!.id;
            const itemId = (params as any).itemId as string;
            const { userKnowledgeService, initializationError } = await getServices();
            if (initializationError) {
              set.status = 503;
              return { error: 'Knowledge service not available', details: initializationError };
            }
            if (!itemId) {
              set.status = 400;
              return { error: 'Item ID is required' };
            }
            const related = await userKnowledgeService!.findRelatedKnowledge(userId, itemId);
            return {
              success: true,
              data: related,
              message: `Found ${related.length} related items`,
            };
          })

          // GET /graph
          .get('/graph', async ({ set, query, user }) => {
            const userId = user!.id;
            const { userKnowledgeService, initializationError } = await getServices();
            if (initializationError) {
              set.status = 503;
              return { error: 'Knowledge service not available', details: initializationError };
            }
            const limit = Number((query as any).limit ?? 50);
            const types = (query as any).types
              ? String((query as any).types).split(',')
              : undefined;
            const tags = (query as any).tags ? String((query as any).tags).split(',') : undefined;
            const includeRelationships =
              String((query as any).includeRelationships ?? 'true') === 'true';
            const searchRequest = {
              query: '',
              filters: { types, tags },
              options: { limit, includeRelationships },
              timestamp: Date.now(),
            };
            const result = await userKnowledgeService!.search(userId, searchRequest as any);
            const nodes = result.items.map((item: any) => ({
              id: item.id,
              type: 'knowledge',
              data: {
                label: item.content.substring(0, 50) + (item.content.length > 50 ? '...' : ''),
                knowledgeType: item.type,
                tags: item.tags,
                confidence: item.confidence,
                sourceType: item.sourceType,
                createdAt: item.createdAt,
                fullContent: item.content,
              },
            }));
            const edges: any[] = [];
            if (includeRelationships) {
              for (const item of result.items) {
                try {
                  const rel = await userKnowledgeService!.findRelatedKnowledge(userId, item.id);
                  rel.forEach((r: any) => {
                    if (result.items.some((i: any) => i.id === r.id)) {
                      edges.push({
                        id: `${item.id}-${r.id}`,
                        source: item.id,
                        target: r.id,
                        type: 'relationship',
                        data: { relationshipType: 'related', confidence: 0.8 },
                      });
                    }
                  });
                } catch {}
              }
            }
            return {
              success: true,
              data: {
                nodes,
                edges,
                metadata: {
                  totalNodes: nodes.length,
                  totalEdges: edges.length,
                  searchMetadata: result.searchMetadata,
                },
              },
              message: `Retrieved knowledge graph with ${nodes.length} nodes and ${edges.length} relationships`,
            };
          })

          // GET /graph/relationships/:itemId
          .get('/graph/relationships/:itemId', async ({ set, params, query, user }) => {
            const userId = user!.id;
            const { userKnowledgeService, initializationError } = await getServices();
            if (initializationError) {
              set.status = 503;
              return { error: 'Knowledge service not available', details: initializationError };
            }
            const itemId = (params as any).itemId as string;
            const limit = Number((query as any).limit ?? 20);
            if (!itemId) {
              set.status = 400;
              return { error: 'Item ID is required' };
            }
            const item = await userKnowledgeService!.getKnowledgeItem(userId, itemId);
            if (!item) {
              set.status = 404;
              return { error: 'Knowledge item not found or not accessible' };
            }
            const relationshipTypes = (query as any).relationshipTypes
              ? String((query as any).relationshipTypes).split(',')
              : undefined;
            const related = await userKnowledgeService!.findRelatedKnowledge(
              userId,
              itemId,
              relationshipTypes
            );
            const relationships = related
              .slice(0, limit)
              .map((rel: any) => ({
                id: `${itemId}-${rel.id}`,
                source: itemId,
                target: rel.id,
                type: 'relationship',
                data: {
                  relationshipType: 'related',
                  confidence: 0.8,
                  targetItem: {
                    id: rel.id,
                    label: rel.content.substring(0, 50) + (rel.content.length > 50 ? '...' : ''),
                    knowledgeType: rel.type,
                    tags: rel.tags,
                  },
                },
              }));
            return {
              success: true,
              data: { itemId, relationships, totalCount: related.length },
              message: `Found ${relationships.length} relationships for knowledge item`,
            };
          })

          // POST /sync
          .post('/sync', async ({ set, user }) => {
            const userId = user!.id;
            const { userKnowledgeService, initializationError } = await getServices();
            if (initializationError) {
              set.status = 503;
              return { error: 'Knowledge service not available', details: initializationError };
            }
            const {
              KnowledgeBootstrapService,
              DatabaseService,
              QdrantService,
              SmartEmbeddingService,
            } = await import('@uaip/shared-services');
            const databaseService = DatabaseService.getInstance();
            const qdrantService = new QdrantService();
            await databaseService.initialize();
            const embeddingService = new SmartEmbeddingService({
              preferTEI: true,
              fallbackToOpenAI: false,
            });
            const knowledgeRepository = await databaseService.getKnowledgeRepository();
            const toolGraphDatabase = await databaseService.getToolGraphDatabase();
            const bootstrap = new KnowledgeBootstrapService(
              knowledgeRepository,
              qdrantService,
              toolGraphDatabase,
              embeddingService
            );
            const result = await bootstrap.runPostSeedSync();
            return {
              success: true,
              data: result,
              message: 'Knowledge clustering sync completed successfully',
            };
          })
      )

      // GET /
      .get('/', async ({ set, query, user }) => {
        if (!user) {
          set.status = 401;
          return { error: 'User not authenticated' };
        }
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const limit = Number((query as any).limit ?? 50);
        const offset = Number((query as any).offset ?? 0);
        const tags = (query as any).tags ? String((query as any).tags).split(',') : undefined;
        const types = (query as any).types ? String((query as any).types).split(',') : undefined;
        const searchRequest = {
          query: '',
          filters: { tags, types },
          options: { limit, offset, includeRelationships: false },
          timestamp: Date.now(),
        };
        const result = await userKnowledgeService!.search(userId, searchRequest as any);
        return {
          success: true,
          data: result.items,
          meta: { total: result.totalCount, limit, offset, searchMetadata: result.searchMetadata },
          message: `Retrieved ${result.items.length} knowledge items`,
        };
      })

      // GET /search
      .get('/search', async ({ set, query, user }) => {
        if (!user) {
          set.status = 401;
          return { error: 'User not authenticated' };
        }
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const q = (query as any).q as string | undefined;
        if (!q) {
          set.status = 400;
          return { error: 'Query parameter "q" is required' };
        }
        const tags = (query as any).tags ? String((query as any).tags).split(',') : undefined;
        const types = (query as any).types ? String((query as any).types).split(',') : undefined;
        const limit = Number((query as any).limit ?? 20);
        const confidence = (query as any).confidence
          ? Number((query as any).confidence)
          : undefined;
        const includeRelationships =
          String((query as any).includeRelationships ?? 'false') === 'true';
        const searchRequest = {
          query: q,
          filters: { tags, types, confidence },
          options: { limit, includeRelationships },
          timestamp: Date.now(),
        };
        const result = await userKnowledgeService!.search(userId, searchRequest as any);
        return {
          success: true,
          data: result,
          message: `Found ${result.totalCount} knowledge items`,
        };
      })

      // GET /health (public)
      .get('/health', async () => {
        const healthStatus = await servicesHealthCheck();
        const ok = (healthStatus as any).healthy;
        if (ok)
          return { success: true, data: healthStatus, message: 'Knowledge services are healthy' };
        return new Response(
          JSON.stringify({
            success: false,
            data: healthStatus,
            message: 'Knowledge services are not healthy',
          }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        );
      })
  );
}

export default registerKnowledgeRoutes;
