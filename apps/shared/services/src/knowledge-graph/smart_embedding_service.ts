import { EmbeddingService } from './embedding_service';
import { logger } from '@uaip/utils';
import type { ResolvedEmbeddingProvider, ResolvedRerankingProvider } from './embedding_provider_resolver';
import type { EmbeddingPort, RerankingPort, RerankResultItem } from './provider_reranking';
import { createRerankingPort } from './provider_reranking';

export interface SmartEmbeddingServiceOptions {
  resolvedEmbeddingProvider?: ResolvedEmbeddingProvider | null;
  resolvedRerankingProvider?: ResolvedRerankingProvider | null;
  reranker?: RerankingPort | null;
  apiKey?: string;
  embeddingModel?: string;
}

export interface SmartEmbeddingStatus {
  activeService: 'provider';
  rerankerAvailable: boolean;
  embeddingDimensions: number;
  performanceMetrics: EmbeddingPerformanceMetrics;
}

export interface EmbeddingPerformanceMetrics {
  avgLatency: number;
  successRate: number;
  totalRequests: number;
}

/**
 * Provider-backed embedding service.
 *
 * Embeddings always go through the configured provider (DB-resolved with a
 * decrypted key, else the EMBEDDINGS_URL environment fallback) — there is no
 * implicit localhost TEI probing, no background health polling, and no
 * fabricated rerank scores. Reranking happens only when a reranking provider
 * was explicitly configured; otherwise `rerank()` returns null and callers
 * degrade to first-stage vector order.
 */
export class SmartEmbeddingService extends EmbeddingService {
  private readonly reranker: RerankingPort | null;
  private readonly embeddingDimensions: number;
  private readonly performanceMetrics = {
    avgLatency: 0,
    successRate: 1.0,
    totalRequests: 0,
    successfulRequests: 0,
  };

  constructor(options: SmartEmbeddingServiceOptions = {}) {
    super({
      provider: options.resolvedEmbeddingProvider ?? null,
      apiKey: options.apiKey,
      model: options.embeddingModel,
    });

    this.reranker = options.reranker ?? createRerankingPort(options.resolvedRerankingProvider ?? null);
    // EMBEDDINGS_DIM sizes the Qdrant collection for the configured provider
    // (1536 = OpenAI ada-002 default; 1024 for the CF bge-large-en-v1.5 worker).
    this.embeddingDimensions = parseInt(process.env.EMBEDDINGS_DIM ?? '1536', 10);
  }

  override async generateEmbedding(text: string): Promise<number[]> {
    const startTime = Date.now();
    this.performanceMetrics.totalRequests++;
    try {
      const embedding = await super.generateEmbedding(text);
      this.recordSuccess(startTime);
      return embedding;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  override async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();
    this.performanceMetrics.totalRequests++;
    try {
      const embeddings = await super.generateBatchEmbeddings(texts);
      this.recordSuccess(startTime);
      return embeddings;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Rerank documents via the configured reranking provider.
   * Returns null when no reranker is configured — callers must keep the
   * first-stage vector order and must not fabricate scores. Provider failures
   * propagate so callers can apply their explicit fallback.
   */
  async rerank(query: string, documents: string[], topK?: number): Promise<RerankResultItem[] | null> {
    if (!this.reranker) {
      return null;
    }
    return this.reranker.rerank(query, documents, topK);
  }

  /**
   * Whether a reranking provider is configured.
   */
  hasReranker(): boolean {
    return this.reranker !== null;
  }

  /**
   * Get embedding dimensions for the configured provider.
   */
  getEmbeddingDimensions(): number {
    return this.embeddingDimensions;
  }

  async getStatus(): Promise<SmartEmbeddingStatus> {
    return {
      activeService: 'provider',
      rerankerAvailable: this.reranker !== null,
      embeddingDimensions: this.embeddingDimensions,
      performanceMetrics: {
        avgLatency: this.performanceMetrics.avgLatency,
        successRate: this.performanceMetrics.successRate,
        totalRequests: this.performanceMetrics.totalRequests,
      },
    };
  }

  async checkHealth(): Promise<SmartEmbeddingStatus> {
    try {
      // Lightweight probe: a single embedding round-trip against the
      // configured provider. No background polling.
      await this.generateEmbedding('health-check');
      return this.getStatus();
    } catch (error) {
      logger.warn('Embedding provider health check failed', {
        service: 'smart-embedding-service',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private recordSuccess(startTime: number): void {
    const latency = Date.now() - startTime;
    this.performanceMetrics.successfulRequests++;
    const totalLatency =
      this.performanceMetrics.avgLatency * (this.performanceMetrics.successfulRequests - 1) +
      latency;
    this.performanceMetrics.avgLatency =
      totalLatency / this.performanceMetrics.successfulRequests;
    this.performanceMetrics.successRate =
      this.performanceMetrics.successfulRequests / this.performanceMetrics.totalRequests;
  }

  private recordFailure(): void {
    this.performanceMetrics.successRate =
      this.performanceMetrics.totalRequests > 0
        ? this.performanceMetrics.successfulRequests / this.performanceMetrics.totalRequests
        : 1.0;
  }
}

export type { EmbeddingPort };
