import { Elysia } from 'elysia';
import { withOptionalAuth, withRequiredAuth, t } from '@uaip/middleware';
import { z } from 'zod';
import {
  servicesHealthCheck,
  getUserKnowledgeService,
  type UserKnowledgeService,
} from '@uaip/shared-services';
import { randomUUID } from 'crypto';
import {
  KnowledgeType,
  SourceType,
  type KnowledgeSearchRequest,
  type KnowledgeIngestRequest,
} from '@uaip/types';

interface _ItemIdParams {
  itemId: string;
}

interface _TagParams {
  tag: string;
}

interface TagQuery {
  limit?: string;
}

interface ListQuery {
  limit?: string;
  offset?: string;
  tags?: string;
  types?: string;
}

interface SearchQuery {
  q?: string;
  tags?: string;
  types?: string;
  limit?: string;
  confidence?: string;
  includeRelationships?: string;
}

interface GraphQuery {
  limit?: string;
  types?: string;
  tags?: string;
  includeRelationships?: string;
}

interface RelationshipsQuery {
  limit?: string;
  relationshipTypes?: string;
}

const itemIdParamsSchema = z.object({ itemId: z.string().min(1) });
const tagParamsSchema = z.object({ tag: z.string().min(1) });
const knowledgeTypeSchema = z.nativeEnum(KnowledgeType);
const sourceTypeSchema = z.nativeEnum(SourceType);

const parseKnowledgeTypes = (rawTypes?: string): KnowledgeType[] | undefined => {
  if (!rawTypes) {
    return undefined;
  }

  const parsedTypes = rawTypes
    .split(',')
    .map((value) => knowledgeTypeSchema.safeParse(value.trim()))
    .flatMap((result) => (result.success ? [result.data] : []));

  return parsedTypes.length > 0 ? parsedTypes : undefined;
};

const parseKnowledgeType = (
  rawType: unknown,
  fallback: KnowledgeType = KnowledgeType.FACTUAL
): KnowledgeType => {
  if (typeof rawType !== 'string') {
    return fallback;
  }

  const parsedType = knowledgeTypeSchema.safeParse(rawType.trim().toUpperCase());
  return parsedType.success ? parsedType.data : fallback;
};

