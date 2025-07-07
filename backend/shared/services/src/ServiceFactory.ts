import { typeormService } from './typeormService.js';
import { QdrantService } from './qdrant.service.js';
import { config } from '@uaip/config';
import { createLogger } from '@uaip/utils';
import { KnowledgeRepository } from './database/repositories/knowledge.repository.js';
import { EmbeddingService } from './knowledge-graph/embedding.service.js';
import { TEIEmbeddingService } from './knowledge-graph/tei-embedding.service.js';
import { SmartEmbeddingService } from './knowledge-graph/smart-embedding.service.js';
import { EnhancedRAGService } from './knowledge-graph/enhanced-rag.service.js';
import { ContentClassifier } from './knowledge-graph/content-classifier.service.js';
import { RelationshipDetector } from './knowledge-graph/relationship-detector.service.js';
import { KnowledgeGraphService } from './knowledge-graph/knowledge-graph.service.js';
import { UserKnowledgeService } from './user-knowledge.service.js';
import { ContextOrchestrationService } from './context-orchestration.service.js';
import { AgentMemoryService } from './agent-memory/agent-memory.service.js';
import { WorkingMemoryManager } from './agent-memory/working-memory.manager.js';
import { EpisodicMemoryManager } from './agent-memory/episodic-memory.manager.js';
import { SemanticMemoryManager } from './agent-memory/semantic-memory.manager.js';
import { MemoryConsolidator } from './agent-memory/memory-consolidator.service.js';
import { ToolManagementService } from './tool-management.service.js';
import { OperationManagementService } from './operation-management.service.js';
import { KnowledgeItemEntity, KnowledgeRelationshipEntity } from './entities/index.js';
import { seedDatabase } from './database/seeders/index.js';
import { KnowledgeBootstrapService } from './knowledge-graph/bootstrap.service.js';
import { KnowledgeSyncService } from './knowledge-graph/knowledge-sync.service.js';
import { ToolGraphDatabase } from './database/toolGraphDatabase.js';

/**
 * Service Factory - Clean Dependency Injection Container
 * Provides centralized service creation with proper initialization order
 */
export class ServiceFactory {
  private static instance: ServiceFactory;
  private serviceInstances = new Map<string, any>();
  private initialized = false;
  private logger = createLogger({
    serviceName: 'service-factory',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  });

