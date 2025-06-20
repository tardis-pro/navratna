import { DatabaseService } from './databaseService.js';
import { QdrantService } from './qdrant.service.js';
import { config } from '@uaip/config';
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
import { KnowledgeItemEntity, KnowledgeRelationshipEntity } from './entities/index.js';

/**
 * Service Factory for Knowledge Graph services
 * Provides centralized dependency injection with proper initialization order
 */
export class ServiceFactory {
  private static instances = new Map<string, any>();
  private static initialized = false;

  /**
   * Initialize the service factory with required dependencies
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Initialize core infrastructure services first
      await this.getOrCreate('database', async () => {
        const dbService = new DatabaseService();
        await dbService.initialize();
        return dbService;
      });

      await this.getOrCreate('qdrant', async () => {
        // Default to TEI dimensions, will be updated later if needed
        const qdrantService = new QdrantService(
          config.database.qdrant.url, 
          config.database.qdrant.collectionName,
          768 // Default TEI embedding dimensions (all-mpnet-base-v2)
        );
        await qdrantService.ensureCollection();
        return qdrantService;
      });

      this.initialized = true;
    } catch (error) {
      console.error('ServiceFactory initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get or create KnowledgeGraphService with all dependencies
   */
  static async getKnowledgeGraphService(): Promise<KnowledgeGraphService> {
    await this.ensureInitialized();
    
    return this.getOrCreate('knowledge-graph', async () => {
      const [qdrantService, repository, embedding, classifier, relationshipDetector] = await Promise.all([
        this.getQdrantService(),
        this.getKnowledgeRepository(),
        this.getSmartEmbeddingService(), // Use smart embedding service
        this.getContentClassifier(),
        this.getRelationshipDetector()
      ]);

      return new KnowledgeGraphService(
        qdrantService,
        repository,
        embedding,
        classifier,
        relationshipDetector
      );
    });
  }

  /**
   * Get or create UserKnowledgeService
   */
  static async getUserKnowledgeService(): Promise<UserKnowledgeService> {
    await this.ensureInitialized();
    
    return this.getOrCreate('user-knowledge', async () => {
      const knowledgeGraphService = await this.getKnowledgeGraphService();
      return new UserKnowledgeService(knowledgeGraphService);
    });
  }

  /**
   * Get or create ContextOrchestrationService
   */
  static async getContextOrchestrationService(): Promise<ContextOrchestrationService> {
    await this.ensureInitialized();
    
    return this.getOrCreate('context-orchestration', async () => {
      const knowledgeGraphService = await this.getKnowledgeGraphService();
      return new ContextOrchestrationService(knowledgeGraphService);
    });
  }

  /**
   * Get or create AgentMemoryService
   */
  static async getAgentMemoryService(): Promise<AgentMemoryService> {
    await this.ensureInitialized();
    
    return this.getOrCreate('agent-memory', async () => {
      const [
        workingMemoryManager,
        episodicMemoryManager,
        semanticMemoryManager,
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
        workingMemoryManager,
        episodicMemoryManager,
        semanticMemoryManager,
        memoryConsolidator,
        knowledgeGraphService
      );
    });
  }

  // Core dependency services

  static async getDatabaseService(): Promise<DatabaseService> {
    await this.ensureInitialized();
    return this.instances.get('database');
  }

  static async getQdrantService(): Promise<QdrantService> {
    await this.ensureInitialized();
    return this.instances.get('qdrant');
  }

  static async getKnowledgeRepository(): Promise<KnowledgeRepository> {
    return this.getOrCreate('knowledge-repository', async () => {
      const databaseService = await this.getDatabaseService();
      const [knowledgeRepo, relationshipRepo] = await Promise.all([
        databaseService.getRepository(KnowledgeItemEntity),
        databaseService.getRepository(KnowledgeRelationshipEntity)
      ]);
      return new KnowledgeRepository(knowledgeRepo, relationshipRepo);
    });
  }

  static async getEmbeddingService(): Promise<EmbeddingService> {
    return this.getOrCreate('embedding-service', () => {
      return new EmbeddingService();
    });
  }

