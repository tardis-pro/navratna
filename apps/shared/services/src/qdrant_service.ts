import type {
  VectorSearchResult,
  MemoryCollectionType,
  CollectionOptions,
  VectorFilterValue,
  VectorSearchOptions,
} from '@uaip/types';
import { createHash } from 'node:crypto';

import { config } from '@uaip/config';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'qdrant-service',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

/**
 * Build a valid Qdrant filter with mandatory tenant isolation.
 * Qdrant filter format: { must: [{ key, match: { value } }, ...] }
 * tenantId is REQUIRED — throws if not provided.
 *
 * `additionalFilters` is a FLAT map of payload key -> scalar. It is deliberately
 * not a Qdrant filter object: passing one in used to produce
 * `{ key: 'must', match: { value: [ ...conditions ] } }`, which Qdrant rejects
 * with a whole-body "Expected some form of condition" parse error, silently
 * degrading every search to the Postgres fallback. A non-scalar now throws at
 * the call site instead of failing opaquely at the wire.
 */
export function buildVectorFilters(
  tenantId: string,
  additionalFilters?: Record<string, VectorFilterValue | undefined>,
  excludeIds?: string[]
): Record<string, unknown> {
  if (!tenantId) {
    throw new Error('tenantId is required for buildVectorFilters');
  }

  const mustClauses: Array<{ key: string; match: { value: VectorFilterValue } }> = [
    { key: 'tenant_id', match: { value: tenantId } },
  ];

  if (additionalFilters) {
    for (const [key, value] of Object.entries(additionalFilters)) {
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new Error(
          `Vector filter "${key}" must be a string, number or boolean — got ${Array.isArray(value) ? 'array' : typeof value}. ` +
            'Qdrant match conditions accept only scalars; filter on arrays/objects in Postgres instead.'
        );
      }
      mustClauses.push({ key, match: { value } });
    }
  }

  const filter: Record<string, unknown> = { must: mustClauses };
  if (excludeIds && excludeIds.length > 0) {
    filter.must_not = [{ has_id: excludeIds }];
  }
  return filter;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Fixed namespace for chunk point ids. Any constant UUID works; it only has to
 * stay stable, because changing it re-points every stored chunk and orphans the
 * existing collection.
 */
const CHUNK_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Deterministic point id for one chunk of one knowledge item (RFC 4122 v5).
 *
 * `store()` previously used the chunk INDEX as the point id, so every item's
 * chunk 0 was written as point `0` and each ingest overwrote the last one — the
 * collection collapsed to roughly `max(chunk_count)` points no matter how many
 * items existed. Qdrant accepts only an unsigned integer or a UUID as a point
 * id, so the id is derived rather than concatenated.
 *
 * Deterministic (not random) so that re-ingesting an item replaces its own
 * chunks instead of accumulating a second copy of them.
 */
