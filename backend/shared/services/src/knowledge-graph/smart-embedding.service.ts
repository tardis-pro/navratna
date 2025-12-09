import { EmbeddingService } from './embedding.service.js';
import { TEIEmbeddingService, TEIHealthStatus } from './tei-embedding.service.js';
import { ContextRequest } from '@uaip/types';

export interface EmbeddingServiceConfig {
  preferTEI: boolean;
  fallbackToOpenAI: boolean;
  teiUrls: {
    embedding: string;
    reranker: string;
    embeddingCPU: string;
  };
  openaiApiKey?: string;
  healthCheckInterval: number;
  embeddingModel?: string;
}

export interface SmartEmbeddingStatus {
  activeService: 'tei' | 'openai' | 'mixed';
  teiStatus: {
    embedding: TEIHealthStatus;
    reranker: TEIHealthStatus;
  };
  openaiAvailable: boolean;
  lastHealthCheck: Date;
  embeddingDimensions: number;
  performanceMetrics: {
    avgLatency: number;
    successRate: number;
    totalRequests: number;
  };
}

/**
 * Smart Embedding Service that automatically chooses the best available embedding service
 * Priority: TEI (if available) > OpenAI (fallback)
 * Handles different embedding dimensions and provides seamless fallback
 */
export class SmartEmbeddingService extends EmbeddingService {
  private teiService: TEIEmbeddingService;
  private config: EmbeddingServiceConfig;
  private healthStatus: SmartEmbeddingStatus;
  private lastHealthCheck: Date = new Date(0);
  private performanceMetrics = {
    avgLatency: 0,
    successRate: 1.0,
    totalRequests: 0,
    successfulRequests: 0,
  };

