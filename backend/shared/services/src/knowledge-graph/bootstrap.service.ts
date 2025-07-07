import { KnowledgeSyncService } from './knowledge-sync.service.js';
import { SimplifiedSyncService, SimplifiedSyncResult } from './simplified-sync.service.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { QdrantService } from '../qdrant.service.js';
import { ToolGraphDatabase } from '../database/toolGraphDatabase.js';
import { EmbeddingService } from './embedding.service.js';
import { SmartEmbeddingService } from './smart-embedding.service.js';
import { logger } from '@uaip/utils';

export interface BootstrapConfig {
  enableAutoSync: boolean;
  syncOnStartup: boolean;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
  useSimplifiedSync: boolean; // New flag for simplified sync
}

export interface BootstrapStatus {
  syncResult: SimplifiedSyncResult;
  clusteringEnabled: boolean;
  totalReduction: number;
  finalKnowledgeItems: number;
}

export class KnowledgeBootstrapService {
  private syncService: KnowledgeSyncService;
  private simplifiedSyncService: SimplifiedSyncService;
  private smartEmbeddingService: SmartEmbeddingService;
  private isBootstrapped = false;
  private bootstrapPromise: Promise<void> | null = null;

  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly qdrantService: QdrantService,
    private readonly graphDb: ToolGraphDatabase,
    private readonly embeddingService: EmbeddingService,
    private readonly config: BootstrapConfig = {
      enableAutoSync: true,
      syncOnStartup: true,
      batchSize: 10,
      retryAttempts: 3,
      retryDelay: 1000,
      useSimplifiedSync: true
    }
  ) {
    // Initialize smart embedding service with TEI preference
    this.smartEmbeddingService = new SmartEmbeddingService({
      preferTEI: true,
      fallbackToOpenAI: false, // Only use TEI
      teiUrls: {
        embedding: process.env.TEI_EMBEDDING_URL || 'http://localhost:8080',
        reranker: process.env.TEI_RERANKER_URL || 'http://localhost:8083',
        embeddingCPU: process.env.TEI_EMBEDDING_CPU_URL || 'http://localhost:8082'
      }
    });

    // Initialize services
    this.syncService = new KnowledgeSyncService(
      knowledgeRepository,
      qdrantService,
      graphDb,
      embeddingService
    );

    this.simplifiedSyncService = new SimplifiedSyncService(
      knowledgeRepository,
      qdrantService,
      graphDb,
      this.smartEmbeddingService
    );
  }

  /**
   * Bootstrap the knowledge graph synchronization on startup
   */
  async bootstrap(): Promise<void> {
    if (this.isBootstrapped) {
      logger.info('Knowledge graph already bootstrapped');
      return;
    }

    if (this.bootstrapPromise) {
      logger.info('Bootstrap already in progress, waiting...');
      return this.bootstrapPromise;
    }

    this.bootstrapPromise = this.performBootstrap();
    return this.bootstrapPromise;
  }

  private async performBootstrap(): Promise<void> {
    logger.info('Starting knowledge graph bootstrap process');
    
    try {
      // 1. Ensure all services are ready
      await this.ensureServicesReady();
      
      // 2. Perform initial sync if enabled
      if (this.config.syncOnStartup) {
        await this.performInitialSync();
      }
      
      // 3. Mark as bootstrapped
      this.isBootstrapped = true;
      this.bootstrapPromise = null;
      
      logger.info('Knowledge graph bootstrap completed successfully');
      
    } catch (error) {
      logger.error('Knowledge graph bootstrap failed:', error);
      this.bootstrapPromise = null;
      throw error;
    }
  }

  private async ensureServicesReady(): Promise<void> {
    logger.info('Ensuring all services are ready for knowledge graph sync');
    
    const serviceChecks = [
      this.checkQdrantService(),
      this.checkNeo4jService(),
      this.checkEmbeddingService()
    ];

    const results = await Promise.allSettled(serviceChecks);
    const failures = results.filter(r => r.status === 'rejected');
    
    if (failures.length > 0) {
      const errors = failures.map(f => (f as PromiseRejectedResult).reason);
      logger.warn('Some services are not ready:', errors);
      
      // Continue with degraded functionality
      logger.info('Continuing with available services');
    }
  }

  private async checkQdrantService(): Promise<void> {
    const isHealthy = await this.qdrantService.isHealthy();
    if (!isHealthy) {
      throw new Error('Qdrant service is not healthy');
    }
    
    // Ensure collection exists
    await this.qdrantService.ensureCollection();
    logger.info('✅ Qdrant service is ready');
  }

  private async checkNeo4jService(): Promise<void> {
    // Test Neo4j connection
    const testResult = await this.graphDb.runQuery('RETURN 1 as test', {});
    if (!testResult.records || testResult.records.length === 0) {
      throw new Error('Neo4j service is not responding');
    }
    logger.info('✅ Neo4j service is ready');
  }

  private async checkEmbeddingService(): Promise<void> {
    // Test embedding generation
    const testEmbedding = await this.embeddingService.generateEmbedding('test');
    if (!testEmbedding || testEmbedding.length === 0) {
      throw new Error('Embedding service is not working');
    }
    logger.info('✅ Embedding service is ready');
  }

  private async performInitialSync(): Promise<void> {
    logger.info('Starting universal knowledge graph synchronization');
    
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.config.retryAttempts) {
      try {
        const result = await this.syncService.universalSync();
        
        logger.info('Universal sync completed:', {
          totalFound: result.totalFound,
          totalSynced: result.totalSynced,
          totalFailed: result.totalFailed,
          syncedFromPostgres: result.syncedFromPostgres,
          syncedFromNeo4j: result.syncedFromNeo4j,
          syncedFromQdrant: result.syncedFromQdrant,
          errorCount: result.errors.length
        });

        if (result.totalFailed > 0) {
          logger.warn('Some items failed to sync:', result.errors.slice(0, 5));
        }

        return; // Success!
        
      } catch (error) {
        attempt++;
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          logger.warn(`Universal sync attempt ${attempt} failed, retrying in ${this.config.retryDelay}ms:`, error);
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    // All retries failed
    throw new Error(`Universal sync failed after ${this.config.retryAttempts} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Get bootstrap status
   */
  getBootstrapStatus(): {
    isBootstrapped: boolean;
    isInProgress: boolean;
  } {
    return {
      isBootstrapped: this.isBootstrapped,
      isInProgress: this.bootstrapPromise !== null
    };
  }

  /**
   * Force re-bootstrap (useful for testing or recovery)
   */
  async forceReBootstrap(): Promise<void> {
    logger.info('Forcing knowledge graph re-bootstrap');
    this.isBootstrapped = false;
    this.bootstrapPromise = null;
    return this.bootstrap();
  }

  /**
   * Sync a single knowledge item (for real-time updates)
   */
  async syncKnowledgeItem(itemId: string): Promise<void> {
    if (!this.isBootstrapped) {
      logger.warn('Attempting to sync item before bootstrap is complete');
      await this.bootstrap();
    }

    const item = await this.knowledgeRepository.findById(itemId);
    if (!item) {
      throw new Error(`Knowledge item not found: ${itemId}`);
    }

    // Convert to entity format for sync service
    const knowledgeItems = await this.knowledgeRepository.findAll();
    const entity = knowledgeItems.find(e => e.id === itemId);
    
    if (!entity) {
      throw new Error(`Knowledge item entity not found: ${itemId}`);
    }

    const result = await this.syncService.syncKnowledgeItem(entity);
    
    if (!result.success) {
      throw new Error(`Failed to sync knowledge item ${itemId}: ${result.error}`);
    }
  }

  /**
   * Verify sync integrity for a specific item
   */
  async verifyItemSync(itemId: string): Promise<{
    postgres: boolean;
    neo4j: boolean;
    qdrant: boolean;
    allSynced: boolean;
  }> {
    const status = await this.syncService.verifySyncStatus(itemId);
    
    return {
      ...status,
      allSynced: status.postgres && status.neo4j && status.qdrant
    };
  }

  /**
   * Run after seeding process - discovers and syncs any new data
   * This is the main entry point for post-seed synchronization
   */
  async runPostSeedSync(): Promise<BootstrapStatus> {
    logger.info('🌱 Starting post-seed knowledge graph synchronization');
    
    try {
      // Wait a bit for seeding to settle
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (this.config.useSimplifiedSync) {
        // Use new simplified sync pipeline
        const syncResult = await this.simplifiedSyncService.runSimplifiedSync();
        
        logger.info('🎉 Simplified post-seed sync completed:', {
          totalFromNeo4j: syncResult.totalFromNeo4j,
          totalToQdrant: syncResult.totalToQdrant,
          clustersCreated: syncResult.clustersCreated,
          totalToPostgres: syncResult.totalToPostgres,
          reductionRatio: syncResult.reductionRatio
        });

        const totalReduction = syncResult.totalFromNeo4j - syncResult.totalToPostgres;
        
        // Mark as bootstrapped after successful post-seed sync
        this.isBootstrapped = true;

        return {
          syncResult,
          clusteringEnabled: true,
          totalReduction,
          finalKnowledgeItems: syncResult.totalToPostgres
        };
        
      } else {
        // Use legacy universal sync
        const result = await this.syncService.universalSync();
        
        logger.info('🎉 Legacy post-seed sync completed:', {
          totalFound: result.totalFound,
          totalSynced: result.totalSynced,
          totalFailed: result.totalFailed,
          syncedFromPostgres: result.syncedFromPostgres,
          syncedFromNeo4j: result.syncedFromNeo4j,
          syncedFromQdrant: result.syncedFromQdrant
        });

        if (result.totalFailed > 0) {
          logger.warn(`⚠️ ${result.totalFailed} items failed to sync during post-seed process`);
        }

        // Mark as bootstrapped after successful post-seed sync
        this.isBootstrapped = true;
        
        // Convert legacy result to new format
        const legacySyncResult: SimplifiedSyncResult = {
          totalFromNeo4j: result.syncedFromNeo4j,
          totalToQdrant: result.syncedFromNeo4j,
          totalClustered: 0,
          totalToPostgres: result.syncedFromPostgres,
          clustersCreated: 0,
          reductionRatio: 0,
          errors: result.errors,
          syncTimestamp: new Date()
        };

        return {
          syncResult: legacySyncResult,
          clusteringEnabled: false,
          totalReduction: 0,
          finalKnowledgeItems: result.syncedFromPostgres
        };
      }
      
    } catch (error) {
      logger.error('❌ Post-seed sync failed:', error);
      throw error;
    }
  }

  /**
   * Check if system should run post-seed sync
   */
  shouldRunPostSeedSync(): boolean {
    return this.config.enableAutoSync && !this.isBootstrapped;
  }

  /**
   * Get sync statistics
   */
  async getSyncStatistics(): Promise<{
    totalItems: number;
    syncedToNeo4j: number;
    syncedToQdrant: number;
    fullySynced: number;
    partiallySync: number;
  }> {
    const stats = await this.knowledgeRepository.getStatistics();
    
    // Check Neo4j sync status - handle disconnected state gracefully
    let syncedToNeo4j = 0;
    try {
      const connectionStatus = this.graphDb.getConnectionStatus();
      if (connectionStatus.isConnected) {
        const neo4jResult = await this.graphDb.runQuery(`
          MATCH (k:KnowledgeItem) 
          RETURN count(k) as count
        `, {});
        syncedToNeo4j = neo4jResult.records[0]?.get('count')?.toNumber() || 0;
      } else {
        logger.warn('Neo4j not connected, skipping sync statistics for Neo4j');
      }
    } catch (error) {
      logger.warn('Failed to get Neo4j sync statistics:', error.message);
    }
    
    // Check Qdrant sync status
    const qdrantInfo = await this.qdrantService.getCollectionInfo();
    const syncedToQdrant = qdrantInfo.result?.points_count || 0;
    
    // Estimate fully synced items (conservative approach)
    const fullySynced = Math.min(stats.totalItems, syncedToNeo4j, syncedToQdrant);
    const partiallySync = stats.totalItems - fullySynced;

    return {
      totalItems: stats.totalItems,
      syncedToNeo4j,
      syncedToQdrant,
      fullySynced,
      partiallySync
    };
  }
}