export function chunkPointId(knowledgeItemId: string, chunkIndex: number): string {
  const namespace = Buffer.from(CHUNK_ID_NAMESPACE.replace(/-/g, ''), 'hex');
  const name = Buffer.from(`${knowledgeItemId}:${chunkIndex}`, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([namespace, name])).digest();

  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export class QdrantService {
  private qdrantUrl: string;
  private isConnected: boolean = false;
  private embeddingDimensions: number;
  private collectionNames: Record<MemoryCollectionType, string>;
  private apiKey?: string;

  constructor(
    qdrantUrl?: string,
    collectionName: string = 'knowledge_embeddings',
    embeddingDimensions: number = parseInt(process.env.QDRANT_VECTOR_DIM ?? '768', 10)
  ) {
    this.qdrantUrl = qdrantUrl || config.database.qdrant.url;
    this.embeddingDimensions = embeddingDimensions;
    this.collectionNames = this.resolveCollectionNames(collectionName);
    this.apiKey = config.database.qdrant.apiKey;
  }

  /**
   * Build request headers with optional Qdrant Cloud api-key.
   * Qdrant Cloud requires the `api-key` header on every request (including /healthz).
   */
  private qdrantHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...(extra ?? {}) };
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }
    return headers;
  }

  private resolveCollectionNames(baseCollectionName: string): Record<MemoryCollectionType, string> {
    if (baseCollectionName === 'memories') {
      return {
        episodic: 'episodic_memories',
        semantic: 'semantic_memories',
      };
    }

    return {
      episodic: `${baseCollectionName}_episodic`,
      semantic: baseCollectionName,
    };
  }

  private getCollectionName(options?: CollectionOptions): string {
    const collectionType = options?.collection || 'semantic';
    return this.collectionNames[collectionType];
  }

  private async putPoints(workingUrl: string, collectionName: string, points: unknown[]): Promise<void> {
    const response = await fetch(`${workingUrl}/collections/${collectionName}/points`, {
      method: 'PUT',
      headers: this.qdrantHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ points }),
    });
    if (!response.ok) {
      throw new Error(`Qdrant upsert failed: ${response.statusText}`);
    }
  }

  private isQdrantPoint(
    v: unknown
  ): v is { id: string | number; score: number; payload: Record<string, unknown> } {
    return (
      typeof v === 'object' &&
      v !== null &&
      'id' in v &&
      'score' in v &&
      'payload' in v
    );
  }

  /**
   * Callers treat `VectorSearchResult.id` as the KNOWLEDGE ITEM id and hydrate
   * it straight from Postgres, so the payload's `knowledge_item_id` is
   * authoritative and the raw point id is only a fallback.
   *
   * Chunked items store one point per chunk under a derived point id, so
   * returning `point.id` produced a lookup for a value that is not a row key at
   * all — in production that surfaced as `where id in ($1) params: 0`. Points
   * written by `upsert()` carry a payload id equal to their point id, so both
   * paths now report the same thing.
   */
  private mapSearchPoints(data: unknown): VectorSearchResult[] {
    if (typeof data !== 'object' || data === null || !('result' in data)) {
      return [];
    }
    const result: unknown = (data as { result: unknown })['result'];
    if (!Array.isArray(result)) {
      return [];
    }
    const mapped = result.filter(this.isQdrantPoint).map((point) => {
      const payloadId = point.payload?.['knowledge_item_id'];
      return {
        id: typeof payloadId === 'string' && payloadId ? payloadId : String(point.id),
        score: point.score,
        payload: point.payload,
      };
    });

    // Several chunks of one item can match the same query. They hydrate to the
    // same Postgres row, so emitting each one would spend the caller's limit
    // and the model's context window on repeats of a single document. Qdrant
    // returns points in descending score, so the first occurrence is the best.
    const bestPerItem = new Map<string, VectorSearchResult>();
    for (const hit of mapped) {
      if (!bestPerItem.has(hit.id)) bestPerItem.set(hit.id, hit);
    }
    return Array.from(bestPerItem.values());
  }

  private async deleteByIds(workingUrl: string, collectionName: string, ids: string[]): Promise<void> {
    const response = await fetch(`${workingUrl}/collections/${collectionName}/points/delete`, {
      method: 'POST',
      headers: this.qdrantHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ points: ids }),
    });
    if (!response.ok) {
      throw new Error(`Qdrant delete points failed: ${response.statusText}`);
    }
  }

  private async ensureConnection(): Promise<string> {
    if (this.isConnected) {
      return this.qdrantUrl;
    }

    const possibleUrls = [
      this.qdrantUrl,
      'http://qdrant:6333', // Docker Compose service name
      'http://uaip-qdrant-dev:6333', // Docker container name
      'http://uaip-qdrant:6333', // Alternative container name
      'http://localhost:6333',
      'http://127.0.0.1:6333',
    ];

    const findHealthyUrl = async (index: number): Promise<string> => {
      if (index >= possibleUrls.length) {
        throw new Error('Unable to connect to Qdrant service');
      }

      const url = possibleUrls[index];
      try {
        const healthResponse = await fetch(`${url}/healthz`, {
          headers: this.qdrantHeaders(),
          signal: AbortSignal.timeout(3000),
        });

        if (healthResponse.ok) {
          this.qdrantUrl = url;
          this.isConnected = true;
          return url;
        }
      } catch {}

      return findHealthyUrl(index + 1);
    };

    return findHealthyUrl(0);
  }

  async search(
    queryEmbedding: number[],
    options: VectorSearchOptions,
    collectionOptions?: CollectionOptions
  ): Promise<VectorSearchResult[]> {
    if (!options.tenantId) {
      throw new Error('tenantId is required for vector search');
    }
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const tenantFilter = buildVectorFilters(
        options.tenantId,
        options.filters,
        options.excludeIds
      );

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points/search`, {
        method: 'POST',
        headers: this.qdrantHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          vector: queryEmbedding,
          limit: options.limit,
          score_threshold: options.threshold,
          filter: tenantFilter,
          with_payload: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Qdrant search failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          querySize: queryEmbedding?.length,
        });
        throw new Error(`Qdrant search failed: ${response.statusText} - ${errorText}`);
      }

      const data: unknown = await response.json();
      return this.mapSearchPoints(data);
    } catch (error) {
      logger.error('Qdrant search error', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(
        `Vector search failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  async store(
    knowledgeItemId: string,
    tenantId: string,
    embeddings: number[][],
    collectionOptions?: CollectionOptions
  ): Promise<void> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      // The point id must be unique ACROSS items, not just within one. Using the
      // chunk index made every item's chunk 0 collide on point 0, so each ingest
      // silently destroyed the previous item's vectors.
      const points = embeddings.map((embedding, index) => ({
        id: chunkPointId(knowledgeItemId, index),
        vector: embedding,
        payload: {
          knowledge_item_id: knowledgeItemId,
          tenant_id: tenantId,
          chunk_index: index,
          created_at: new Date().toISOString(),
        },
      }));

      await this.putPoints(workingUrl, collectionName, points);
    } catch (error) {
      logger.error('Qdrant storage error', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector storage failed: ${_errMsg}`, { cause: error });
    }
  }

  async update(
    knowledgeItemId: string,
    tenantId: string,
    embeddings: number[][],
    collectionOptions?: CollectionOptions
  ): Promise<void> {
    await this.delete(knowledgeItemId, collectionOptions);
    await this.store(knowledgeItemId, tenantId, embeddings, collectionOptions);
  }

  async delete(knowledgeItemId: string, collectionOptions?: CollectionOptions): Promise<void> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points/delete`, {
        method: 'POST',
        headers: this.qdrantHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          filter: {
            must: [
              {
                key: 'knowledge_item_id',
                match: {
                  value: knowledgeItemId,
                },
              },
            ],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant deletion failed: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Qdrant deletion error', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector deletion failed: ${_errMsg}`, { cause: error });
    }
  }

  async initialize(): Promise<void> {
    await this.ensureCollectionForType('episodic');
    await this.ensureCollectionForType('semantic');
    await this.initializeTenantIndexes();
  }

  async initializeTenantIndexes(): Promise<void> {
    const collections = ['knowledge_embeddings_episodic', 'knowledge_embeddings', 'code_symbols'];
    let workingUrl: string;
    try {
      workingUrl = await this.ensureConnection();
    } catch {
      logger.warn('Qdrant not reachable — skipping tenant index creation');
      return;
    }
    for (const collection of collections) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential to avoid partial-failure race on concurrent index creation
        const response = await fetch(
          `${workingUrl}/collections/${collection}/index`,
          {
            method: 'PUT',
            headers: this.qdrantHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              field_name: 'tenant_id',
              field_schema: { type: 'keyword', is_tenant: true },
            }),
          }
        );
        if (!response.ok) {
          // oxlint-disable-next-line no-await-in-loop -- must read error body from the same response before loop continues
          const text = await response.text();
          if (response.status !== 400 || !text.includes('already exists')) {
            logger.warn('Could not create tenant_id index', { collection, status: response.status, text });
          }
        }
      } catch (err) {
        logger.warn('Error creating tenant_id index', {
          collection,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async ensureCollection(): Promise<void> {
    await this.initialize();
  }

  /** Create a Qdrant collection sized to the configured embedding dimension. */
  private async createCollection(workingUrl: string, collectionName: string): Promise<void> {
    const createResponse = await fetch(`${workingUrl}/collections/${collectionName}`, {
      method: 'PUT',
      headers: this.qdrantHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        vectors: {
          size: this.embeddingDimensions, // Dynamic embedding size
          distance: 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create Qdrant collection: ${createResponse.statusText}`);
    }
  }

  /** Extract the single unnamed vector's `size` from a GET /collections/{name} body. */
  private extractVectorSize(info: unknown): number | undefined {
    if (!isPlainRecord(info)) return undefined;
    const result = info['result'];
    if (!isPlainRecord(result)) return undefined;
    const params = isPlainRecord(result['config']) && isPlainRecord(result['config']['params'])
      ? result['config']['params']
      : undefined;
    const vectors = params && isPlainRecord(params['vectors']) ? params['vectors'] : undefined;
    const size = vectors ? vectors['size'] : undefined;
    return typeof size === 'number' ? size : undefined;
  }

  private async ensureCollectionForType(collectionType: MemoryCollectionType): Promise<void> {
    try {
      // Ensure we have a working connection first
      const workingUrl = await this.ensureConnection();
      const collectionName = this.collectionNames[collectionType];

      // Check if collection exists
      const checkResponse = await fetch(`${workingUrl}/collections/${collectionName}`, {
        headers: this.qdrantHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      if (checkResponse.status === 404) {
        // Create collection with dynamic embedding dimensions
        await this.createCollection(workingUrl, collectionName);
        return;
      }

      if (!checkResponse.ok) {
        throw new Error(`Unexpected response status: ${checkResponse.status}`);
      }

      // Collection exists — verify its vector dimension matches the configured one.
      // A dimension change (e.g. TEI 768 -> CF bge-large 1024) requires recreation:
      // Qdrant rejects vectors whose size differs from the collection's. The
      // knowledge vector store holds no durable data (embeddings are re-derivable),
      // so dropping and recreating on mismatch is safe and self-healing.
      const info: unknown = await checkResponse.json();
      const existingSize = this.extractVectorSize(info);
      if (existingSize !== undefined && existingSize !== this.embeddingDimensions) {
        logger.warn('Qdrant collection dimension mismatch — dropping and recreating', {
          collectionName,
          existingSize,
          configuredSize: this.embeddingDimensions,
        });
        const deleteResponse = await fetch(`${workingUrl}/collections/${collectionName}`, {
          method: 'DELETE',
          headers: this.qdrantHeaders(),
          signal: AbortSignal.timeout(5000),
        });
        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          throw new Error(
            `Failed to drop collection for recreation: ${deleteResponse.statusText}`
          );
        }
        await this.createCollection(workingUrl, collectionName);
        logger.info('Qdrant collection recreated at configured dimension', {
          collectionName,
          configuredSize: this.embeddingDimensions,
        });
      }
    } catch (error) {
      logger.error('Qdrant collection setup error', {
        error: error instanceof Error ? error.message : String(error),
        NODE_ENV: process.env.NODE_ENV,
        DOCKER_ENV: process.env.DOCKER_ENV,
        HOSTNAME: process.env.HOSTNAME,
        platform: process.platform,
      });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to ensure Qdrant collection: ${_errMsg}`, { cause: error });
    }
  }

  async storeVector(
    tenantId: string,
    data: { knowledgeItemId: string; embeddings: number[][] },
    options: { collection: MemoryCollectionType }
  ): Promise<void> {
    await this.store(data.knowledgeItemId, tenantId, data.embeddings, { collection: options.collection });
  }

  async getCollectionInfo(collectionOptions?: CollectionOptions): Promise<{
    result?: {
      config?: { params?: { vectors?: { size?: number } } };
      points_count?: number;
      vectors_count?: number;
      status?: string;
    };
    status?: string;
  }> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(`${workingUrl}/collections/${collectionName}`, {
        headers: this.qdrantHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to get collection info: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      logger.error('Qdrant collection info error', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get collection info: ${_errMsg}`, { cause: error });
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const workingUrl = await this.ensureConnection();
      const response = await fetch(`${workingUrl}/healthz`, {
        headers: this.qdrantHeaders(),
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Update embedding dimensions and recreate collection if necessary
   */
  async updateEmbeddingDimensions(newDimensions: number): Promise<void> {
    if (this.embeddingDimensions === newDimensions) {
      return; // No change needed
    }

    try {
      const _workingUrl = await this.ensureConnection();

      // Check current collection configuration
      const collectionInfo = await this.getCollectionInfo({ collection: 'semantic' });
      const currentDimensions = collectionInfo.result?.config?.params?.vectors?.size;

      if (currentDimensions !== newDimensions) {
        // Delete existing collection
        await this.deleteCollection({ collection: 'episodic' });
        await this.deleteCollection({ collection: 'semantic' });

        // Update dimensions
        this.embeddingDimensions = newDimensions;

        // Recreate collection with new dimensions
        await this.initialize();
      } else {
        // Just update our local configuration
        this.embeddingDimensions = newDimensions;
      }
    } catch (error) {
      logger.error('Failed to update embedding dimensions', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update embedding dimensions: ${_errMsg}`, { cause: error });
    }
  }

  /**
   * Delete the collection
   */
  async deleteCollection(collectionOptions?: CollectionOptions): Promise<void> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(`${workingUrl}/collections/${collectionName}`, {
        method: 'DELETE',
        headers: this.qdrantHeaders(),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete collection: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Qdrant collection deletion error', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete collection: ${_errMsg}`, { cause: error });
    }
  }

  /**
   * Get current embedding dimensions
   */
  getEmbeddingDimensions(): number {
    return this.embeddingDimensions;
  }

  /**
   * Upsert points (alternative to store for better performance)
   */
  async upsert(
    tenantId: string,
    documents: Array<{
      id: string;
      content: string;
      embedding: number[];
      metadata?: Record<string, unknown>;
    }>,
    collectionOptions?: CollectionOptions
  ): Promise<void> {
    const points = documents.map((doc) => ({
      id: doc.id,
      vector: doc.embedding,
      payload: {
        content: doc.content,
        knowledge_item_id: doc.id,
        tenant_id: tenantId,
        ...doc.metadata,
        created_at: new Date().toISOString(),
      },
    }));
    await this.upsertPoints(tenantId, points, collectionOptions);
  }

  async upsertPoints(
    tenantId: string,
    points: Array<{
      id: string;
      vector: number[];
      payload: Record<string, unknown>;
    }>,
    collectionOptions?: CollectionOptions
  ): Promise<void> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);
      const taggedPoints = points.map((p) => ({
        ...p,
        payload: { ...p.payload, tenant_id: tenantId },
      }));
      await this.putPoints(workingUrl, collectionName, taggedPoints);
    } catch (error) {
      logger.error('Qdrant upsert error', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector upsert failed: ${_errMsg}`, { cause: error });
    }
  }

  /**
   * Get points by IDs
   */
  async getPoints(
    ids: string[],
    collectionOptions?: CollectionOptions
  ): Promise<
    Array<{
      id: string;
      vector: number[];
      payload: Record<string, unknown>;
    }>
  > {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points`, {
        method: 'POST',
        headers: this.qdrantHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ids: ids,
          with_payload: true,
          with_vector: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant get points failed: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      if (typeof data !== 'object' || data === null || !('result' in data)) {
        return [];
      }
      const result: unknown = (data as { result: unknown }).result;
      if (!Array.isArray(result)) {
        return [];
      }
      return result
        .filter((item): item is { id: string; vector: number[]; payload: Record<string, unknown> } =>
          typeof item === 'object' && item !== null && 'id' in item && 'vector' in item && 'payload' in item
        )
        .map((point) => ({ id: point.id, vector: point.vector, payload: point.payload }));
    } catch (error) {
      logger.error('Qdrant get points error', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector get points failed: ${_errMsg}`, { cause: error });
    }
  }

  async deletePoints(ids: string[], collectionOptions?: CollectionOptions): Promise<void> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);
      await this.deleteByIds(workingUrl, collectionName, ids);
    } catch (error) {
      logger.error('Qdrant delete points error', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector delete points failed: ${_errMsg}`, { cause: error });
    }
  }

  /**
   * Get document by ID
   */
  async getById(
    documentId: string,
    collectionOptions?: CollectionOptions
  ): Promise<{
    id: string;
    embedding: number[];
    content: unknown;
    metadata: Record<string, unknown>;
  } | null> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(
        `${workingUrl}/collections/${collectionName}/points/${documentId}`,
        {
          method: 'GET',
          headers: this.qdrantHeaders({ 'Content-Type': 'application/json' }),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Qdrant get failed: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      if (!isPlainRecord(data) || !('result' in data)) {
        return null;
      }
      const result: unknown = data['result'];
      if (!isPlainRecord(result)) {
        return null;
      }
      const r: Record<string, unknown> = result;
      const payload: Record<string, unknown> =
        typeof r.payload === 'object' && r.payload !== null
          ? { ...r.payload }
          : {};
      return {
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        embedding: Array.isArray(r.vector)
          ? r.vector.filter((v): v is number => typeof v === 'number')
          : [],
        content: payload.content,
        metadata: payload,
      };
    } catch (error) {
      logger.error('Qdrant get error', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector get failed: ${_errMsg}`, { cause: error });
    }
  }

  async scrollAllQdrantPoints(
    tenantId: string,
    limit: number = 10000,
    collectionOptions?: CollectionOptions
  ): Promise<Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>> {
    if (!tenantId) {
      throw new Error('tenantId is required for scrollAllQdrantPoints');
    }
    return this.scrollAll(limit, collectionOptions, buildVectorFilters(tenantId));
  }

  async scrollAll(
    limit: number = 10000,
    collectionOptions?: CollectionOptions,
    tenantFilter?: Record<string, unknown>
  ): Promise<Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points/scroll`, {
        method: 'POST',
        headers: this.qdrantHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ limit, with_payload: true, with_vector: true, filter: tenantFilter }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant scroll failed: ${response.statusText}`);
      }

      const rawData: unknown = await response.json();
      const rawPoints: unknown[] = (() => {
        if (typeof rawData !== 'object' || rawData === null || !('result' in rawData)) return [];
        const res: unknown = (rawData as { result: unknown })['result'];
        if (typeof res !== 'object' || res === null || !('points' in res)) return [];
        const pts: unknown = (res as { points: unknown })['points'];
        return Array.isArray(pts) ? pts : [];
      })();
      return rawPoints
        .filter(
          (item): item is { id: string | number; vector: number[]; payload: Record<string, unknown> } =>
            typeof item === 'object' &&
            item !== null &&
            'id' in item &&
            'vector' in item &&
            'payload' in item
        )
        .map((p) => ({
          id: String(p.id),
          vector: p.vector ?? [],
          payload: p.payload ?? {},
        }));
    } catch (error) {
      logger.error('Qdrant scroll error', { error: error instanceof Error ? error.message : String(error) });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector scroll failed: ${_errMsg}`, { cause: error });
    }
  }
}
