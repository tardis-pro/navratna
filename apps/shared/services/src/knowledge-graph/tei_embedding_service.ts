import { ContextRequest } from '@uaip/types';
import { BaseEmbeddingService } from './base_embedding_service.js';

export interface RerankResult {
  index: number;
  score: number;
  document: string;
}

export interface TEIHealthStatus {
  status: 'ready' | 'loading' | 'error';
  model_id?: string;
  model_dtype?: string;
  max_concurrent_requests?: number;
  max_batch_tokens?: number;
  message?: string;
}

export class TEIEmbeddingService extends BaseEmbeddingService {
  private embeddingBaseUrl: string;
  private rerankerBaseUrl: string;
  private timeout: number;
  private retryAttempts: number;

  constructor(
    embeddingBaseUrl: string = process.env.TEI_EMBEDDING_URL || 'http://localhost:8080',
    rerankerBaseUrl: string = process.env.TEI_RERANKER_URL || 'http://localhost:8083',
    timeout: number = 30000,
    retryAttempts: number = 3
  ) {
    super();
    this.embeddingBaseUrl = embeddingBaseUrl.replace(/\/$/, '');
    this.rerankerBaseUrl = rerankerBaseUrl.replace(/\/$/, '');
    this.timeout = timeout;
    this.retryAttempts = retryAttempts;
  }

  /**
   * Check health status of TEI services
   */
  async checkHealth(): Promise<{ embedding: TEIHealthStatus; reranker: TEIHealthStatus }> {
    const [embeddingHealth, rerankerHealth] = await Promise.allSettled([
      this.fetchWithTimeout(`${this.embeddingBaseUrl}/health`),
      this.fetchWithTimeout(`${this.rerankerBaseUrl}/health`),
    ]);

    // Helper to safely parse TEI health response
    const parseTEIHealth = async (
      result: PromiseFulfilledResult<Response> | PromiseRejectedResult
    ): Promise<TEIHealthStatus> => {
      if (result.status !== 'fulfilled') {
        console.error('TEI health check failed: request was not fulfilled', result);
        return { status: 'error', message: 'Request not fulfilled' };
      }
      try {
        if (result.value.status === 200) {
          return { status: 'ready', message: 'Ready' };
        } else {
          return { status: 'error', message: 'Error' };
        }
      } catch (err) {
        console.error('TEI health check failed: error reading response', err);
        return { status: 'error', message: 'Error reading response' };
      }
    };

    const health = {
      embedding: await parseTEIHealth(embeddingHealth),
      reranker: await parseTEIHealth(rerankerHealth),
    };

    return health;
  }

  /**
   * Generate single embedding
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Input text cannot be empty');
    }

    try {
      const response = await this.fetchWithRetry(`${this.embeddingBaseUrl}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: text }),
      });

      if (!response.ok) {
        throw new Error(`TEI embedding error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // TEI returns array of embeddings, we want the first one for single input
      const dataArr = data as unknown[];
      return (
        Array.isArray(dataArr) && Array.isArray(dataArr[0]) ? dataArr[0] : dataArr
      ) as number[];
    } catch (error) {
      console.error('TEI embedding generation failed:', error);
      const wrappedError = new Error(`Failed to generate embedding: ${error.message}`);
      (wrappedError as Error & { cause?: unknown }).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Generate batch embeddings with automatic chunking
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Filter out empty texts
    const validTexts = texts.filter((text) => text && text.trim().length > 0);
    if (validTexts.length === 0) {
      return [];
    }

    try {
      // TEI supports up to 32 inputs per batch by default
      const batchSize = 32;
      const batches: string[][] = [];

      for (let i = 0; i < validTexts.length; i += batchSize) {
        batches.push(validTexts.slice(i, i + batchSize));
      }

      const batchPromises = batches.map(async (batch) => {
        const response = await this.fetchWithRetry(`${this.embeddingBaseUrl}/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: batch }),
        });

        if (!response.ok) {
          throw new Error(`TEI batch embedding error: ${response.status} ${response.statusText}`);
        }

        return response.json();
      });

      const batchResults = await Promise.all(batchPromises);
      return (batchResults.flat() as unknown[]).flat() as number[][];
    } catch (error) {
      console.error('TEI batch embedding generation failed:', error);
      const wrappedError = new Error(`Failed to generate batch embeddings: ${error.message}`);
      (wrappedError as Error & { cause?: unknown }).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Rerank documents based on query relevance
   */
  async rerank(query: string, documents: string[], topK?: number): Promise<RerankResult[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    if (!documents || documents.length === 0) {
      return [];
    }

    // Filter out empty documents
    const validDocuments = documents.filter((doc) => doc && doc.trim().length > 0);
    if (validDocuments.length === 0) {
      return [];
    }

    try {
      const response = await this.fetchWithRetry(`${this.rerankerBaseUrl}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          texts: validDocuments,
        }),
      });

      if (!response.ok) {
        throw new Error(`TEI reranking error: ${response.status} ${response.statusText}`);
      }

      const results = (await response.json()) as RerankResult[];

      // Sort by score descending and optionally limit results
      results.sort((a, b) => b.score - a.score);

      return topK ? results.slice(0, topK) : results;
    } catch (error) {
      console.error('TEI reranking failed:', error);
      const wrappedError = new Error(`Failed to rerank documents: ${error.message}`);
      (wrappedError as Error & { cause?: unknown }).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Generate embeddings for content chunks
   */
  async generateEmbeddings(content: string): Promise<number[][]> {
    const chunks = this.splitIntoChunks(content);
    return this.generateBatchEmbeddings(chunks);
  }

  /**
   * Generate context embedding
   */
  async generateContextEmbedding(context: ContextRequest): Promise<number[]> {
    const contextText = this.buildContextText(context);
    return this.generateEmbedding(contextText);
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const wrappedError = new Error(`Request timeout after ${this.timeout}ms`);
        (wrappedError as Error & { cause?: unknown }).cause = error;
        throw wrappedError;
      }
      throw error;
    }
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
    let lastError: Error = new Error('No attempts made');

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        const response = await this.fetchWithTimeout(url, options);

        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }

        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.retryAttempts) {
          break;
        }

        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(
          `TEI request failed (attempt ${attempt}/${this.retryAttempts}), retrying in ${delay}ms:`,
          lastError.message
        );

        // oxlint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