  constructor(config: Partial<EmbeddingServiceConfig> = {}) {
    // Initialize base EmbeddingService with OpenAI config
    super(
      config.openaiApiKey || process.env.OPENAI_API_KEY,
      config.embeddingModel || 'text-embedding-ada-002'
    );

    // Default configuration
    this.config = {
      preferTEI: true,
      fallbackToOpenAI: true,
      teiUrls: {
        embedding: process.env.TEI_EMBEDDING_URL || 'http://localhost:8080',
        reranker: process.env.TEI_RERANKER_URL || 'http://localhost:8083',
        embeddingCPU: process.env.TEI_EMBEDDING_CPU_URL || 'http://localhost:8082',
      },
      openaiApiKey: process.env.OPENAI_API_KEY,
      healthCheckInterval: 30000, // 30 seconds
      embeddingModel: 'text-embedding-ada-002',
      ...config,
    };

    // Initialize services
    this.teiService = new TEIEmbeddingService(
      this.config.teiUrls.embedding,
      this.config.teiUrls.reranker
    );

    // Initialize health status
    this.healthStatus = {
      activeService: 'tei',
      teiStatus: {
        embedding: { status: 'loading' },
        reranker: { status: 'loading' },
      },
      openaiAvailable: !!this.config.openaiApiKey,
      lastHealthCheck: new Date(0),
      embeddingDimensions: 768, // Default TEI dimension (all-mpnet-base-v2)
      performanceMetrics: {
        avgLatency: 0,
        successRate: 1.0,
        totalRequests: 0,
      },
    };

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Override base class methods to use TEI when available
   */
  override async generateEmbedding(text: string): Promise<number[]> {
    const startTime = Date.now();
    this.performanceMetrics.totalRequests++;

    try {
      await this.ensureHealthy();

      if (this.shouldUseTEI()) {
        try {
          const embedding = await this.teiService.generateEmbedding(text);
          this.recordSuccess(startTime);
          return embedding;
        } catch (error) {
          console.warn('TEI embedding failed, trying fallback:', error.message);

          if (this.config.fallbackToOpenAI && this.healthStatus.openaiAvailable) {
            const embedding = await super.generateEmbedding(text);
            this.recordSuccess(startTime);
            this.healthStatus.activeService = 'mixed';
            return embedding;
          }
          throw error;
        }
      } else if (this.healthStatus.openaiAvailable) {
        const embedding = await super.generateEmbedding(text);
        this.recordSuccess(startTime);
        return embedding;
      } else {
        throw new Error('No embedding service available');
      }
    } catch (error) {
      this.recordFailure(startTime);
      throw new Error(`Smart embedding failed: ${error.message}`);
    }
  }

  /**
   * Generate batch embeddings using the best available service
   */
  override async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();
    this.performanceMetrics.totalRequests++;

    try {
      await this.ensureHealthy();

      if (this.shouldUseTEI()) {
        try {
          const embeddings = await this.teiService.generateBatchEmbeddings(texts);
          this.recordSuccess(startTime);
          return embeddings;
        } catch (error) {
          console.warn('TEI batch embedding failed, trying fallback:', error.message);

          if (this.config.fallbackToOpenAI && this.healthStatus.openaiAvailable) {
            const embeddings = await super.generateBatchEmbeddings(texts);
            this.recordSuccess(startTime);
            this.healthStatus.activeService = 'mixed';
            return embeddings;
          }
          throw error;
        }
      } else if (this.healthStatus.openaiAvailable) {
        const embeddings = await super.generateBatchEmbeddings(texts);
        this.recordSuccess(startTime);
        return embeddings;
      } else {
        throw new Error('No embedding service available');
      }
    } catch (error) {
      this.recordFailure(startTime);
      throw new Error(`Smart batch embedding failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for content chunks (compatibility method)
   */
  override async generateEmbeddings(content: string): Promise<number[][]> {
    if (this.shouldUseTEI()) {
      try {
        return await this.teiService.generateEmbeddings(content);
      } catch (error) {
        if (this.config.fallbackToOpenAI && this.healthStatus.openaiAvailable) {
          console.warn('TEI content embedding failed, using OpenAI fallback:', error.message);
          return await super.generateEmbeddings(content);
        }
        throw error;
      }
    } else if (this.healthStatus.openaiAvailable) {
      return await super.generateEmbeddings(content);
    } else {
      throw new Error('No embedding service available');
    }
  }

  /**
   * Generate context embedding
   */
  override async generateContextEmbedding(context: ContextRequest): Promise<number[]> {
    if (this.shouldUseTEI()) {
      try {
        return await this.teiService.generateContextEmbedding(context);
      } catch (error) {
        if (this.config.fallbackToOpenAI && this.healthStatus.openaiAvailable) {
          console.warn('TEI context embedding failed, using OpenAI fallback:', error.message);
          return await super.generateContextEmbedding(context);
        }
        throw error;
      }
    } else if (this.healthStatus.openaiAvailable) {
      return await super.generateContextEmbedding(context);
    } else {
      throw new Error('No embedding service available');
    }
  }

  /**
   * Calculate similarity between embeddings
   */
  override async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    // Use the service that generated the embeddings (both should be from same service)
    if (this.shouldUseTEI()) {
      return await this.teiService.calculateSimilarity(embedding1, embedding2);
    } else {
      return await super.calculateSimilarity(embedding1, embedding2);
    }
  }

  /**
   * Rerank documents (TEI-only feature)
   */
  async rerank(query: string, documents: string[], topK?: number): Promise<any[]> {
    if (this.shouldUseTEI() && this.healthStatus.teiStatus.reranker.status === 'ready') {
      return await this.teiService.rerank(query, documents, topK);
    } else {
      // Fallback: return documents in original order with similarity scores
      console.warn('Reranking not available, returning original order');
      return documents.map((doc, index) => ({
        index,
        score: 1.0 - index * 0.1, // Decreasing scores
        document: doc,
      }));
    }
  }

  /**
   * Get current service status
   */
  async getStatus(): Promise<SmartEmbeddingStatus> {
    await this.checkHealth();
    return { ...this.healthStatus };
  }

  /**
   * Force a health check
   */
  async checkHealth(): Promise<void> {
    try {
      // Check TEI health
      if (this.config.preferTEI) {
        this.healthStatus.teiStatus = await this.teiService.checkHealth();
      }
      console.log(this.healthStatus);
      // Check OpenAI availability (we assume it's available if API key is provided)
      this.healthStatus.openaiAvailable = !!this.config.openaiApiKey;

      // Determine active service and dimensions
      if (this.healthStatus.teiStatus.embedding.status === 'ready' && this.config.preferTEI) {
        this.healthStatus.activeService = 'tei';
        // Detect TEI model dimensions - sentence-transformers/all-mpnet-base-v2 = 768
        this.healthStatus.embeddingDimensions = 768; // TEI CPU model dimension
      } else if (this.healthStatus.openaiAvailable) {
        this.healthStatus.activeService = 'openai';
        this.healthStatus.embeddingDimensions = 1536; // OpenAI dimension
      } else {
        this.healthStatus.activeService = 'tei'; // Default, even if unhealthy
        this.healthStatus.embeddingDimensions = 768; // Default TEI dimension
      }

      this.healthStatus.lastHealthCheck = new Date();
      this.lastHealthCheck = new Date();
    } catch (error) {
      console.error('Health check failed:', error);
      this.healthStatus.lastHealthCheck = new Date();
    }
  }

  /**
   * Get embedding dimensions for the current active service
   */
  getEmbeddingDimensions(): number {
    return this.healthStatus.embeddingDimensions;
  }

  /**
   * Check if TEI should be used based on health and configuration
   */
  private shouldUseTEI(): boolean {
    return (
      this.config.preferTEI &&
      this.healthStatus.teiStatus.embedding.status === 'ready' &&
      this.healthStatus.teiStatus.reranker.status === 'ready'
    );
  }

  /**
   * Ensure services are healthy, run health check if needed
   */
  private async ensureHealthy(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastHealthCheck.getTime();

    if (timeSinceLastCheck > this.config.healthCheckInterval) {
      await this.checkHealth();
    }
  }

  /**
   * Start background health monitoring
   */
  private startHealthMonitoring(): void {
    // Initial health check
    this.checkHealth().catch((error) => {
      console.error('Initial health check failed:', error);
    });

    // Periodic health checks
    setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        console.error('Periodic health check failed:', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Record successful operation
   */
  private recordSuccess(startTime: number): void {
    const latency = Date.now() - startTime;
    this.performanceMetrics.successfulRequests++;

    // Update average latency
    const totalLatency =
      this.performanceMetrics.avgLatency * (this.performanceMetrics.successfulRequests - 1) +
      latency;
    this.performanceMetrics.avgLatency = totalLatency / this.performanceMetrics.successfulRequests;

    // Update success rate
    this.performanceMetrics.successRate =
      this.performanceMetrics.successfulRequests / this.performanceMetrics.totalRequests;

    // Update health status metrics
    this.healthStatus.performanceMetrics = {
      avgLatency: this.performanceMetrics.avgLatency,
      successRate: this.performanceMetrics.successRate,
      totalRequests: this.performanceMetrics.totalRequests,
    };
  }

  /**
   * Record failed operation
   */
  private recordFailure(startTime: number): void {
    const latency = Date.now() - startTime;

    // Update success rate
    this.performanceMetrics.successRate =
      this.performanceMetrics.successfulRequests / this.performanceMetrics.totalRequests;

    // Update health status metrics
    this.healthStatus.performanceMetrics = {
      avgLatency: this.performanceMetrics.avgLatency,
      successRate: this.performanceMetrics.successRate,
      totalRequests: this.performanceMetrics.totalRequests,
    };
  }

  protected override buildContextText(context: ContextRequest): string {
    if (this.shouldUseTEI()) {
      return this.teiService.buildContextText(context);
    }
    return super.buildContextText(context);
  }
}