  static async getTEIEmbeddingService(): Promise<TEIEmbeddingService> {
    return this.getOrCreate('tei-embedding-service', () => {
      return new TEIEmbeddingService();
    });
  }

  static async getSmartEmbeddingService(): Promise<SmartEmbeddingService> {
    return this.getOrCreate('smart-embedding-service', async () => {
      const smartEmbedding = new SmartEmbeddingService();
      
      // Synchronize Qdrant dimensions with the active embedding service
      try {
        await this.synchronizeEmbeddingDimensions(smartEmbedding);
      } catch (error) {
        console.warn('Failed to synchronize embedding dimensions:', error.message);
      }
      
      return smartEmbedding;
    });
  }

  static async getEnhancedRAGService(): Promise<EnhancedRAGService> {
    return this.getOrCreate('enhanced-rag-service', async () => {
      const [teiEmbeddingService, qdrantService] = await Promise.all([
        this.getTEIEmbeddingService(),
        this.getQdrantService()
      ]);
      return new EnhancedRAGService(teiEmbeddingService, qdrantService);
    });
  }

  static async getContentClassifier(): Promise<ContentClassifier> {
    return this.getOrCreate('content-classifier', () => {
      return new ContentClassifier();
    });
  }

  static async getRelationshipDetector(): Promise<RelationshipDetector> {
    return this.getOrCreate('relationship-detector', async () => {
      const [embeddingService, repository] = await Promise.all([
        this.getSmartEmbeddingService(), // Use smart embedding service
        this.getKnowledgeRepository()
      ]);
      return new RelationshipDetector(embeddingService, repository);
    });
  }

  static async getWorkingMemoryManager(): Promise<WorkingMemoryManager> {
    return this.getOrCreate('working-memory-manager', () => {
      // Default Redis URL can be overridden via environment variable
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      return new WorkingMemoryManager(redisUrl);
    });
  }

  static async getEpisodicMemoryManager(): Promise<EpisodicMemoryManager> {
    return this.getOrCreate('episodic-memory-manager', async () => {
      // Create a temporary KnowledgeGraphService for the memory manager
      // This breaks the circular dependency by creating separate instances
      const databaseService = await this.getDatabaseService();
      const qdrantService = new QdrantService(config.database.qdrant.url, config.database.qdrant.collectionName);
      await qdrantService.ensureCollection();
      
      const [knowledgeRepo, relationshipRepo] = await Promise.all([
        databaseService.getRepository(KnowledgeItemEntity),
        databaseService.getRepository(KnowledgeRelationshipEntity)
      ]);
      
      const repository = new KnowledgeRepository(knowledgeRepo, relationshipRepo);
      const embedding = new EmbeddingService();
      const classifier = new ContentClassifier();
      const relationshipDetector = new RelationshipDetector(embedding, repository);
      
      const knowledgeGraphService = new KnowledgeGraphService(
        qdrantService,
        repository,
        embedding,
        classifier,
        relationshipDetector
      );
      
      return new EpisodicMemoryManager(knowledgeGraphService);
    });
  }

  static async getSemanticMemoryManager(): Promise<SemanticMemoryManager> {
    return this.getOrCreate('semantic-memory-manager', async () => {
      // Create a temporary KnowledgeGraphService for the memory manager
      // This breaks the circular dependency by creating separate instances
      const databaseService = await this.getDatabaseService();
      const qdrantService = new QdrantService(config.database.qdrant.url, config.database.qdrant.collectionName);
      await qdrantService.ensureCollection();
      
      const [knowledgeRepo, relationshipRepo] = await Promise.all([
        databaseService.getRepository(KnowledgeItemEntity),
        databaseService.getRepository(KnowledgeRelationshipEntity)
      ]);
      
      const repository = new KnowledgeRepository(knowledgeRepo, relationshipRepo);
      const embedding = new EmbeddingService();
      const classifier = new ContentClassifier();
      const relationshipDetector = new RelationshipDetector(embedding, repository);
      
      const knowledgeGraphService = new KnowledgeGraphService(
        qdrantService,
        repository,
        embedding,
        classifier,
        relationshipDetector
      );
      
      return new SemanticMemoryManager(knowledgeGraphService);
    });
  }

