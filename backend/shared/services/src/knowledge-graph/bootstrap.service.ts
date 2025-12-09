import { KnowledgeSyncService } from './knowledge-sync.service.js';
import { SimplifiedSyncService, SimplifiedSyncResult } from './simplified-sync.service.js';
import { KnowledgeRepository } from '../database/repositories/knowledge.repository.js';
import { QdrantService } from '../qdrant.service.js';
import { ToolGraphDatabase } from '../database/toolGraphDatabase.js';
import { EmbeddingService } from './embedding.service.js';
import { SmartEmbeddingService } from './smart-embedding.service.js';
import { ContentClassifier } from './content-classifier.service.js';
import { ConceptExtractorService } from './concept-extractor.service.js';
import { OntologyBuilderService } from './ontology-builder.service.js';
import { TaxonomyGeneratorService } from './taxonomy-generator.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { QdrantHealthService } from './qdrant-health.service.js';
import { ChatParserService } from './chat-parser.service.js';
import { ChatKnowledgeExtractorService } from './chat-knowledge-extractor.service.js';
import { BatchProcessorService } from './batch-processor.service.js';
import { DatabaseService } from '../databaseService.js';
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
  private contentClassifier: ContentClassifier;
  private conceptExtractor: ConceptExtractorService;
  private ontologyBuilder: OntologyBuilderService;
  private taxonomyGenerator: TaxonomyGeneratorService;
  private reconciliationService: ReconciliationService;
  private qdrantHealthService: QdrantHealthService;
  private chatParser: ChatParserService;
  private chatKnowledgeExtractor: ChatKnowledgeExtractorService;
  private batchProcessor: BatchProcessorService;
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
      useSimplifiedSync: true,
    }
  ) {
    // Initialize smart embedding service with TEI preference
    this.smartEmbeddingService = new SmartEmbeddingService({
      preferTEI: true,
      fallbackToOpenAI: false, // Only use TEI
      teiUrls: {
        embedding: process.env.TEI_EMBEDDING_URL || 'http://localhost:8080',
        reranker: process.env.TEI_RERANKER_URL || 'http://localhost:8083',
        embeddingCPU: process.env.TEI_EMBEDDING_CPU_URL || 'http://localhost:8082',
      },
    });

    // Initialize services
    // TODO: Add user persona sync later
    this.syncService = new KnowledgeSyncService(
      knowledgeRepository,
      qdrantService,
      graphDb,
      embeddingService,
      null // Temporarily disable user repository
    );

    this.simplifiedSyncService = new SimplifiedSyncService(
      knowledgeRepository,
      qdrantService,
      graphDb,
      this.smartEmbeddingService
    );

    // Initialize ontology services
    this.contentClassifier = new ContentClassifier();
    this.conceptExtractor = new ConceptExtractorService(
      this.contentClassifier,
      this.embeddingService
    );
    this.ontologyBuilder = new OntologyBuilderService(
      this.conceptExtractor,
      this.knowledgeRepository,
      this.syncService
    );
    this.taxonomyGenerator = new TaxonomyGeneratorService(
      this.knowledgeRepository,
      this.contentClassifier
    );
    this.reconciliationService = new ReconciliationService(
      this.embeddingService,
      this.knowledgeRepository,
      this.syncService
    );
    this.qdrantHealthService = new QdrantHealthService(
      this.qdrantService,
      this.knowledgeRepository,
      this.embeddingService,
      this.graphDb
    );

    // Initialize chat services
    this.chatParser = new ChatParserService();
    this.chatKnowledgeExtractor = new ChatKnowledgeExtractorService(
      this.contentClassifier,
      this.embeddingService
    );
    // Note: batchProcessor will be initialized after KnowledgeGraphService is available
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
      this.checkEmbeddingService(),
    ];

    const results = await Promise.allSettled(serviceChecks);
    const failures = results.filter((r) => r.status === 'rejected');

    if (failures.length > 0) {
      const errors = failures.map((f) => (f as PromiseRejectedResult).reason);
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
          errorCount: result.errors.length,
        });

        if (result.totalFailed > 0) {
          logger.warn('Some items failed to sync:', result.errors.slice(0, 5));
        }

        return; // Success!
      } catch (error) {
        attempt++;
        lastError = error as Error;

        if (attempt < this.config.retryAttempts) {
          logger.warn(
            `Universal sync attempt ${attempt} failed, retrying in ${this.config.retryDelay}ms:`,
            error
          );
          await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    // All retries failed
    throw new Error(
      `Universal sync failed after ${this.config.retryAttempts} attempts. Last error: ${lastError?.message}`
    );
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
      isInProgress: this.bootstrapPromise !== null,
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
    const entity = knowledgeItems.find((e) => e.id === itemId);

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
      allSynced: status.postgres && status.neo4j && status.qdrant,
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
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (this.config.useSimplifiedSync) {
        // Use new simplified sync pipeline
        const syncResult = await this.simplifiedSyncService.runSimplifiedSync();

        logger.info('🎉 Simplified post-seed sync completed:', {
          totalFromNeo4j: syncResult.totalFromNeo4j,
          totalToQdrant: syncResult.totalToQdrant,
          clustersCreated: syncResult.clustersCreated,
          totalToPostgres: syncResult.totalToPostgres,
          reductionRatio: syncResult.reductionRatio,
        });

        const totalReduction = syncResult.totalFromNeo4j - syncResult.totalToPostgres;

        // Mark as bootstrapped after successful post-seed sync
        this.isBootstrapped = true;

        return {
          syncResult,
          clusteringEnabled: true,
          totalReduction,
          finalKnowledgeItems: syncResult.totalToPostgres,
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
          syncedFromQdrant: result.syncedFromQdrant,
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
          syncTimestamp: new Date(),
        };

        return {
          syncResult: legacySyncResult,
          clusteringEnabled: false,
          totalReduction: 0,
          finalKnowledgeItems: result.syncedFromPostgres,
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
        const neo4jResult = await this.graphDb.runQuery(
          `
          MATCH (k:KnowledgeItem) 
          RETURN count(k) as count
        `,
          {}
        );
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
      partiallySync,
    };
  }

  // =====================================================
  // ONTOLOGY BOOTSTRAP METHODS
  // =====================================================

  /**
   * Initialize ontology services and run initial knowledge processing
   */
  async initializeOntologyServices(): Promise<void> {
    try {
      logger.info('Initializing ontology services...');

      // Run initial knowledge reconciliation to clean up any duplicates
      await this.runKnowledgeReconciliation();

      // Build ontologies for discovered domains
      await this.setupDomainOntologies();

      logger.info('Ontology services initialization completed');
    } catch (error) {
      logger.error('Error initializing ontology services:', error);
      throw error;
    }
  }

  /**
   * Setup ontologies for all discovered domains
   */
  async setupDomainOntologies(): Promise<void> {
    try {
      // Discover domains from existing knowledge items
      const domains = await this.discoverDomains();

      logger.info(`Setting up ontologies for ${domains.length} domains: ${domains.join(', ')}`);

      for (const domain of domains) {
        try {
          // Check if ontology already exists
          const existingOntology = await this.ontologyBuilder.getOntologyForDomain(domain);

          if (!existingOntology) {
            logger.info(`Building ontology for domain: ${domain}`);

            // Build and save ontology
            const result = await this.ontologyBuilder.buildDomainOntology(domain, undefined, {
              saveToKnowledgeGraph: true,
              minConfidence: 0.6,
              maxConcepts: 50,
            });

            logger.info(
              `Ontology built for ${domain}: ${result.ontology.metadata.totalConcepts} concepts, ${result.ontology.metadata.totalRelationships} relationships`
            );
          } else {
            logger.info(`Ontology already exists for domain: ${domain}`);
          }
        } catch (error) {
          logger.warn(`Failed to build ontology for domain ${domain}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error setting up domain ontologies:', error);
      throw error;
    }
  }

  /**
   * Run comprehensive knowledge reconciliation (deprecated - use overloaded version)
   */
  async runLegacyKnowledgeReconciliation(): Promise<void> {
    try {
      logger.info('Running legacy knowledge reconciliation...');

      // Detect conflicts across all knowledge
      const conflicts = await this.reconciliationService.detectConflicts(
        await this.knowledgeRepository.findRecentItems(200),
        {
          similarityThreshold: 0.85,
          maxConflictsPerBatch: 50,
          autoResolve: false,
        }
      );

      if (conflicts.length > 0) {
        logger.info(`Found ${conflicts.length} knowledge conflicts`);

        // Resolve conflicts automatically where possible
        const resolution = await this.reconciliationService.resolveConflicts(conflicts, {
          autoResolve: true,
          preserveHistory: true,
          generateSummaries: true,
        });

        logger.info(
          `Knowledge reconciliation completed: ${resolution.statistics.conflictsResolved} resolved, ${resolution.statistics.itemsMerged} merged, ${resolution.statistics.itemsArchived} archived`
        );
      } else {
        logger.info('No knowledge conflicts detected');
      }
    } catch (error) {
      logger.error('Error during knowledge reconciliation:', error);
      throw error;
    }
  }

  /**
   * Generate taxonomies for discovered domains
   */
  async generateDomainTaxonomies(): Promise<void> {
    try {
      const domains = await this.discoverDomains();

      logger.info(`Generating taxonomies for ${domains.length} domains`);

      for (const domain of domains) {
        try {
          const items = await this.knowledgeRepository.findByDomain(domain, 100);

          if (items.length >= 10) {
            // Minimum items for meaningful taxonomy
            const result = await this.taxonomyGenerator.generateTaxonomy(items, domain, {
              maxCategories: 15,
              minCategorySize: 2,
              autoClassify: true,
            });

            logger.info(
              `Taxonomy generated for ${domain}: ${result.taxonomy.metadata.totalCategories} categories, ${result.taxonomy.metadata.coverage.toFixed(1)}% coverage`
            );
          } else {
            logger.info(`Skipping taxonomy for ${domain}: insufficient items (${items.length})`);
          }
        } catch (error) {
          logger.warn(`Failed to generate taxonomy for domain ${domain}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error generating domain taxonomies:', error);
      throw error;
    }
  }

  /**
   * Discover domains from existing knowledge items
   */
  private async discoverDomains(): Promise<string[]> {
    try {
      const items = await this.knowledgeRepository.findRecentItems(500);
      const domainCounts = new Map<string, number>();

      // Count domain occurrences from tags and metadata
      for (const item of items) {
        // From metadata domain
        if (item.metadata.domain) {
          domainCounts.set(
            item.metadata.domain as string,
            (domainCounts.get(item.metadata.domain as string) || 0) + 1
          );
        }

        // From tags (exclude common system tags)
        const systemTags = ['knowledge', 'ontology', 'concept', 'relationship'];
        for (const tag of item.tags) {
          if (!systemTags.includes(tag.toLowerCase()) && tag.length > 2) {
            domainCounts.set(tag, (domainCounts.get(tag) || 0) + 1);
          }
        }
      }

      // Return domains with at least 5 items
      const domains = Array.from(domainCounts.entries())
        .filter(([_, count]) => count >= 5)
        .sort((a, b) => b[1] - a[1])
        .map(([domain, _]) => domain)
        .slice(0, 10); // Top 10 domains

      return domains;
    } catch (error) {
      logger.error('Error discovering domains:', error);
      return [];
    }
  }

  /**
   * Get ontology statistics across all domains
   */
  async getOntologyStatistics(): Promise<{
    totalDomains: number;
    totalConcepts: number;
    totalRelationships: number;
    totalTaxonomies: number;
    averageConceptsPerDomain: number;
  }> {
    try {
      const domains = await this.discoverDomains();
      let totalConcepts = 0;
      let totalRelationships = 0;
      let domainsWithOntologies = 0;

      for (const domain of domains) {
        const ontology = await this.ontologyBuilder.getOntologyForDomain(domain);
        if (ontology) {
          totalConcepts += ontology.metadata.totalConcepts;
          totalRelationships += ontology.metadata.totalRelationships;
          domainsWithOntologies++;
        }
      }

      const averageConceptsPerDomain =
        domainsWithOntologies > 0 ? totalConcepts / domainsWithOntologies : 0;

      return {
        totalDomains: domains.length,
        totalConcepts,
        totalRelationships,
        totalTaxonomies: domainsWithOntologies,
        averageConceptsPerDomain,
      };
    } catch (error) {
      logger.error('Error getting ontology statistics:', error);
      return {
        totalDomains: 0,
        totalConcepts: 0,
        totalRelationships: 0,
        totalTaxonomies: 0,
        averageConceptsPerDomain: 0,
      };
    }
  }

  /**
   * Check and repair Qdrant health issues
   */
  async checkAndRepairQdrant(): Promise<{
    healthBefore: any;
    repairNeeded: boolean;
    repairPerformed: boolean;
    healthAfter: any;
    syncResult?: { synced: number; errors: number };
  }> {
    try {
      logger.info('Checking Qdrant health status...');

      // Check initial health
      const healthBefore = await this.qdrantHealthService.checkHealth();

      const repairNeeded = healthBefore.syncNeeded || !healthBefore.isConnected;
      let repairPerformed = false;
      let syncResult;

      if (repairNeeded) {
        logger.info('Qdrant repair needed, attempting automatic repair...');

        try {
          if (!healthBefore.isConnected) {
            // Try to repair collection
            await this.qdrantHealthService.repairQdrantCollection();
          } else if (healthBefore.syncNeeded) {
            // Sync knowledge items
            syncResult = await this.qdrantHealthService.syncKnowledgeIfNeeded(100);
          }

          repairPerformed = true;
          logger.info('Qdrant repair completed successfully');
        } catch (repairError) {
          logger.error('Qdrant repair failed:', repairError);
          repairPerformed = false;
        }
      }

      // Check health after repair
      const healthAfter = repairPerformed
        ? await this.qdrantHealthService.checkHealth()
        : healthBefore;

      return {
        healthBefore,
        repairNeeded,
        repairPerformed,
        healthAfter,
        syncResult,
      };
    } catch (error) {
      logger.error('Error during Qdrant health check and repair:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive Qdrant diagnostics
   */
  async getQdrantDiagnostics() {
    return await this.qdrantHealthService.getQdrantDiagnostics();
  }

  /**
   * Force sync knowledge items to Qdrant
   */
  async forceSyncToQdrant(maxItems: number = 50): Promise<{ synced: number; errors: number }> {
    logger.info(`Force syncing up to ${maxItems} items to Qdrant...`);
    return await this.qdrantHealthService.syncKnowledgeIfNeeded(maxItems);
  }

  // ============================================
  // Chat Ingestion Initialization
  // ============================================

  /**
   * Initialize chat ingestion services
   */
  async initializeChatIngestion(): Promise<void> {
    try {
      logger.info('Initializing chat ingestion services...');

      // Services are already initialized in constructor
      // Additional setup can be added here if needed

      logger.info('Chat ingestion services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize chat ingestion services:', error);
      throw error;
    }
  }

  /**
   * Setup ontology services (already done in constructor)
   */
  async setupOntologyServices(): Promise<void> {
    try {
      logger.info('Setting up ontology services...');

      // Ontology services are already initialized in constructor
      // Additional setup can be added here if needed

      logger.info('Ontology services setup completed');
    } catch (error) {
      logger.error('Failed to setup ontology services:', error);
      throw error;
    }
  }

  /**
   * Run knowledge reconciliation process
   */
  async runKnowledgeReconciliation(domain?: string): Promise<any> {
    try {
      logger.info('Running knowledge reconciliation...', { domain });

      // Get knowledge items for the domain
      const items = domain
        ? await this.knowledgeRepository.findByDomain(domain)
        : await this.knowledgeRepository.findRecentItems(100);

      logger.info(`Found ${items.length} knowledge items for reconciliation`);

      // Detect conflicts
      const conflicts = await this.reconciliationService.detectConflicts(items);
      logger.info(`Detected ${conflicts.length} knowledge conflicts`);

      // Resolve conflicts
      const resolution =
        conflicts.length > 0
          ? await this.reconciliationService.resolveConflicts(conflicts, {
              autoResolve: true,
              preserveHistory: true,
              generateSummaries: true,
            })
          : null;

      // Merge duplicates
      const mergeResult = await this.reconciliationService.mergeDuplicates(items);
      logger.info(
        `Merged ${Array.isArray(mergeResult) ? mergeResult.length : 0} duplicate knowledge items`
      );

      // Generate summaries
      const summaries = await this.reconciliationService.generateSummaries(items);
      logger.info(`Generated ${summaries.length} knowledge summaries`);

      const result = {
        domain: domain || 'all',
        itemsProcessed: items.length,
        conflictsDetected: conflicts.length,
        conflictsResolved: resolution?.resolved || 0,
        duplicatesMerged: Array.isArray(mergeResult) ? mergeResult.length : 0,
        summariesGenerated: summaries.length,
        processingTime: Date.now(),
      };

      logger.info('Knowledge reconciliation completed', result);
      return result;
    } catch (error) {
      logger.error('Failed to run knowledge reconciliation:', error);
      throw error;
    }
  }

  /**
   * Initialize batch processor with knowledge graph service
   */
  initializeBatchProcessor(knowledgeGraphService: any): void {
    this.batchProcessor = new BatchProcessorService(
      this.chatParser,
      this.chatKnowledgeExtractor,
      knowledgeGraphService
    );
    logger.info('Batch processor initialized');
  }

  /**
   * Get chat parser service
   */
  getChatParser(): ChatParserService {
    return this.chatParser;
  }

  /**
   * Get chat knowledge extractor service
   */
  getChatKnowledgeExtractor(): ChatKnowledgeExtractorService {
    return this.chatKnowledgeExtractor;
  }

  /**
   * Get batch processor service
   */
  getBatchProcessor(): BatchProcessorService | null {
    return this.batchProcessor || null;
  }
}
