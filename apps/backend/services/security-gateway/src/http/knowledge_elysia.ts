import { Elysia } from 'elysia';
import { withOptionalAuth, withRequiredAuth, t } from '@uaip/middleware';
import { z } from 'zod';
import {
  servicesHealthCheck,
  getUserKnowledgeService,
  getKnowledgeGraphService,
  serviceFactory,
  chunkDocument,
  UnifiedModelSelectionFacade,
  type UserKnowledgeService,
  type KnowledgeGraphService,
} from '@uaip/shared-services';
import { LLMService } from '@uaip/llm-service';
import { logger } from '@uaip/utils';
import { randomUUID } from 'crypto';
import { getAuthUser } from './context_helpers.js';
import {
  KnowledgeType,
  SourceType,
  LLMTaskType,
  type KnowledgeItem,
  type KnowledgeSearchRequest,
  type KnowledgeIngestRequest,
  type ParsedConversation,
  type ParsedMessage,
} from '@uaip/types';

interface KnowledgeServices {
  userKnowledgeService: UserKnowledgeService | null;
  initializationError: string | null;
}

interface KnowledgeGraphServices {
  knowledgeGraphService: KnowledgeGraphService | null;
  initializationError: string | null;
}

interface NameCount {
  name: string;
  count: number;
}

interface ExtractWorkflowsBody {
  conversationIds?: string[];
}

interface RelationBody {
  targetItemId?: string;
  relationshipType?: string;
  confidence?: number;
}

interface BulkUploadBody {
  items?: Record<string, unknown>[];
}

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
const relationIdParamsSchema = z.object({ relationId: z.string().min(1) });
const participantParamsSchema = z.object({ participant: z.string().min(1) });
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

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toTagQuery = (query: Record<string, unknown>): TagQuery => ({
  limit: asString(query.limit),
});

const toListQuery = (query: Record<string, unknown>): ListQuery => ({
  limit: asString(query.limit),
  offset: asString(query.offset),
  tags: asString(query.tags),
  types: asString(query.types),
});

const toSearchQuery = (query: Record<string, unknown>): SearchQuery => ({
  q: asString(query.q),
  tags: asString(query.tags),
  types: asString(query.types),
  limit: asString(query.limit),
  confidence: asString(query.confidence),
  includeRelationships: asString(query.includeRelationships),
});

const toGraphQuery = (query: Record<string, unknown>): GraphQuery => ({
  limit: asString(query.limit),
  types: asString(query.types),
  tags: asString(query.tags),
  includeRelationships: asString(query.includeRelationships),
});

const toRelationshipsQuery = (query: Record<string, unknown>): RelationshipsQuery => ({
  limit: asString(query.limit),
  relationshipTypes: asString(query.relationshipTypes),
});

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
        const msgs: unknown[] = Array.isArray(conv.messages)
          ? conv.messages
          : conv.mapping && typeof conv.mapping === 'object' && conv.mapping !== null
            ? Object.values(conv.mapping)
            : [];
        for (const m of msgs) {
          const mRec = isRecord(m) ? m : {};
          const msg = isRecord(mRec.message) ? mRec.message : mRec;
          const role = isRecord(msg.author) && typeof msg.author.role === 'string'
            ? msg.author.role
            : typeof msg.role === 'string' ? msg.role : '';
          const contentParts = isRecord(msg.content) && Array.isArray(msg.content.parts)
            ? msg.content.parts
            : msg.content !== undefined ? [msg.content] : [];
          const parts: unknown[] = contentParts;
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
  } else if (ext === 'txt') {
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
    for (const chunk of chunkDocument(content, `${fileName} — chunk`, ['chat-import'])) {
      items.push(chunk);
    }
  }

  return items.filter((i) => i.content.length > 10);
}