  static async getMemoryConsolidator(): Promise<MemoryConsolidator> {
    return this.getOrCreate('memory-consolidator', async () => {
      const [workingMemoryManager, episodicMemoryManager, semanticMemoryManager] = await Promise.all([
        this.getWorkingMemoryManager(),
        this.getEpisodicMemoryManager(),
        this.getSemanticMemoryManager()
      ]);
      return new MemoryConsolidator(workingMemoryManager, episodicMemoryManager, semanticMemoryManager);
    });
  }

  /**
   * Generic service creation with caching
   */
  private static async getOrCreate<T>(key: string, factory: () => T | Promise<T>): Promise<T> {
    if (!this.instances.has(key)) {
      const instance = await factory();
      this.instances.set(key, instance);
    }
    return this.instances.get(key);
  }

  /**
   * Ensure factory is initialized
   */
  private static async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Clear all cached instances (useful for testing)
   */
  static clearCache(): void {
    this.instances.clear();
    this.initialized = false;
  }

  /**
   * Get service health status
   */
  static async getHealthStatus(): Promise<{
    initialized: boolean;
    services: Record<string, boolean>;
  }> {
    const services: Record<string, boolean> = {};
    
    for (const [key, instance] of this.instances) {
      try {
        // Check if service has a health check method
        if (instance && typeof instance.isHealthy === 'function') {
          services[key] = await instance.isHealthy();
        } else {
          services[key] = !!instance;
        }
      } catch (error) {
        services[key] = false;
      }
    }

    return {
      initialized: this.initialized,
      services
    };
  }

  /**
   * Create a new instance (not cached) - useful for testing
   */
  static async createFreshUserKnowledgeService(): Promise<UserKnowledgeService> {
    const knowledgeGraphService = await this.getKnowledgeGraphService();
    return new UserKnowledgeService(knowledgeGraphService);
  }

  /**
   * Create a fresh instance of KnowledgeGraphService - useful for testing
   */
  static async createFreshKnowledgeGraphService(): Promise<KnowledgeGraphService> {
    // Create fresh instances without caching
    const databaseService = await this.getDatabaseService();
    const qdrantService = new QdrantService(config.database.qdrant.url, config.database.qdrant.collectionName);
    await qdrantService.ensureCollection();
    
    const [knowledgeRepo, relationshipRepo] = await Promise.all([
      databaseService.getRepository(KnowledgeItemEntity),
      databaseService.getRepository(KnowledgeRelationshipEntity)
    ]);
    
    const repository = new KnowledgeRepository(knowledgeRepo, relationshipRepo);
    const embedding = new SmartEmbeddingService(); // Use smart embedding service
    const classifier = new ContentClassifier();
    const relationshipDetector = new RelationshipDetector(embedding, repository);

    return new KnowledgeGraphService(
      qdrantService,
      repository,
      embedding,
      classifier,
      relationshipDetector
    );
  }

  /**
   * Synchronize Qdrant embedding dimensions with the active embedding service
   */
  private static async synchronizeEmbeddingDimensions(smartEmbedding: SmartEmbeddingService): Promise<void> {
    try {
      const qdrantService = await this.getQdrantService();
      const currentDimensions = qdrantService.getEmbeddingDimensions();
      const activeDimensions = smartEmbedding.getEmbeddingDimensions();
      
      if (currentDimensions !== activeDimensions) {
        console.log(`Synchronizing embedding dimensions: ${currentDimensions} → ${activeDimensions}`);
        await qdrantService.updateEmbeddingDimensions(activeDimensions);
      }
    } catch (error) {
      console.error('Failed to synchronize embedding dimensions:', error);
      throw error;
    }
  }
}

// Export convenience functions for common services
export const getKnowledgeGraphService = () => ServiceFactory.getKnowledgeGraphService();
export const getUserKnowledgeService = () => ServiceFactory.getUserKnowledgeService();
export const getContextOrchestrationService = () => ServiceFactory.getContextOrchestrationService();
export const getAgentMemoryService = () => ServiceFactory.getAgentMemoryService(); 