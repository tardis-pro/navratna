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

  private constructor() {}

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

      return new KnowledgeGraphService(
        qdrantService,
        repository,
        embeddingService,
        classifier,
        relationshipDetector
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
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
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
   * Get health status of all services
   */
  async getHealthStatus(): Promise<{
    initialized: boolean;
    services: Record<string, boolean>;
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

    return {
      initialized: this.initialized,
      services
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