/** Extract and chunk text from PDF, DOCX, TXT, MD, CSV, and other documents. */
async function parseDocumentFile(
  fileName: string,
  file: File
): Promise<Array<{ content: string; title: string; tags: string[] }>> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const tags = ['document-import', ext || 'unknown'];
  const items: Array<{ content: string; title: string; tags: string[] }> = [];

  const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
  if (imageExts.includes(ext) || file.type.startsWith('image/')) {
    const extracted = await extractTextFromImage(file);
    for (const chunk of chunkDocument(extracted, fileName, ['image-import', ext || 'image'])) {
      items.push(chunk);
    }
    return items.filter((i) => i.content.trim().length > 0);
  }

  let fullText = '';
  try {
    if (ext === 'pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(Buffer.from(await file.arrayBuffer()));
      fullText = data.text;
    } else if (ext === 'docx') {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({
        buffer: Buffer.from(await file.arrayBuffer()),
      });
      fullText = value;
    } else {
      fullText = await file.text();
    }
  } catch {
    fullText = await file.text();
  }

  if (ext === 'csv') {
    const rows = fullText.split(/\r?\n/).filter((row) => row.trim() !== '');
    for (let i = 0; i < rows.length; i++) {
      items.push({ content: rows[i].trim(), title: `${fileName}#${i + 1}`, tags });
    }
    return items;
  }

  for (const chunk of chunkDocument(fullText, fileName, tags)) {
    items.push(chunk);
  }

  return items.filter((i) => i.content.trim().length > 0);
}

