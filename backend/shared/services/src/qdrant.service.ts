interface VectorSearchOptions {
  limit: number;
  threshold: number;
  filters?: unknown;
}

export type MemoryCollectionType = 'episodic' | 'semantic';

interface CollectionOptions {
  collection?: MemoryCollectionType;
}

interface VectorSearchResult {
  id: string;
  score: number;
  payload?: unknown;
}

export class QdrantService {
  private qdrantUrl: string;
  private isConnected: boolean = false;
  private embeddingDimensions: number;
  private collectionNames: Record<MemoryCollectionType, string>;

  constructor(
    qdrantUrl?: string,
    collectionName: string = 'knowledge_embeddings',
    embeddingDimensions: number = 1024
  ) {
    // Use environment variable or detect containerized environment
    this.qdrantUrl =
      qdrantUrl ||
      process.env.QDRANT_URL ||
      (() => {
        // Check multiple indicators for containerized environment
        const isDocker =
          process.env.DOCKER_ENV === 'true' ||
          process.env.NODE_ENV === 'production' ||
          process.env.KUBERNETES_SERVICE_HOST ||
          process.env.HOSTNAME?.includes('docker') ||
          (process.platform === 'linux' && process.env.container);

        return isDocker ? 'http://qdrant:6333' : 'http://localhost:6333';
      })();
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

      const data = await response.json();
      return data.result.map((item: unknown) => ({
        id: item.id,
        score: item.score,
        payload: item.payload,
      }));
    } catch (error) {
      console.error('Qdrant search error:', error);
      throw new Error(`Vector search failed: ${error.message}`, { cause: error });
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

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          points: points,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant storage failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Qdrant storage error:', error);
      throw new Error(`Vector storage failed: ${error.message}`, { cause: error });
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
      throw new Error(`Vector deletion failed: ${error.message}`, { cause: error });
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
      throw new Error(`Failed to ensure Qdrant collection: ${error.message}`, { cause: error });
    }
  }

  async storeVector(
    data: { knowledgeItemId: string; embeddings: number[][] },
    options: { collection: MemoryCollectionType }
  ): Promise<void> {
    await this.store(data.knowledgeItemId, data.embeddings, { collection: options.collection });
  }

  async getCollectionInfo(collectionOptions?: CollectionOptions): Promise<unknown> {
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
      throw new Error(`Failed to get collection info: ${error.message}`, { cause: error });
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
      throw new Error(`Failed to update embedding dimensions: ${error.message}`, { cause: error });
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
      throw new Error(`Failed to delete collection: ${error.message}`, { cause: error });
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
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

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

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          points: points,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant upsert failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Qdrant upsert error:', error);
      throw new Error(`Vector upsert failed: ${error.message}`, { cause: error });
    }
  }

  /**
   * Upsert points with UUID support for knowledge sync
   */
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

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ points }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant upsert failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Qdrant upsert error:', error);
      throw new Error(`Vector upsert failed: ${error.message}`, { cause: error });
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

      const data = await response.json();
      return data.result.map((item: unknown) => ({
        id: item.id,
        vector: item.vector,
        payload: item.payload,
      }));
    } catch (error) {
      console.error('Qdrant get points error:', error);
      throw new Error(`Vector get points failed: ${error.message}`, { cause: error });
    }
  }

  /**
   * Delete points by IDs
   */
  async deletePoints(ids: string[], collectionOptions?: CollectionOptions): Promise<void> {
    try {
      const workingUrl = await this.ensureConnection();
      const collectionName = this.getCollectionName(collectionOptions);

      const response = await fetch(`${workingUrl}/collections/${collectionName}/points/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          points: ids,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant delete points failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Qdrant delete points error:', error);
      throw new Error(`Vector delete points failed: ${error.message}`, { cause: error });
    }
  }

  /**
   * Get document by ID
   */
  async getById(documentId: string, collectionOptions?: CollectionOptions): Promise<unknown> {
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

      const data = await response.json();
      return {
        id: data.result.id,
        embedding: data.result.vector,
        content: data.result.payload?.content,
        metadata: data.result.payload,
      };
    } catch (error) {
      console.error('Qdrant get error:', error);
      throw new Error(`Vector get failed: ${error.message}`, { cause: error });
    }
  }
}