  private constructor() { }

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  /**
   * Initialize core infrastructure services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('Initializing ServiceFactory...');

      // Initialize TypeORM first
      await typeormService.initialize();
      this.serviceInstances.set('typeorm', typeormService);
      const dataSource = typeormService.getDataSource();
     

      // Initialize standalone Redis cache service
      try {
        const { initializeRedisCache } = await import('./redis-cache.service.js');
        const cacheInitialized = await initializeRedisCache();
        if (cacheInitialized) {
          this.logger.info('Standalone Redis cache service initialized successfully');
        } else {
          this.logger.info('Standalone Redis cache service not available, continuing without cache');
        }
      } catch (error) {
        this.logger.warn('Failed to initialize standalone Redis cache service', { error: error.message });
      }
      // Initialize Qdrant with default dimensions (will be updated by SmartEmbeddingService)
      const qdrantService = new QdrantService(
        config.database.qdrant.url,
        config.database.qdrant.collectionName,
        768 // Default TEI embedding dimensions
      );
      await qdrantService.ensureCollection();
      this.serviceInstances.set('qdrant', qdrantService);

      this.initialized = true;
      this.logger.info('ServiceFactory initialized successfully');
    } catch (error) {
      this.logger.error('ServiceFactory initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get or create service with lazy initialization
   */
  private async getOrCreateService<T>(
    serviceName: string,
    factory: () => Promise<T> | T
  ): Promise<T> {
    await this.ensureInitialized();

    if (!this.serviceInstances.has(serviceName)) {
      this.logger.info(`Creating service: ${serviceName}`);
      const service = await factory();
      this.serviceInstances.set(serviceName, service);
    }

    return this.serviceInstances.get(serviceName);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Core Infrastructure Services

  async getTypeOrmService() {
    return this.serviceInstances.get('typeorm');
  }

  async getQdrantService(): Promise<QdrantService> {
    return this.serviceInstances.get('qdrant');
  }

  async getToolGraphDatabase(): Promise<ToolGraphDatabase> {
    return this.getOrCreateService('tool-graph-db', async () => {
      const toolGraphDb = new ToolGraphDatabase();
      try {
        await toolGraphDb.verifyConnectivity();
        this.logger.info('Neo4j connection verified for ToolGraphDatabase');
      } catch (error) {
        this.logger.warn('Neo4j connection failed for ToolGraphDatabase:', error);
        // Don't throw - let the service continue without Neo4j functionality
      }
      return toolGraphDb;
    });
  }

  // Repository Services

  async getKnowledgeRepository(): Promise<KnowledgeRepository> {
    return this.getOrCreateService('knowledge-repository', async () => {
      const typeOrm = await this.getTypeOrmService();
      const knowledgeRepo = typeOrm.getRepository(KnowledgeItemEntity);
      const relationshipRepo = typeOrm.getRepository(KnowledgeRelationshipEntity);
      return new KnowledgeRepository(knowledgeRepo, relationshipRepo);
    });
  }

  // Embedding Services

  async getEmbeddingService(): Promise<EmbeddingService> {
    return this.getOrCreateService('embedding-service', () => new EmbeddingService());
  }

  async getTEIEmbeddingService(): Promise<TEIEmbeddingService> {
    return this.getOrCreateService('tei-embedding-service', () => new TEIEmbeddingService());
  }

  async getSmartEmbeddingService(): Promise<SmartEmbeddingService> {
    return this.getOrCreateService('smart-embedding-service', async () => {
      const smartEmbedding = new SmartEmbeddingService();

      // Synchronize Qdrant dimensions with the active embedding service
      try {
        const qdrantService = await this.getQdrantService();
        const currentDimensions = qdrantService.getEmbeddingDimensions();
        const activeDimensions = smartEmbedding.getEmbeddingDimensions();

        if (currentDimensions !== activeDimensions) {
          this.logger.info('Synchronizing embedding dimensions', {
            from: currentDimensions,
            to: activeDimensions
          });
          await qdrantService.updateEmbeddingDimensions(activeDimensions);
        }
      } catch (error) {
        this.logger.warn('Failed to synchronize embedding dimensions', { error: error.message });
      }

      return smartEmbedding;
    });
  }

  // Knowledge Graph Services

  async getContentClassifier(): Promise<ContentClassifier> {
    return this.getOrCreateService('content-classifier', () => new ContentClassifier());
  }

  async getRelationshipDetector(): Promise<RelationshipDetector> {
    return this.getOrCreateService('relationship-detector', async () => {
      const [embeddingService, repository] = await Promise.all([
        this.getSmartEmbeddingService(),
        this.getKnowledgeRepository()
      ]);
      return new RelationshipDetector(embeddingService, repository);
    });
  }

  async getKnowledgeGraphService(): Promise<KnowledgeGraphService> {
    return this.getOrCreateService('knowledge-graph-service', async () => {
      const [
        qdrantService,
        repository,
        embeddingService,
        classifier,
        relationshipDetector
      ] = await Promise.all([
        this.getQdrantService(),
        this.getKnowledgeRepository(),
        this.getSmartEmbeddingService(),
        this.getContentClassifier(),
        this.getRelationshipDetector()
      ]);

      const toolGraphDatabase = await this.getToolGraphDatabase();
      const knowledgeSync = new KnowledgeSyncService(
        repository,
        qdrantService,
        toolGraphDatabase,
        embeddingService
      );

      return new KnowledgeGraphService(
        qdrantService,
        repository,
        embeddingService,
        classifier,
        relationshipDetector,
        knowledgeSync
      );
    });
  }

  async getEnhancedRAGService(): Promise<EnhancedRAGService> {
    return this.getOrCreateService('enhanced-rag-service', async () => {
      const [teiEmbeddingService, qdrantService] = await Promise.all([
        this.getTEIEmbeddingService(),
        this.getQdrantService()
      ]);
      return new EnhancedRAGService(teiEmbeddingService, qdrantService);
    });
  }

  // Memory Services

  async getWorkingMemoryManager(): Promise<WorkingMemoryManager> {
    return this.getOrCreateService('working-memory-manager', () => {
      // Use centralized Redis configuration
      const redisConfig = config.redis;
      const redisUrl = process.env.REDIS_URL || `redis://${redisConfig.password ? `:${redisConfig.password}@` : ''}${redisConfig.host}:${redisConfig.port}`;
      return new WorkingMemoryManager(redisUrl);
    });
  }

  async getEpisodicMemoryManager(): Promise<EpisodicMemoryManager> {
    return this.getOrCreateService('episodic-memory-manager', async () => {
      const knowledgeGraphService = await this.getKnowledgeGraphService();
      return new EpisodicMemoryManager(knowledgeGraphService);
    });
  }

  async getSemanticMemoryManager(): Promise<SemanticMemoryManager> {
    return this.getOrCreateService('semantic-memory-manager', async () => {
      const knowledgeGraphService = await this.getKnowledgeGraphService();
      return new SemanticMemoryManager(knowledgeGraphService);
    });
  }

  async getMemoryConsolidator(): Promise<MemoryConsolidator> {
    return this.getOrCreateService('memory-consolidator', async () => {
      const [workingMemory, episodicMemory, semanticMemory] = await Promise.all([
        this.getWorkingMemoryManager(),
        this.getEpisodicMemoryManager(),
        this.getSemanticMemoryManager()
      ]);
      return new MemoryConsolidator(workingMemory, episodicMemory, semanticMemory);
    });
  }

  async getAgentMemoryService(): Promise<AgentMemoryService> {
    return this.getOrCreateService('agent-memory-service', async () => {
      const [
        workingMemory,
        episodicMemory,
        semanticMemory,
        memoryConsolidator,
        knowledgeGraphService
      ] = await Promise.all([
        this.getWorkingMemoryManager(),
        this.getEpisodicMemoryManager(),
        this.getSemanticMemoryManager(),
        this.getMemoryConsolidator(),
        this.getKnowledgeGraphService()
      ]);

      return new AgentMemoryService(
        workingMemory,
        episodicMemory,
        semanticMemory,
        memoryConsolidator,
        knowledgeGraphService
      );
    });
  }

  // High-level Application Services

  async getUserKnowledgeService(): Promise<UserKnowledgeService> {
    return this.getOrCreateService('user-knowledge-service', async () => {
      const knowledgeGraphService = await this.getKnowledgeGraphService();
      return new UserKnowledgeService(knowledgeGraphService);
    });
  }

  async getContextOrchestrationService(): Promise<ContextOrchestrationService> {
    return this.getOrCreateService('context-orchestration-service', async () => {
      const knowledgeGraphService = await this.getKnowledgeGraphService();
      return new ContextOrchestrationService(knowledgeGraphService);
    });
  }

  // Domain Services

  async getToolManagementService(): Promise<ToolManagementService> {
    return this.getOrCreateService('tool-management-service', () => new ToolManagementService());
  }

  async getOperationManagementService(): Promise<OperationManagementService> {
    return this.getOrCreateService('operation-management-service', () => new OperationManagementService());
  }

  // Utility Methods

  /**
   * Get health status of all services including database and cache
   */
  async getHealthStatus(): Promise<{
    initialized: boolean;
    services: Record<string, boolean>;
    database?: {
      status: 'healthy' | 'unhealthy';
      details: {
        connected: boolean;
        driver: string;
        database: string;
        responseTime?: number;
        cacheEnabled?: boolean;
        cacheHealthy?: boolean;
      };
    };
  }> {
    const services: Record<string, boolean> = {};

    for (const [serviceName, serviceInstance] of this.serviceInstances) {
      try {
        if (serviceInstance && typeof serviceInstance.isHealthy === 'function') {
          services[serviceName] = await serviceInstance.isHealthy();
        } else {
          services[serviceName] = !!serviceInstance;
        }
      } catch (error) {
        services[serviceName] = false;
      }
    }

    // Get database health including cache status
    let databaseHealth;
    try {
      const typeOrmService = this.serviceInstances.get('typeorm');
      if (typeOrmService && typeof typeOrmService.checkHealth === 'function') {
        databaseHealth = await typeOrmService.checkHealth();
      }
    } catch (error) {
      this.logger.warn('Failed to get database health', { error: error.message });
    }

    return {
      initialized: this.initialized,
      services,
      ...(databaseHealth && { database: databaseHealth })
    };
  }

  /**
   * Clear all cached services (useful for testing)
   */
  clearServices(): void {
    this.serviceInstances.clear();
    this.initialized = false;
  }

  /**
   * Gracefully shutdown all services
   */
  /**
   * Get LLM Service instance
   */
  getLLMService(): any {
    if (!this.serviceInstances.has('llmService')) {
      this.logger.info('Creating LLM Service instance');
      // Placeholder LLM service - actual implementation would import from @uaip/llm-service
      const llmService = {
        async generateResponse(prompt: string, options?: any): Promise<string> {
          this.logger.info('LLM generateResponse called', { prompt: prompt.substring(0, 100) });
          return 'Mock LLM response';
        },
        async analyzeContent(content: string): Promise<any> {
          this.logger.info('LLM analyzeContent called');
          return { sentiment: 'neutral', topics: [], confidence: 0.5 };
        }
      };
      this.serviceInstances.set('llmService', llmService);
    }
    return this.serviceInstances.get('llmService');
  }

  /**
   * Get User LLM Service instance
   */
  getUserLLMService(): any {
    if (!this.serviceInstances.has('userLLMService')) {
      this.logger.info('Creating User LLM Service instance');
      // Placeholder User LLM service - actual implementation would import from @uaip/llm-service
      const userLLMService = {
        async getUserProviders(userId: string): Promise<any[]> {
          this.logger.info('UserLLM getUserProviders called', { userId });
          return [];
        },
        async generateWithUserProvider(userId: string, prompt: string, providerId?: string): Promise<string> {
          this.logger.info('UserLLM generateWithUserProvider called', { userId, providerId });
          return 'Mock user LLM response';
        }
      };
      this.serviceInstances.set('userLLMService', userLLMService);
    }
    return this.serviceInstances.get('userLLMService');
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down ServiceFactory...');

    for (const [serviceName, serviceInstance] of this.serviceInstances) {
      try {
        if (serviceInstance && typeof serviceInstance.close === 'function') {
          await serviceInstance.close();
        }
      } catch (error) {
        this.logger.error(`Error shutting down service: ${serviceName}`, { error: error.message });
      }
    }

    // Close TypeORM last
    try {
      await typeormService.close();
    } catch (error) {
      this.logger.error('Error closing TypeORM service', { error: error.message });
    }

    this.clearServices();
    this.logger.info('ServiceFactory shutdown complete');
  }
}

// Export singleton instance and convenience functions
export const serviceFactory = ServiceFactory.getInstance();

// Convenience exports for common services
export const getKnowledgeGraphService = () => serviceFactory.getKnowledgeGraphService();
export const getUserKnowledgeService = () => serviceFactory.getUserKnowledgeService();
export const getContextOrchestrationService = () => serviceFactory.getContextOrchestrationService();
export const getAgentMemoryService = () => serviceFactory.getAgentMemoryService();

// API-friendly initialization functions (merged from ServiceInitializer)
export const initializeServices = () => serviceFactory.initialize();
export const servicesHealthCheck = async () => {
  try {
    const status = await serviceFactory.getHealthStatus();
    const allHealthy = status.initialized && Object.values(status.services).every(healthy => healthy);

    return {
      healthy: allHealthy,
      services: status.services
    };
  } catch (error) {
    return {
      healthy: false,
      services: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Reset services (useful for testing)
export const resetServices = () => serviceFactory.clearServices();