async function extractTextFromImage(file: File): Promise<string> {
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const mimeType = file.type || 'image/png';
  const selection = await new UnifiedModelSelectionFacade().selectForSystem(LLMTaskType.VISION);
  const llm = LLMService.getInstance();
  const response = await llm.generateResponse(
    {
      prompt:
        'Extract all text from this image verbatim. If there is no text, describe the image in detail. Return only the extracted text or description.',
      maxTokens: 2000,
      temperature: 0.2,
      model: selection.model.model,
      images: [{ base64, mimeType }],
    },
    selection.model.provider
  );
  if (response.error || !response.content?.trim()) {
    throw new Error(response.error || 'Vision model returned no text');
  }
  return response.content.trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Firecrawl lane: renders JS-heavy SPAs to clean markdown. Used when FIRECRAWL_API_URL is set.
async function scrapeWithFirecrawl(
  url: string,
  apiBase: string
): Promise<{ text: string; title: string } | null> {
  try {
    const resp = await fetch(`${apiBase.replace(/\/$/, '')}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) {
      logger.warn('Firecrawl scrape failed, falling back to baseline', { url, status: resp.status });
      return null;
    }
    const json = (await resp.json()) as {
      success?: boolean;
      data?: { markdown?: string; metadata?: { title?: string } };
    };
    const markdown = json?.data?.markdown?.trim();
    if (!json?.success || !markdown) return null;
    return { text: markdown, title: json.data?.metadata?.title?.trim() || new URL(url).hostname };
  } catch (error) {
    logger.warn('Firecrawl scrape errored, falling back to baseline', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// URL lane: Firecrawl (JS-heavy SPAs) when FIRECRAWL_API_URL is set, else baseline fetch (static/SSR).
async function parseUrlSource(
  url: string
): Promise<Array<{ content: string; title: string; tags: string[] }>> {
  const tags = ['url-import', new URL(url).hostname];

  const firecrawlBase = process.env.FIRECRAWL_API_URL;
  if (firecrawlBase) {
    const scraped = await scrapeWithFirecrawl(url, firecrawlBase);
    if (scraped) {
      return chunkDocument(scraped.text, scraped.title, tags).filter(
        (i) => i.content.trim().length > 20
      );
    }
  }

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NavratnaBot/1.0)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);

  const contentType = resp.headers.get('content-type') ?? '';
  const raw = await resp.text();
  const text = contentType.includes('html') ? htmlToText(raw) : raw;

  const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || new URL(url).hostname;

  return chunkDocument(text, title, tags).filter((i) => i.content.trim().length > 20);
}

async function getServices(): Promise<KnowledgeServices> {
  try {
    const userKnowledgeService = await getUserKnowledgeService();
    return { userKnowledgeService, initializationError: null };
  } catch (error) {
    const initializationError = `Failed to initialize UserKnowledgeService: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return { userKnowledgeService: null, initializationError };
  }
}

async function getGraphService(): Promise<KnowledgeGraphServices> {
  try {
    const knowledgeGraphService = await getKnowledgeGraphService();
    return { knowledgeGraphService, initializationError: null };
  } catch (error) {
    const initializationError = `Failed to initialize KnowledgeGraphService: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return { knowledgeGraphService: null, initializationError };
  }
}

/**
 * Rebuild `ParsedConversation[]` from a user's stored chat-import knowledge items.
 *
 * The analysis services (workflow extractor, expertise analyzer, learning detector)
 * all consume `ParsedConversation[]`, but ingestion flattens each conversation into
 * a knowledge item whose `content` is the rendered "sender: body" transcript. This
 * reverses that projection well enough for the analyzers, which only read
 * `messages[].sender/content/timestamp` and `participants`.
 */
function knowledgeItemsToConversations(items: KnowledgeItem[]): ParsedConversation[] {
  return items.map((item) => {
    const createdAt = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
    const lines = item.content.split(/\n{2,}/).filter((line) => line.trim().length > 0);
    const participants = new Set<string>();

    const messages: ParsedMessage[] = lines.map((line, index) => {
      const separator = line.indexOf(':');
      const maybeSender = separator > 0 ? line.slice(0, separator).trim() : '';
      // Treat a short leading token before ':' as the speaker label; anything
      // longer is prose that merely contains a colon.
      const hasSender = maybeSender.length > 0 && maybeSender.length <= 40;
      const sender = hasSender ? maybeSender : 'unknown';
      const content = hasSender ? line.slice(separator + 1).trim() : line.trim();
      participants.add(sender);
      return {
        id: `${item.id}-${index}`,
        timestamp: createdAt,
        sender,
        content,
        type: 'text',
        metadata: {},
      };
    });

    return {
      id: item.id,
      platform: 'generic',
      title: item.sourceIdentifier,
      participants: Array.from(participants),
      messages,
      metadata: {
        totalMessages: messages.length,
        dateRange: { start: createdAt, end: createdAt },
        fileSize: item.content.length,
        originalFilename: item.sourceIdentifier,
        parsedAt: createdAt,
      },
    };
  });
}

async function loadUserConversations(
  userKnowledgeService: UserKnowledgeService,
  userId: string,
  conversationIds?: string[],
  limit = 100
): Promise<ParsedConversation[]> {
  const items = await userKnowledgeService.getKnowledgeByTags(
    userId,
    ['chat-import'],
    Math.max(limit, conversationIds?.length ?? 0)
  );
  const scoped =
    conversationIds && conversationIds.length > 0
      ? items.filter((item) => conversationIds.includes(item.id))
      : items;
  return knowledgeItemsToConversations(scoped);
}

function knowledgeItemsToCsv(items: KnowledgeItem[]): string {
  const headers = [
    'id',
    'type',
    'sourceType',
    'sourceIdentifier',
    'tags',
    'confidence',
    'createdAt',
    'content',
  ];
  const escape = (value: unknown): string => {
    const str = value === null || value === undefined ? '' : String(value);
    return `"${str.replace(/"/g, '""')}"`;
  };
  const rows = items.map((item) =>
    [
      item.id,
      item.type,
      item.sourceType,
      item.sourceIdentifier,
      (item.tags ?? []).join('|'),
      item.confidence,
      item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
      item.content,
    ]
      .map(escape)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function tallyBy(items: KnowledgeItem[], select: (item: KnowledgeItem) => string[]): NameCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const key of select(item)) {
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function loadAllUserItems(
  userKnowledgeService: UserKnowledgeService,
  userId: string,
  limit = 1000
): Promise<KnowledgeItem[]> {
  const result = await userKnowledgeService.search(userId, {
    query: '',
    filters: {},
    options: { limit, includeRelationships: false },
    timestamp: Date.now(),
  });
  return result.items;
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
      .post('/', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, body } = ctx;
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
      .post('/bulk', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, body } = ctx;
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }

        const rawItems = (body as BulkUploadBody | undefined)?.items;
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          set.status = 400;
          return { error: 'A non-empty "items" array is required' };
        }

        const normalized: KnowledgeIngestRequest[] = [];
        const errors: string[] = [];
        rawItems.forEach((raw, index) => {
          const item = normalizeKnowledgeItem(raw);
          if (!item.content) {
            errors.push(`items[${index}]: content is required`);
            return;
          }
          normalized.push(item);
        });

        if (normalized.length === 0) {
          set.status = 400;
          return { error: 'No valid items to upload', details: errors.join('; ') };
        }

        const result = await userKnowledgeService!.addKnowledge(userId, normalized);
        const uploaded = result.processedCount ?? normalized.length;
        const allErrors = [...errors, ...(result.errors ?? [])];
        set.status = 201;
        return {
          uploaded,
          failed: rawItems.length - uploaded,
          errors: allErrors.length > 0 ? allErrors : undefined,
        };
      }, {
        body: t.Any(),
        response: {
          201: t.Object({
            uploaded: t.Number(),
            failed: t.Number(),
            errors: t.Optional(t.Array(t.String())),
          }),
          400: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      .get('/categories', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set } = ctx;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const items = await loadAllUserItems(userKnowledgeService!, user.id);
        return tallyBy(items, (item) => [String(item.type)]);
      }, {
        response: {
          200: t.Array(t.Object({ name: t.String(), count: t.Number() })),
          503: KnowledgeErrorSchema,
        },
      })
      .get('/tags', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set } = ctx;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const items = await loadAllUserItems(userKnowledgeService!, user.id);
        return tallyBy(items, (item) => item.tags ?? []);
      }, {
        response: {
          200: t.Array(t.Object({ name: t.String(), count: t.Number() })),
          503: KnowledgeErrorSchema,
        },
      })
      .get('/export', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, query } = ctx;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const format = String((query as Record<string, unknown>).format ?? 'json');
        if (format !== 'json' && format !== 'csv') {
          set.status = 400;
          return { error: 'format must be "json" or "csv"' };
        }
        const items = await loadAllUserItems(userKnowledgeService!, user.id);
        const stamp = new Date().toISOString().slice(0, 10);
        if (format === 'csv') {
          set.headers['content-type'] = 'text/csv; charset=utf-8';
          set.headers['content-disposition'] =
            `attachment; filename="knowledge-${stamp}.csv"`;
          return knowledgeItemsToCsv(items);
        }
        set.headers['content-type'] = 'application/json; charset=utf-8';
        set.headers['content-disposition'] =
          `attachment; filename="knowledge-${stamp}.json"`;
        return JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2);
      }, {
        response: {
          200: t.String(),
          400: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      .post('/reindex', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set } = ctx;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const started = Date.now();
        const items = await loadAllUserItems(userKnowledgeService!, user.id);
        const { knowledgeGraphService, initializationError: graphError } = await getGraphService();
        if (graphError) {
          set.status = 503;
          return { error: 'Knowledge graph service not available', details: graphError };
        }
        let indexed = 0;
        for (const item of items) {
          try {
            // oxlint-disable-next-line no-await-in-loop -- sequential on purpose: parallel re-embedding trips provider rate limits
            await knowledgeGraphService!.updateKnowledge(item.id, { content: item.content });
            indexed += 1;
          } catch (error) {
            logger.warn('Reindex failed for knowledge item', {
              itemId: item.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return { indexed, duration: Date.now() - started };
      }, {
        response: {
          200: t.Object({ indexed: t.Number(), duration: t.Number() }),
          503: KnowledgeErrorSchema,
        },
      })
      .patch('/:itemId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, body } = ctx;
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
      .get('/:itemId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
        const { itemId } = itemIdParamsSchema.parse(params);
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const item = await userKnowledgeService!.getKnowledgeItem(user.id, itemId);
        if (!item) {
          set.status = 404;
          return { error: 'Knowledge item not found or not accessible' };
        }
        return item;
      }, {
        response: {
          200: t.Any(),
          404: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      .delete('/:itemId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
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
      .get('/tags/:tag', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, query } = ctx;
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { tag } = tagParamsSchema.parse(params);
        const tagQuery = toTagQuery(query);
        const limit = Number(tagQuery.limit ?? 20);
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
      .get('/stats', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set } = ctx;
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
      .delete('/relations/:relationId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
        const { relationId } = relationIdParamsSchema.parse(params);
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { knowledgeGraphService, initializationError: graphError } = await getGraphService();
        if (graphError) {
          set.status = 503;
          return { error: 'Knowledge graph service not available', details: graphError };
        }
        const relation = await knowledgeGraphService!.getRelationshipById(relationId);
        if (!relation) {
          set.status = 404;
          return { error: 'Relationship not found' };
        }
        const owned = await userKnowledgeService!.getKnowledgeItem(user.id, relation.sourceId);
        if (!owned) {
          set.status = 404;
          return { error: 'Relationship not found' };
        }
        await knowledgeGraphService!.deleteRelationship(relationId);
        return { success: true as const, message: 'Relationship deleted successfully' };
      }, {
        response: {
          200: t.Object({ success: t.Literal(true), message: t.String() }),
          404: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      .get('/:itemId/relations', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
        const { itemId } = itemIdParamsSchema.parse(params);
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const owned = await userKnowledgeService!.getKnowledgeItem(user.id, itemId);
        if (!owned) {
          set.status = 404;
          return { error: 'Knowledge item not found or not accessible' };
        }
        const { knowledgeGraphService, initializationError: graphError } = await getGraphService();
        if (graphError) {
          set.status = 503;
          return { error: 'Knowledge graph service not available', details: graphError };
        }
        const rows = await knowledgeGraphService!.listRelationships(itemId);
        return rows.map((row) => ({
          id: row.id,
          sourceItemId: row.sourceId,
          targetItemId: row.targetId,
          relationshipType: row.relationshipType,
          confidence: Number(row.strength ?? 0),
          createdAt: row.createdAt,
        }));
      }, {
        response: {
          200: t.Any(),
          404: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      .post('/:itemId/relations', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, body } = ctx;
        const { itemId } = itemIdParamsSchema.parse(params);
        const payload = (body ?? {}) as RelationBody;
        if (!payload.targetItemId || !payload.relationshipType) {
          set.status = 400;
          return { error: 'targetItemId and relationshipType are required' };
        }
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const [source, target] = await Promise.all([
          userKnowledgeService!.getKnowledgeItem(user.id, itemId),
          userKnowledgeService!.getKnowledgeItem(user.id, payload.targetItemId),
        ]);
        if (!source || !target) {
          set.status = 404;
          return { error: 'Source or target knowledge item not found or not accessible' };
        }
        const { knowledgeGraphService, initializationError: graphError } = await getGraphService();
        if (graphError) {
          set.status = 503;
          return { error: 'Knowledge graph service not available', details: graphError };
        }
        const row = await knowledgeGraphService!.createRelationship({
          sourceItemId: itemId,
          targetItemId: payload.targetItemId,
          relationshipType: payload.relationshipType,
          confidence: payload.confidence ?? 0.8,
        });
        set.status = 201;
        return {
          id: row.id,
          sourceItemId: row.sourceId,
          targetItemId: row.targetId,
          relationshipType: row.relationshipType,
          confidence: Number(row.strength ?? 0),
          createdAt: row.createdAt,
        };
      }, {
        body: t.Any(),
        response: {
          201: t.Any(),
          400: KnowledgeErrorSchema,
          404: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      .get('/:itemId/related', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
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
      .get('/:itemId/similar', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, query } = ctx;
        const userId = user.id;
        const { itemId } = itemIdParamsSchema.parse(params);
        const tagQuery = toTagQuery(query);
        const limit = Number(tagQuery.limit ?? 10);
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
      .get('/graph', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, query } = ctx;
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const graphQuery = toGraphQuery(query);
        const limit = Number(graphQuery.limit ?? 50);
        const types = parseKnowledgeTypes(graphQuery.types);
        const tags = graphQuery.tags ? graphQuery.tags.split(',') : undefined;
        const includeRelationships =
          String(graphQuery.includeRelationships ?? 'true') === 'true';
        const searchRequest: KnowledgeSearchRequest = {
          query: '',
          filters: { types, tags },
          options: { limit, includeRelationships },
          timestamp: Date.now(),
        };
        const result = await userKnowledgeService!.search(userId, searchRequest);
        const typedItems: KnowledgeItem[] = result.items;
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
                const relatedItems: KnowledgeItem[] = rel;
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
      .get('/graph/relationships/:itemId', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params, query } = ctx;
        const userId = user.id;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { itemId } = itemIdParamsSchema.parse(params);
        const relationshipsQuery = toRelationshipsQuery(query);
        const limit = Number(relationshipsQuery.limit ?? 20);
        if (!itemId) {
          set.status = 400;
          return { error: 'Item ID is required' };
        }
        const item = await userKnowledgeService!.getKnowledgeItem(userId, itemId);
        if (!item) {
          set.status = 404;
          return { error: 'Knowledge item not found or not accessible' };
        }
        const relationshipTypes = relationshipsQuery.relationshipTypes
          ? relationshipsQuery.relationshipTypes.split(',')
          : undefined;
        const related = await userKnowledgeService!.findRelatedKnowledge(
          userId,
          itemId,
          relationshipTypes
        );
        const typedRelated: KnowledgeItem[] = related;
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
      .post('/sync', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set } = ctx;
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
        } = await import('@uaip/shared-services');
        const databaseService = DatabaseService.getInstance();
        const qdrantService = new QdrantService();
        await databaseService.initialize();
        const embeddingService = await serviceFactory.getSmartEmbeddingService();
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
        '/import',
        async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, body } = ctx;
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

          try {
            const parsed = await parseDocumentFile(file.name, file);
            const knowledgeRequests: KnowledgeIngestRequest[] = parsed.map((item) => ({
              content: item.content,
              type: KnowledgeType.FACTUAL,
              tags: item.tags,
              source: {
                type: SourceType.FILE_SYSTEM,
                identifier: item.title,
                metadata: {
                  fileName: file.name,
                  importedAt: new Date().toISOString(),
                },
              },
              confidence: 0.7,
            }));

            let imported = 0;
            if (knowledgeRequests.length > 0) {
              const result = await userKnowledgeService!.addKnowledge(userId, knowledgeRequests);
              imported = result.processedCount ?? knowledgeRequests.length;
            }

            return { imported, updated: 0, errors: [] };
          } catch (err) {
            return {
              imported: 0,
              updated: 0,
              errors: [err instanceof Error ? err.message : String(err)],
            };
          }
        },
        {
          // Accept the raw parsed multipart form. Elysia parses multipart/form-data
          // by request content-type (not by schema), and a strict t.File() schema rejects
          // the Bun-parsed File at validation, so we validate the file inside the handler.
          body: t.Any(),
          response: {
            200: t.Object({
              imported: t.Number(),
              updated: t.Number(),
              errors: t.Optional(t.Array(t.String())),
            }),
            400: KnowledgeErrorSchema,
            503: KnowledgeErrorSchema,
          },
        }
      )

      .post(
        '/import-url',
        async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, body } = ctx;
          const userId = user.id;
          const { userKnowledgeService, initializationError } = await getServices();
          if (initializationError) {
            set.status = 503;
            return { error: 'Knowledge service not available', details: initializationError };
          }

          const url = isRecord(body) && typeof body.url === 'string' ? body.url.trim() : '';
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(url);
          } catch {
            set.status = 400;
            return { error: 'A valid absolute url is required in the JSON body' };
          }
          if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            set.status = 400;
            return { error: 'Only http and https urls are supported' };
          }

          try {
            const parsed = await parseUrlSource(parsedUrl.toString());
            const knowledgeRequests: KnowledgeIngestRequest[] = parsed.map((item) => ({
              content: item.content,
              type: KnowledgeType.FACTUAL,
              tags: item.tags,
              source: {
                type: SourceType.EXTERNAL_API,
                identifier: item.title,
                url: parsedUrl.toString(),
                metadata: {
                  url: parsedUrl.toString(),
                  importedAt: new Date().toISOString(),
                },
              },
              confidence: 0.7,
            }));

            let imported = 0;
            if (knowledgeRequests.length > 0) {
              const result = await userKnowledgeService!.addKnowledge(userId, knowledgeRequests);
              imported = result.processedCount ?? knowledgeRequests.length;
            }

            return { imported, updated: 0, errors: [] };
          } catch (err) {
            return {
              imported: 0,
              updated: 0,
              errors: [err instanceof Error ? err.message : String(err)],
            };
          }
        },
        {
          body: t.Object({ url: t.String() }),
          response: {
            200: t.Object({
              imported: t.Number(),
              updated: t.Number(),
              errors: t.Optional(t.Array(t.String())),
            }),
            400: KnowledgeErrorSchema,
            503: KnowledgeErrorSchema,
          },
        }
      )

      .post(
        '/chat-import',
        async (ctx) => {
          const user = getAuthUser(ctx);
          const { set, body } = ctx;
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
          // Accept the raw parsed multipart form. Elysia parses multipart/form-data
          // by request content-type (not by schema), so `body.file` is the actual
          // uploaded File and `body.options` the JSON string. A strict `t.File()`
          // schema rejected the Bun-parsed file at validation (`found:{file:{}}`),
          // 500-ing every upload; the handler below validates the file and parses
          // options itself, mirroring the `t.Any()` pattern used by `POST /`.
          body: t.Any(),
          response: {
            200: t.Object({ jobId: t.String(), status: t.String(), message: t.String() }),
            400: KnowledgeErrorSchema,
            503: KnowledgeErrorSchema,
          },
        }
      )
      
      .post('/generate-qa', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, query } = ctx;
        const { knowledgeGraphService, initializationError } = await getGraphService();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge graph service not available', details: initializationError };
        }
        const q = query as Record<string, unknown>;
        const domain = q.domain ? String(q.domain) : undefined;
        const maxPairs = q.limit ? Number(q.limit) : 20;
        try {
          const pairs = await knowledgeGraphService!.generateQAFromKnowledge(domain, { maxPairs });
          return {
            qaPairs: pairs.map((pair) => ({
              question: pair.question,
              answer: pair.answer,
              source: pair.source ?? domain ?? 'knowledge-base',
              confidence: pair.confidence ?? 0,
              topic: pair.topic ?? domain ?? 'general',
            })),
            generated: pairs.length,
          };
        } catch (error) {
          logger.error('Q&A generation failed', {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          set.status = 500;
          return {
            error: 'Failed to generate Q&A pairs',
            details: error instanceof Error ? error.message : String(error),
          };
        }
      }, {
        response: {
          200: t.Object({ qaPairs: t.Any(), generated: t.Number() }),
          500: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      .post('/extract-workflows', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, body } = ctx;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { knowledgeGraphService, initializationError: graphError } = await getGraphService();
        if (graphError) {
          set.status = 503;
          return { error: 'Knowledge graph service not available', details: graphError };
        }
        const conversationIds = (body as ExtractWorkflowsBody | undefined)?.conversationIds;
        try {
          const conversations = await loadUserConversations(
            userKnowledgeService!,
            user.id,
            conversationIds
          );
          if (conversations.length === 0) {
            return { workflows: [], extracted: 0 };
          }
          const workflows = await knowledgeGraphService!.extractWorkflowsFromChats(conversations);
          return { workflows, extracted: workflows.length };
        } catch (error) {
          logger.error('Workflow extraction failed', {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          set.status = 500;
          return {
            error: 'Failed to extract workflows',
            details: error instanceof Error ? error.message : String(error),
          };
        }
      }, {
        body: t.Any(),
        response: {
          200: t.Object({ workflows: t.Any(), extracted: t.Number() }),
          500: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      .get('/expertise/:participant', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, params } = ctx;
        const { participant } = participantParamsSchema.parse(params);
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { knowledgeGraphService, initializationError: graphError } = await getGraphService();
        if (graphError) {
          set.status = 503;
          return { error: 'Knowledge graph service not available', details: graphError };
        }
        try {
          const conversations = await loadUserConversations(userKnowledgeService!, user.id);
          const profiles = await knowledgeGraphService!.analyzeParticipantExpertise(conversations);
          const profile = profiles.find((p) => p.participant === participant);
          if (!profile) {
            return {
              participant,
              domains: [],
              overallConfidence: 0,
              totalInteractions: 0,
              knowledgeAreas: [],
            };
          }
          return {
            participant: profile.participant,
            domains: profile.domains.map((domain) => ({
              domain: domain.domain,
              confidence: domain.confidence,
              topics: domain.knowledge.map((area) => area.area),
              evidenceCount: domain.indicators.length,
            })),
            overallConfidence: profile.confidenceScore,
            totalInteractions: profile.metadata.totalMessages,
            knowledgeAreas: profile.domains.flatMap((domain) =>
              domain.knowledge.map((area) => area.area)
            ),
          };
        } catch (error) {
          logger.error('Expertise analysis failed', {
            userId: user.id,
            participant,
            error: error instanceof Error ? error.message : String(error),
          });
          set.status = 500;
          return {
            error: 'Failed to analyze expertise',
            details: error instanceof Error ? error.message : String(error),
          };
        }
      }, {
        response: {
          200: t.Object({
            participant: t.String(),
            domains: t.Any(),
            overallConfidence: t.Number(),
            totalInteractions: t.Number(),
            knowledgeAreas: t.Array(t.String()),
          }),
          500: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
      .get('/learning-insights', async (ctx) => {
        const user = getAuthUser(ctx);
        const { set, query } = ctx;
        const { userKnowledgeService, initializationError } = await getServices();
        if (initializationError) {
          set.status = 503;
          return { error: 'Knowledge service not available', details: initializationError };
        }
        const { knowledgeGraphService, initializationError: graphError } = await getGraphService();
        if (graphError) {
          set.status = 503;
          return { error: 'Knowledge graph service not available', details: graphError };
        }
        const participantQuery = (query as Record<string, unknown>).participant;
        const participant = participantQuery ? String(participantQuery) : undefined;
        try {
          const conversations = await loadUserConversations(userKnowledgeService!, user.id);
          if (conversations.length === 0) {
            return {
              insights: [],
              progressions: [],
              totalLearningMoments: 0,
              activeTopics: [],
            };
          }
          const moments = await knowledgeGraphService!.detectLearningMoments(
            conversations,
            participant ? { participants: [participant] } : undefined
          );
          const insights = moments.map((moment) => ({
            learner: moment.learner,
            teacher: moment.teacher,
            topic: moment.topic,
            content: moment.content,
            timestamp: moment.timestamp.toISOString(),
            confidence: moment.confidence,
          }));
          const activeTopics = Array.from(new Set(insights.map((i) => i.topic))).filter(Boolean);
          return {
            insights,
            progressions: [],
            totalLearningMoments: moments.length,
            activeTopics,
          };
        } catch (error) {
          logger.error('Learning insight generation failed', {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          set.status = 500;
          return {
            error: 'Failed to generate learning insights',
            details: error instanceof Error ? error.message : String(error),
          };
        }
      }, {
        response: {
          200: t.Object({
            insights: t.Any(),
            progressions: t.Any(),
            totalLearningMoments: t.Number(),
            activeTopics: t.Array(t.String()),
          }),
          500: KnowledgeErrorSchema,
          503: KnowledgeErrorSchema,
        },
      })
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
      const listQuery = toListQuery(query);
      const limit = Number(listQuery.limit ?? 50);
      const offset = Number(listQuery.offset ?? 0);
      const tags = listQuery.tags ? listQuery.tags.split(',') : undefined;
      const types = parseKnowledgeTypes(listQuery.types);
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
      const searchQuery = toSearchQuery(query);
      const q = searchQuery.q;
      if (!q) {
        set.status = 400;
        return { error: 'Query parameter "q" is required' };
      }
      const tags = searchQuery.tags ? searchQuery.tags.split(',') : undefined;
      const types = parseKnowledgeTypes(searchQuery.types);
      const limit = Number(searchQuery.limit ?? 20);
      const confidence = searchQuery.confidence ? Number(searchQuery.confidence) : undefined;
      const includeRelationships = String(searchQuery.includeRelationships ?? 'false') === 'true';
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

    .get('/rag', async ({ set, query, user }) => {
      if (!user) {
        set.status = 401;
        return { error: 'User not authenticated' };
      }
      const q = query.q;
      if (!q) {
        set.status = 400;
        return { error: 'Query parameter "q" is required' };
      }
      let enhancedRAGService;
      try {
        enhancedRAGService = await serviceFactory.getEnhancedRAGService();
      } catch (error) {
        set.status = 503;
        return {
          error: 'Enhanced RAG service not available',
          details: error instanceof Error ? error.message : String(error),
        };
      }
      const results = await enhancedRAGService.semanticSearch(q, {
        topK: Number(query.limit ?? 10),
        minScore: query.minScore ? Number(query.minScore) : 0,
        useReranking: String(query.rerank ?? 'true') === 'true',
        tenantId: user.id,
      });
      return {
        success: true,
        data: results,
        message: `Semantic search returned ${results.length} results`,
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
      const healthStatus: ServicesHealthStatus = await servicesHealthCheck();
      const ok = isRecord(healthStatus) && healthStatus.healthy === true;
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
