import type {
  VectorSearchResult,
  MemoryCollectionType,
  CollectionOptions,
  VectorSearchOptions,
} from '@uaip/types';
import { config } from '@uaip/config';

export class QdrantService {
  private qdrantUrl: string;
  private isConnected: boolean = false;
  private embeddingDimensions: number;
  private collectionNames: Record<MemoryCollectionType, string>;

  constructor(
    qdrantUrl?: string,
    collectionName: string = 'knowledge_embeddings',
    embeddingDimensions: number = parseInt(process.env.QDRANT_VECTOR_DIM ?? '768', 10)
  ) {
    this.qdrantUrl = qdrantUrl || config.database.qdrant.url;
    this.embeddingDimensions = embeddingDimensions;
    this.collectionNames = this.resolveCollectionNames(collectionName);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });
    if (!response.ok) {
      throw new Error(`Qdrant upsert failed: ${response.statusText}`);
    }
  }

  private mapSearchPoints(data: Record<string, unknown>): VectorSearchResult[] {
    return (data.result as unknown[]).map((item: unknown) => {
      const point = item as { id: string; score: number; payload: Record<string, unknown> };
      return { id: point.id, score: point.score, payload: point.payload };
    });
  }

  private async deleteByIds(workingUrl: string, collectionName: string, ids: string[]): Promise<void> {
    const response = await fetch(`${workingUrl}/collections/${collectionName}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vector: queryEmbedding,
          limit: options.limit,
          score_threshold: options.threshold,
          filter: options.filters,
          with_payload: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Qdrant search error details:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          querySize: queryEmbedding?.length,
          options,
        });
        throw new Error(`Qdrant search failed: ${response.statusText} - ${errorText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      return this.mapSearchPoints(data);
    } catch (error) {
      console.error('Qdrant search error:', error);
      throw new Error(
        `Vector search failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  async store(
    knowledgeItemId: string,
    embeddings: number[][],
    collectionOptions?: CollectionOptions
  ): Promise<void> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const points = embeddings.map((embedding, index) => ({
        id: index,
        vector: embedding,
        payload: {
          knowledge_item_id: knowledgeItemId,
          chunk_index: index,
          created_at: new Date().toISOString(),
        },
      }));

      await this.putPoints(workingUrl, collectionName, points);
    } catch (error) {
      console.error('Qdrant storage error:', error);
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector storage failed: ${_errMsg}`, { cause: error });
    }
  }

  async update(
    knowledgeItemId: string,
    embeddings: number[][],
    collectionOptions?: CollectionOptions
  ): Promise<void> {
    // Delete existing embeddings for this knowledge item
    await this.delete(knowledgeItemId, collectionOptions);

    // Store new embeddings
    await this.store(knowledgeItemId, embeddings, collectionOptions);
  }

  async delete(knowledgeItemId: string, collectionOptions?: CollectionOptions): Promise<void> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      console.error('Qdrant deletion error:', error);
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector deletion failed: ${_errMsg}`, { cause: error });
    }
  }

  async initialize(): Promise<void> {
    await this.ensureCollectionForType('episodic');
    await this.ensureCollectionForType('semantic');
  }

  async ensureCollection(): Promise<void> {
    await this.initialize();
  }

  private async ensureCollectionForType(collectionType: MemoryCollectionType): Promise<void> {
    try {
      // Ensure we have a working connection first
      const workingUrl = await this.ensureConnection();
      const collectionName = this.collectionNames[collectionType];

      // Check if collection exists
      const checkResponse = await fetch(`${workingUrl}/collections/${collectionName}`, {
        signal: AbortSignal.timeout(5000),
      });

      if (checkResponse.status === 404) {
        // Create collection with dynamic embedding dimensions
        const createResponse = await fetch(`${workingUrl}/collections/${collectionName}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
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
      } else if (checkResponse.ok) {
      } else {
        throw new Error(`Unexpected response status: ${checkResponse.status}`);
      }
    } catch (error) {
      console.error('Qdrant collection setup error:', error);
      console.error('Environment info:', {
        NODE_ENV: process.env.NODE_ENV,
        DOCKER_ENV: process.env.DOCKER_ENV,
        HOSTNAME: process.env.HOSTNAME,
        platform: process.platform,
        container: process.env.container,
        KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST,
      });
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to ensure Qdrant collection: ${_errMsg}`, { cause: error });
    }
  }

  async storeVector(
    data: { knowledgeItemId: string; embeddings: number[][] },
    options: { collection: MemoryCollectionType }
  ): Promise<void> {
    await this.store(data.knowledgeItemId, data.embeddings, { collection: options.collection });
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

      const response = await fetch(`${workingUrl}/collections/${collectionName}`);

      if (!response.ok) {
        throw new Error(`Failed to get collection info: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('Qdrant collection info error:', error);
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get collection info: ${_errMsg}`, { cause: error });
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const workingUrl = await this.ensureConnection();
      const response = await fetch(`${workingUrl}/healthz`, {
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
      console.error('Failed to update embedding dimensions:', error);
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
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete collection: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Qdrant collection deletion error:', error);
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
        ...doc.metadata,
        created_at: new Date().toISOString(),
      },
    }));
    await this.upsertPoints(points, collectionOptions);
  }

  async upsertPoints(
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
      await this.putPoints(workingUrl, collectionName, points);
    } catch (error) {
      console.error('Qdrant upsert error:', error);
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: ids,
          with_payload: true,
          with_vector: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant get points failed: ${response.statusText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      return (data.result as unknown[]).map((item: unknown) => {
        const point = item as { id: string; vector: number[]; payload: Record<string, unknown> };
        return { id: point.id, vector: point.vector, payload: point.payload };
      });
    } catch (error) {
      console.error('Qdrant get points error:', error);
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
      console.error('Qdrant delete points error:', error);
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
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Qdrant get failed: ${response.statusText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const result = data.result as Record<string, unknown>;
      const payload = result.payload as Record<string, unknown>;
      return {
        id: result.id as string,
        embedding: result.vector as number[],
        content: payload?.content,
        metadata: payload,
      };
    } catch (error) {
      console.error('Qdrant get error:', error);
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector get failed: ${_errMsg}`, { cause: error });
    }
  }

  async scrollAll(
    limit: number = 10000,
    collectionOptions?: CollectionOptions
  ): Promise<Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit, with_payload: true, with_vector: true }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant scroll failed: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        result?: {
          points?: Array<{
            id: string | number;
            vector: number[];
            payload: Record<string, unknown>;
          }>;
        };
      };
      return (data.result?.points ?? []).map((p) => ({
        id: String(p.id),
        vector: p.vector ?? [],
        payload: p.payload ?? {},
      }));
    } catch (error) {
      console.error('Qdrant scroll error:', error);
      const _errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Vector scroll failed: ${_errMsg}`, { cause: error });
    }
  }
}