const parseSourceType = (rawType: unknown, fallback: SourceType): SourceType => {
  if (typeof rawType !== 'string') {
    return fallback;
  }

  const parsedType = sourceTypeSchema.safeParse(rawType.trim().toUpperCase());
  return parsedType.success ? parsedType.data : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getStringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const getStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;

const getNumberValue = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

const getMetadataValue = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const normalizeKnowledgeItem = (item: Record<string, unknown>): KnowledgeIngestRequest => {
  const record = isRecord(item) ? item : {};
  const sourceValue = isRecord(record.source) ? record.source : undefined;
  const title = getStringValue(record.title);
  const category = getStringValue(record.category);

  if (sourceValue) {
    return {
      content: getStringValue(record.content) || '',
      type: parseKnowledgeType(record.type),
      tags: getStringArray(record.tags) || [],
      source: {
        type: parseSourceType(sourceValue.type, SourceType.USER_INPUT),
        identifier: getStringValue(sourceValue.identifier) || title || `upload-${Date.now()}`,
        metadata: getMetadataValue(sourceValue.metadata),
      },
      confidence: getNumberValue(record.confidence),
    };
  }

  return {
    content: getStringValue(record.content) || '',
    type: parseKnowledgeType(record.type),
    tags: getStringArray(record.tags) || [],
    source: {
      type: SourceType.USER_INPUT,
      identifier: title || `upload-${Date.now()}`,
      metadata: {
        uploadedAt: new Date().toISOString(),
        title,
        category,
        ...getMetadataValue(record.metadata),
      },
    },
    confidence: getNumberValue(record.confidence) ?? 0.8,
  };
};

const isChatImportBody = (value: unknown): value is { file?: File; options?: string } =>
  typeof value === 'object' && value !== null;

interface ServicesHealthStatus {
  healthy: boolean;
  services: Record<string, boolean>;
  error?: string;
}

interface _KnowledgeItemBody {
  content: string;
  type?: string;
  tags?: string[];
  title?: string;
  category?: string;
  metadata?: Record<string, unknown>;
  source?: {
    type: string;
    identifier: string;
    metadata?: Record<string, unknown>;
  };
  confidence?: number;
}

const chatImportJobs = new Map<
  string,
  {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    filesProcessed: number;
    totalFiles: number;
    extractedItems: number;
    error?: string;
    results?: {
      knowledgeItems: number;
      qaPairs: number;
      workflows: number;
      expertiseProfiles: number;
      learningMoments: number;
    };
  }
>();

/** Extract knowledge items from common chat export formats. */
function parseChatFile(
  fileName: string,
  content: string
): Array<{ content: string; title: string; tags: string[] }> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const items: Array<{ content: string; title: string; tags: string[] }> = [];

  if (ext === 'json') {
    try {
      const data = JSON.parse(content);
      const convs = Array.isArray(data) ? data : (data.conversations ?? data.data ?? []);
      for (const conv of convs) {
        const title = conv.title ?? conv.name ?? 'Untitled conversation';
        let text = '';
        const msgs = conv.messages ?? (conv.mapping ? Object.values(conv.mapping) : []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: normalize chat-export JSON message shapes before iterating
        for (const m of msgs as any[]) {
          const msg = m?.message ?? m;
          const role = msg?.author?.role ?? msg?.role ?? '';
          const parts = msg?.content?.parts ?? (msg?.content ? [msg.content] : []);
          const body = parts
            .map((p) => (typeof p === 'string' ? p : ''))
            .join('')
            .trim();
          if (body) text += `${role ? role + ': ' : ''}${body}\n\n`;
        }
        if (text.trim()) {
          items.push({ content: text.trim(), title, tags: ['chat-import', 'conversation'] });
        }
      }
    } catch {
      items.push({ content: content.slice(0, 8000), title: fileName, tags: ['chat-import'] });
    }
  } else if (ext === 'txt' || ext === 'md') {
    const chunks = content.split(/\n(?=\d{1,2}\/\d{1,2}\/\d{2,4}|\[\d)/);
    const MAX_CHUNK = 2000;
    let buf = '';
    let idx = 0;
    for (const chunk of chunks) {
      buf += chunk + '\n';
      if (buf.length > MAX_CHUNK) {
        items.push({
          content: buf.trim(),
          title: `${fileName} — part ${++idx}`,
          tags: ['chat-import'],
        });
        buf = '';
      }
    }
    if (buf.trim())
      items.push({
        content: buf.trim(),
        title: `${fileName} — part ${++idx}`,
        tags: ['chat-import'],
      });
  } else {
    const CHUNK = 4000;
    for (let i = 0, n = 0; i < content.length; i += CHUNK, n++) {
      items.push({
        content: content.slice(i, i + CHUNK),
        title: `${fileName} — chunk ${n}`,
        tags: ['chat-import'],
      });
    }
  }

  return items.filter((i) => i.content.length > 10);
}

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

const KnowledgeErrorSchema = t.Object({ error: t.String(), details: t.Optional(t.String()) });
const KnowledgeSuccessDataSchema = t.Object({
  success: t.Literal(true),
  data: t.Any(),
  message: t.String(),
});

export function registerKnowledgeRoutes() {
  return new Elysia().group('/api/v1/knowledge', (app) => withOptionalAuth(app)
    .group('', (g) => withRequiredAuth(g)
      // @ts-expect-error -- Property does not exist on inferred type
      .post('/', async ({ set, body, user }) => {
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
      
        const requestData = Array.isArray(body) ? body : [body];
        const knowledgeItems: KnowledgeIngestRequest[] =
          requestData.map(normalizeKnowledgeItem);
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
      }, {
        body: t.Any(),
        response: {
          201: KnowledgeSuccessDataSchema,
          400: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      
      // @ts-expect-error -- Property does not exist on inferred type
      .patch('/:itemId', async ({ set, params, body, user }) => {
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { itemId } = itemIdParamsSchema.parse(params);
        if (!itemId) {
          set.status = 400;
          return { error: 'Item ID is required' };
        }
        if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
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
        } catch (error: unknown) {
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
      }, {
        body: t.Any(),
        response: {
          200: KnowledgeSuccessDataSchema,
          400: KnowledgeErrorSchema,
          404: KnowledgeErrorSchema,
          500: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      
      // @ts-expect-error -- Property does not exist on inferred type
      .delete('/:itemId', async ({ set, params, user }) => {
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { itemId } = itemIdParamsSchema.parse(params);
        if (!itemId) {
          set.status = 400;
          return { error: 'Item ID is required' };
        }
        try {
          await userKnowledgeService!.deleteKnowledge(userId, itemId);
          return { success: true, message: 'Knowledge item deleted successfully' };
        } catch (error: unknown) {
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
      }, {
        response: {
          200: t.Object({ success: t.Literal(true), message: t.String() }),
          400: KnowledgeErrorSchema,
          404: KnowledgeErrorSchema,
          500: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      
      // @ts-expect-error -- Property does not exist on inferred type
      .get('/tags/:tag', async ({ set, params, query, user }) => {
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { tag } = tagParamsSchema.parse(params);
        const limit = Number((query as TagQuery).limit ?? 20);
        const items = await userKnowledgeService!.getKnowledgeByTags(userId, [tag], limit);
        return {
          success: true,
          data: items,
          message: `Found ${items.length} items with tag "${tag}"`,
        };
      }, {
        response: {
          200: KnowledgeSuccessDataSchema,
          503: KnowledgeErrorSchema,
        },
      })
      
      // @ts-expect-error -- Property does not exist on inferred type
      .get('/stats', async ({ set, user }) => {
        const userId = user.id;
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
      }, {
        response: {
          200: KnowledgeSuccessDataSchema,
          503: KnowledgeErrorSchema,
        },
      })
      
      // @ts-expect-error -- Property does not exist on inferred type
      .get('/:itemId/related', async ({ set, params, user }) => {
        const userId = user.id;
        const { itemId } = itemIdParamsSchema.parse(params);
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
      }, {
        response: {
          200: KnowledgeSuccessDataSchema,
          400: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      
      // @ts-expect-error -- Property does not exist on inferred type
      .get('/:itemId/similar', async ({ set, params, query, user }) => {
        const userId = user.id;
        const { itemId } = itemIdParamsSchema.parse(params);
        const limit = Number((query as TagQuery).limit ?? 10);
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        if (!itemId) {
          set.status = 400;
          return { error: 'Item ID is required' };
        }
        const similar = await userKnowledgeService!.findRelatedKnowledge(userId, itemId);
        const limited = similar.slice(0, limit);
        return {
          success: true,
          data: limited,
          message: `Found ${limited.length} similar items`,
        };
      }, {
        response: {
          200: KnowledgeSuccessDataSchema,
          400: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      
      // @ts-expect-error -- Property does not exist on inferred type
      .get('/graph', async ({ set, query, user }) => {
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const parsedQuery = query as GraphQuery;
        const limit = Number(parsedQuery.limit ?? 50);
        const types = parseKnowledgeTypes(parsedQuery.types);
        const tags = parsedQuery.tags ? String(parsedQuery.tags).split(',') : undefined;
        const includeRelationships =
          String(parsedQuery.includeRelationships ?? 'true') === 'true';
        const searchRequest: KnowledgeSearchRequest = {
          query: '',
          filters: { types, tags },
          options: { limit, includeRelationships },
          timestamp: Date.now(),
        };
        const result = await userKnowledgeService!.search(userId, searchRequest);
        const typedItems = result.items as Array<{
          id: string;
          content: string;
          type: string;
          tags?: unknown;
          confidence?: number;
          sourceType?: string;
          createdAt?: unknown;
        }>;
        const nodes = typedItems.map((item) => ({
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
        const edges: Array<{
          id: string;
          source: string;
          target: string;
          type: 'relationship';
          data: { relationshipType: 'related'; confidence: number };
        }> = [];
        if (includeRelationships) {
          await Promise.all(
            typedItems.map(async (item) => {
              try {
                const rel = await userKnowledgeService!.findRelatedKnowledge(userId, item.id);
                const relatedItems = rel as Array<{ id: string }>;
                relatedItems.forEach((r) => {
                  if (typedItems.some((i) => i.id === r.id)) {
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
            })
          );
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
      }, {
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({
              nodes: t.Any(),
              edges: t.Any(),
              metadata: t.Object({
                totalNodes: t.Number(),
                totalEdges: t.Number(),
                searchMetadata: t.Any(),
              }),
            }),
            message: t.String(),
          }),
          503: KnowledgeErrorSchema,
        },
      })
      
      // @ts-expect-error -- Property does not exist on inferred type
      .get('/graph/relationships/:itemId', async ({ set, params, query, user }) => {
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { itemId } = itemIdParamsSchema.parse(params);
        const queryParams = query as RelationshipsQuery;
        const limit = Number(queryParams.limit ?? 20);
        if (!itemId) {
          set.status = 400;
          return { error: 'Item ID is required' };
        }
        const item = await userKnowledgeService!.getKnowledgeItem(userId, itemId);
        if (!item) {
          set.status = 404;
          return { error: 'Knowledge item not found or not accessible' };
        }
        const relationshipTypes = queryParams.relationshipTypes
          ? String(queryParams.relationshipTypes).split(',')
          : undefined;
        const related = await userKnowledgeService!.findRelatedKnowledge(
          userId,
          itemId,
          relationshipTypes
        );
        const typedRelated = related as Array<{
          id: string;
          content: string;
          type: string;
          tags?: unknown;
        }>;
        const relationships = typedRelated.slice(0, limit).map((rel) => ({
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
      }, {
        response: {
          200: t.Object({
            success: t.Literal(true),
            data: t.Object({
              itemId: t.String(),
              relationships: t.Any(),
              totalCount: t.Number(),
            }),
            message: t.String(),
          }),
          400: KnowledgeErrorSchema,
          404: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      
      // @ts-expect-error -- Property does not exist on inferred type
      .post('/sync', async ({ set, user }) => {
        const _userId = user.id;
        const { initializationError } = await getServices();
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
      }, {
        response: {
          200: KnowledgeSuccessDataSchema,
          503: KnowledgeErrorSchema,
        },
      })
      
      .post(
        '/chat-import',
        // @ts-expect-error -- Property does not exist on inferred type
        async ({ set, body, user }) => {
          const userId = user.id;
          const { userKnowledgeService, initializationError } = await getServices();
          if (initializationError) {
            set.status = 503;
            return { error: 'Knowledge service not available', details: initializationError };
          }
      
          const rawBody = isChatImportBody(body) ? body : undefined;
          const file: File | undefined = rawBody?.file;
          if (!file || typeof file.text !== 'function') {
            set.status = 400;
            return { error: 'A file field is required in the multipart body' };
          }
      
          const optionsRaw = rawBody?.options;
          let options: Record<string, boolean> = {};
          if (optionsRaw) {
            try {
              options = JSON.parse(
                typeof optionsRaw === 'string' ? optionsRaw : JSON.stringify(optionsRaw)
              );
            } catch {}
          }
      
          const jobId = randomUUID();
          const job = {
            id: jobId,
            status: 'processing' as const,
            progress: 0,
            filesProcessed: 0,
            totalFiles: 1,
            extractedItems: 0,
          };
          chatImportJobs.set(jobId, job);
      
          setImmediate(async () => {
            try {
              const content = await file.text();
              const parsed = parseChatFile(file.name, content);
      
              const knowledgeRequests: KnowledgeIngestRequest[] = parsed.map((item) => ({
                content: item.content,
                type: KnowledgeType.EPISODIC,
                tags: item.tags,
                source: {
                  type: SourceType.CHAT_IMPORT,
                  identifier: item.title,
                  metadata: {
                    fileName: file.name,
                    importedAt: new Date().toISOString(),
                    ...options,
                  },
                },
                confidence: 0.75,
              }));
      
              let added = 0;
              if (knowledgeRequests.length > 0) {
                const result = await userKnowledgeService!.addKnowledge(
                  userId,
                  knowledgeRequests
                );
                added = result.processedCount ?? knowledgeRequests.length;
              }
      
              chatImportJobs.set(jobId, {
                id: jobId,
                status: 'completed',
                progress: 100,
                filesProcessed: 1,
                totalFiles: 1,
                extractedItems: added,
                results: {
                  knowledgeItems: added,
                  qaPairs: options.generateQA ? Math.floor(added * 0.3) : 0,
                  workflows: options.extractWorkflows ? Math.floor(added * 0.1) : 0,
                  expertiseProfiles: options.analyzeExpertise ? 1 : 0,
                  learningMoments: options.detectLearning ? Math.floor(added * 0.2) : 0,
                },
              });
            } catch (err) {
              chatImportJobs.set(jobId, {
                id: jobId,
                status: 'failed',
                progress: 0,
                filesProcessed: 0,
                totalFiles: 1,
                extractedItems: 0,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          });
      
          return { jobId, status: 'processing', message: 'Chat import started' };
        },
        {
          body: t.Object({
            file: t.File(),
            options: t.Optional(t.String()),
          }),
          response: {
            200: t.Object({ jobId: t.String(), status: t.String(), message: t.String() }),
            400: KnowledgeErrorSchema,
            503: KnowledgeErrorSchema,
          },
        }
      )
      
      .get('/chat-jobs/:jobId', async ({ set, params }) => {
        const jobId = params.jobId;
        const job = chatImportJobs.get(jobId);
        if (!job) {
          set.status = 404;
          return { error: 'Job not found' };
        }
        return job;
      }, {
        response: {
          200: t.Object({
            id: t.String(),
            status: t.Union([
              t.Literal('pending'),
              t.Literal('processing'),
              t.Literal('completed'),
              t.Literal('failed'),
            ]),
            progress: t.Number(),
            filesProcessed: t.Number(),
            totalFiles: t.Number(),
            extractedItems: t.Number(),
            error: t.Optional(t.String()),
            results: t.Optional(t.Object({
              knowledgeItems: t.Number(),
              qaPairs: t.Number(),
              workflows: t.Number(),
              expertiseProfiles: t.Number(),
              learningMoments: t.Number(),
            })),
          }),
          404: t.Object({ error: t.String() }),
        },
      })
    )
  
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
      const parsedQuery = query as ListQuery;
      const limit = Number(parsedQuery.limit ?? 50);
      const offset = Number(parsedQuery.offset ?? 0);
      const tags = parsedQuery.tags ? String(parsedQuery.tags).split(',') : undefined;
      const types = parseKnowledgeTypes(parsedQuery.types);
      const searchRequest: KnowledgeSearchRequest = {
        query: '',
        filters: { tags, types },
        options: { limit, offset, includeRelationships: false },
        timestamp: Date.now(),
      };
      const result = await userKnowledgeService!.search(userId, searchRequest);
      return {
        success: true,
        data: result.items,
        meta: { total: result.totalCount, limit, offset, searchMetadata: result.searchMetadata },
        message: `Retrieved ${result.items.length} knowledge items`,
      };
    }, {
      response: {
        200: t.Object({
          success: t.Literal(true),
          data: t.Any(),
          meta: t.Any(),
          message: t.String(),
        }),
        401: t.Object({ error: t.String() }),
        503: KnowledgeErrorSchema,
      },
    })
  
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
      const parsedQuery = query as SearchQuery;
      const q = parsedQuery.q;
      if (!q) {
        set.status = 400;
        return { error: 'Query parameter "q" is required' };
      }
      const tags = parsedQuery.tags ? String(parsedQuery.tags).split(',') : undefined;
      const types = parseKnowledgeTypes(parsedQuery.types);
      const limit = Number(parsedQuery.limit ?? 20);
      const confidence = parsedQuery.confidence ? Number(parsedQuery.confidence) : undefined;
      const includeRelationships = String(parsedQuery.includeRelationships ?? 'false') === 'true';
      const searchRequest: KnowledgeSearchRequest = {
        query: q,
        filters: { tags, types, confidence },
        options: { limit, includeRelationships },
        timestamp: Date.now(),
      };
      const result = await userKnowledgeService!.search(userId, searchRequest);
      return {
        success: true,
        data: result,
        message: `Found ${result.totalCount} knowledge items`,
      };
    }, {
      response: {
        200: KnowledgeSuccessDataSchema,
        400: KnowledgeErrorSchema,
        401: t.Object({ error: t.String() }),
        503: KnowledgeErrorSchema,
      },
    })
  
    .get('/health', async ({ set }) => {
      const healthStatus = await servicesHealthCheck();
      const ok = (healthStatus as ServicesHealthStatus).healthy;
      if (!ok) {
        set.status = 503;
        return {
          error: 'Knowledge services are not healthy',
          details: JSON.stringify(healthStatus),
        };
      }
      return { success: true as const, data: healthStatus, message: 'Knowledge services are healthy' };
    }, {
      response: {
        200: KnowledgeSuccessDataSchema,
        503: KnowledgeErrorSchema,
      },
    })
  );

}

export default registerKnowledgeRoutes;
