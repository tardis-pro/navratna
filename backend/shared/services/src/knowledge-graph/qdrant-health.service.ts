import { logger } from '@uaip/utils';
import { QdrantService } from '../qdrant.service.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { KnowledgeSyncService } from './knowledge-sync.service.js';
import { EmbeddingService } from './embedding.service.js';
import { ToolGraphDatabase } from '../database/toolGraphDatabase.js';
import { DatabaseService } from '../databaseService.js';

export interface QdrantHealthStatus {
  isConnected: boolean;
  collectionExists: boolean;
  pointsCount: number;
  postgresItemsCount: number;
  syncNeeded: boolean;
  lastError?: string;
}

export class QdrantHealthService {
  constructor(
    private readonly qdrantService: QdrantService,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly graphDatabase: ToolGraphDatabase
  ) {}

  async checkHealth(): Promise<QdrantHealthStatus> {
    const status: QdrantHealthStatus = {
      isConnected: false,
      collectionExists: false,
      pointsCount: 0,
      postgresItemsCount: 0,
      syncNeeded: false,
    };

    try {
      // Check Qdrant connection and collection
      const collectionInfo = await this.qdrantService.getCollectionInfo();
      status.isConnected = true;
      status.collectionExists = true;
      status.pointsCount = collectionInfo.result?.points_count || 0;

      // Check PostgreSQL knowledge items count
      const postgresItems = await this.knowledgeRepository.findRecentItems(1000);
      status.postgresItemsCount = postgresItems.length;

      // Determine if sync is needed
      status.syncNeeded = status.pointsCount === 0 && status.postgresItemsCount > 0;

      logger.info('Qdrant health check completed', {
        pointsCount: status.pointsCount,
        postgresItemsCount: status.postgresItemsCount,
        syncNeeded: status.syncNeeded,
      });
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Qdrant health check failed:', error);
    }

    return status;
  }

  async syncKnowledgeIfNeeded(maxItems: number = 100): Promise<{ synced: number; errors: number }> {
    try {
      const health = await this.checkHealth();

      if (!health.syncNeeded) {
        logger.info('Qdrant sync not needed', { pointsCount: health.pointsCount });
        return { synced: 0, errors: 0 };
      }

      logger.info(
        `Starting Qdrant sync for ${Math.min(maxItems, health.postgresItemsCount)} items`
      );

      const databaseService = DatabaseService.getInstance();
      const userRepository = databaseService.getUserRepository();
      const syncService = new KnowledgeSyncService(
        this.knowledgeRepository,
        this.qdrantService,
        this.graphDatabase,
        this.embeddingService,
        userRepository
      );

      // Get items to sync
      const items = await this.knowledgeRepository.findRecentItems(maxItems);

      let synced = 0;
      let errors = 0;

      for (const item of items) {
        try {
          await syncService.syncKnowledgeItem(item);
          synced++;

          if (synced % 10 === 0) {
            logger.info(`Synced ${synced}/${items.length} items to Qdrant`);
          }
        } catch (error) {
          errors++;
          logger.warn(`Failed to sync item ${item.id}:`, error);
        }
      }

      logger.info(`Qdrant sync completed: ${synced} synced, ${errors} errors`);
      return { synced, errors };
    } catch (error) {
      logger.error('Qdrant sync failed:', error);
      throw error;
    }
  }

  async repairQdrantCollection(): Promise<void> {
    try {
      logger.info('Starting Qdrant collection repair...');

      // First, try to recreate the collection
      await this.qdrantService.ensureCollection();

      // Then sync some knowledge items
      const result = await this.syncKnowledgeIfNeeded(50);

      logger.info(`Qdrant collection repair completed: ${result.synced} items synced`);
    } catch (error) {
      logger.error('Qdrant collection repair failed:', error);
      throw error;
    }
  }

  async getQdrantDiagnostics(): Promise<{
    health: QdrantHealthStatus;
    collectionInfo: any;
    sampleItems: any[];
  }> {
    const health = await this.checkHealth();

    let collectionInfo = null;
    let sampleItems: any[] = [];

    try {
      collectionInfo = await this.qdrantService.getCollectionInfo();

      // Get sample items from Qdrant if any exist
      if (health.pointsCount > 0) {
        const sampleResponse = await fetch(
          `http://localhost:6333/collections/knowledge_embeddings/points/scroll`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 3, with_payload: true }),
          }
        );

        if (sampleResponse.ok) {
          const sampleData = await sampleResponse.json();
          sampleItems = sampleData.result?.points || [];
        }
      }
    } catch (error) {
      logger.warn('Failed to get Qdrant diagnostics details:', error);
    }

    return {
      health,
      collectionInfo,
      sampleItems: sampleItems.map((item) => ({
        id: item.id,
        payload: item.payload ? Object.keys(item.payload) : [],
        vectorSize: item.vector?.length || 0,
      })),
    };
  }
}
