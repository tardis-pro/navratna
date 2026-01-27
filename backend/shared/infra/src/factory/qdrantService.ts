/**
 * QdrantService - Vector database service for embeddings
 *
 * Provides vector search capabilities for knowledge graph embeddings
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { createLogger } from '@uaip/utils';

const logger = createLogger({
  serviceName: 'qdrant-service',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export interface QdrantServiceConfig {
  host: string;
  port: number;
  apiKey?: string;
  collection: string;
  dimension: number;
  waitUntilReady?: boolean;
}

export class QdrantService {
  private client: QdrantClient;
  private config: QdrantServiceConfig;
  private isInitialized: boolean = false;

  constructor(config: QdrantServiceConfig) {
    this.config = config;
    this.client = new QdrantClient({
      url: `http://${config.host}:${config.port}`,
      apiKey: config.apiKey,
    });
  }

  /**
   * Initialize Qdrant connection and ensure collection exists
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing Qdrant service...', {
        host: this.config.host,
        port: this.config.port,
        collection: this.config.collection,
        dimension: this.config.dimension,
      });

      // Ensure collection exists with proper configuration
      await this.ensureCollection();

      this.isInitialized = true;
      logger.info('Qdrant service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Qdrant service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Ensure collection exists with proper configuration
   */
  private async ensureCollection(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        (c: { name: string }) => c.name === this.config.collection
      );

      if (!collectionExists) {
        // Create collection with proper configuration
        await this.client.createCollection(this.config.collection, {
          vectors: {
            size: this.config.dimension,
            distance: 'Cosine',
          },
        });
        logger.info('Created Qdrant collection', {
          collection: this.config.collection,
          dimension: this.config.dimension,
        });
      }
    } catch (error) {
      logger.error('Failed to ensure Qdrant collection', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Upsert vectors into collection
   */
  public async upsertVectors(
    points: Array<{
      id: string | number;
      vector: number[];
      payload?: Record<string, any>;
    }>
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Qdrant service not initialized');
    }

    try {
      await this.client.upsert(this.config.collection, {
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      });

      logger.debug('Upserted vectors to Qdrant', {
        count: points.length,
        collection: this.config.collection,
      });
    } catch (error) {
      logger.error('Failed to upsert vectors', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Search for similar vectors
   */
  public async search(
    queryVector: number[],
    options?: {
      limit?: number;
      scoreThreshold?: number;
      filter?: Record<string, any>;
    }
  ): Promise<Array<{ id: string | number; score: number; payload: Record<string, any> }>> {
    if (!this.isInitialized) {
      throw new Error('Qdrant service not initialized');
    }

    try {
      const results = await this.client.search(this.config.collection, {
        vector: queryVector,
        limit: options?.limit ?? 10,
        score_threshold: options?.scoreThreshold,
        filter: options?.filter,
      });

      return results.map((r: any) => ({
        id: r.id as string | number,
        score: r.score,
        payload: r.payload as Record<string, any>,
      }));
    } catch (error) {
      logger.error('Failed to search vectors', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete vectors by IDs
   */
  public async deleteVectors(ids: (string | number)[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Qdrant service not initialized');
    }

    try {
      await this.client.delete(this.config.collection, {
        points: ids,
      });

      logger.debug('Deleted vectors from Qdrant', {
        count: ids.length,
        collection: this.config.collection,
      });
    } catch (error) {
      logger.error('Failed to delete vectors', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get collection info
   */
  public async getCollectionInfo(): Promise<{
    name: string;
    vectorsCount: number;
    pointsCount: number;
  }> {
    if (!this.isInitialized) {
      throw new Error('Qdrant service not initialized');
    }

    try {
      const collectionInfo = await this.client.getCollection(this.config.collection);
      // Qdrant client API returns collection info with config.vectors.count
      const vectorsCount =
        (collectionInfo as any).vectors_count ??
        (collectionInfo as any).config?.vectors?.count ??
        0;
      return {
        name: this.config.collection,
        vectorsCount,
        pointsCount: (collectionInfo as any).points_count ?? 0,
      };
    } catch (error) {
      logger.error('Failed to get collection info', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  public async isHealthy(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        return false;
      }
      await this.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close connection
   */
  public async close(): Promise<void> {
    this.isInitialized = false;
    logger.info('Qdrant service closed');
  }
}
