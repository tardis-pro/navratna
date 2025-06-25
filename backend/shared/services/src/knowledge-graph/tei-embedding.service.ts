import { ContextRequest } from '@uaip/types';

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
}

export class TEIEmbeddingService {
  private embeddingBaseUrl: string;
  private rerankerBaseUrl: string;
  private timeout: number;
  private retryAttempts: number;

  constructor(
    embeddingBaseUrl: string = process.env.TEI_EMBEDDING_URL || 'http://localhost:8080',
    rerankerBaseUrl: string = process.env.TEI_RERANKER_URL || 'http://localhost:8081',
    timeout: number = 30000,
    retryAttempts: number = 3
  ) {
    this.embeddingBaseUrl = embeddingBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.rerankerBaseUrl = rerankerBaseUrl.replace(/\/$/, '');
    this.timeout = timeout;
    this.retryAttempts = retryAttempts;
  }

  /**
   * Check health status of TEI services
   */
  async checkHealth(): Promise<{ embedding: TEIHealthStatus; reranker: TEIHealthStatus }> {
    const [embeddingHealth, rerankerHealth] = await Promise.allSettled([
      this.fetchWithTimeout(`${this.embeddingBaseUrl}/healthz`),
      this.fetchWithTimeout(`${this.rerankerBaseUrl}/healthz`)
    ]);

    return {
      embedding: embeddingHealth.status === 'fulfilled' 
        ? await embeddingHealth.value.json()
        : { status: 'error' },
      reranker: rerankerHealth.status === 'fulfilled'
        ? await rerankerHealth.value.json()
        : { status: 'error' }
    };
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
        body: JSON.stringify({ inputs: text })
      });

      if (!response.ok) {
        throw new Error(`TEI embedding error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // TEI returns array of embeddings, we want the first one for single input
      return Array.isArray(data) && Array.isArray(data[0]) ? data[0] : data;
    } catch (error) {
      console.error('TEI embedding generation failed:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
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
    const validTexts = texts.filter(text => text && text.trim().length > 0);
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
          body: JSON.stringify({ inputs: batch })
        });

        if (!response.ok) {
          throw new Error(`TEI batch embedding error: ${response.status} ${response.statusText}`);
        }

        return response.json();
      });

      const batchResults = await Promise.all(batchPromises);
      return batchResults.flat();
    } catch (error) {
      console.error('TEI batch embedding generation failed:', error);
      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
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
    const validDocuments = documents.filter(doc => doc && doc.trim().length > 0);
    if (validDocuments.length === 0) {
      return [];
    }

    try {
      const response = await this.fetchWithRetry(`${this.rerankerBaseUrl}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: query.trim(),
          texts: validDocuments
        })
      });

      if (!response.ok) {
        throw new Error(`TEI reranking error: ${response.status} ${response.statusText}`);
      }

      const results: RerankResult[] = await response.json();
      
      // Sort by score descending and optionally limit results
      results.sort((a, b) => b.score - a.score);
      
      return topK ? results.slice(0, topK) : results;
    } catch (error) {
      console.error('TEI reranking failed:', error);
      throw new Error(`Failed to rerank documents: ${error.message}`);
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
   * Calculate cosine similarity between two embeddings
   */
  async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return similarity;
  }

  /**
   * Split content into chunks suitable for embedding
   */
  protected splitIntoChunks(content: string, maxChunkSize: number = 500): string[] {
    if (content.length <= maxChunkSize) {
      return [content];
    }

    const chunks: string[] = [];
    const sentences = content.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      if ((currentChunk + trimmedSentence).length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = trimmedSentence;
        } else {
          // Single sentence is too long, split by words
          const words = trimmedSentence.split(' ');
          let wordChunk = '';
          for (const word of words) {
            if ((wordChunk + ' ' + word).length > maxChunkSize) {
              if (wordChunk) {
                chunks.push(wordChunk.trim());
                wordChunk = word;
              } else {
                // Single word is too long, truncate
                chunks.push(word.substring(0, maxChunkSize));
              }
            } else {
              wordChunk += (wordChunk ? ' ' : '') + word;
            }
          }
          if (wordChunk) {
            currentChunk = wordChunk;
          }
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Build a text representation of the context
   */
  buildContextText(context: ContextRequest): string {
    const parts: string[] = [];

    // Add user request
    if (context.userRequest) {
      parts.push(`User Request: ${context.userRequest}`);
    }

    // Add current context if available
    if (context.currentContext) {
      parts.push(`Current Context: ${JSON.stringify(context.currentContext)}`);
    }

    // Add conversation history
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      parts.push('Conversation History:');
      context.conversationHistory.forEach(msg => {
        parts.push(`${msg.role}: ${msg.content}`);
      });
    }

    // Add agent capabilities if available
    if (context.agentCapabilities && context.agentCapabilities.length > 0) {
      parts.push(`Agent Capabilities: ${context.agentCapabilities.join(', ')}`);
    }

    return parts.join('\n');
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
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options);
        
        // Don't retry on client errors (4xx), only on server errors (5xx) and network issues
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }
        
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      } catch (error) {
        lastError = error;
        
        if (attempt === this.retryAttempts) {
          break;
        }

        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(`TEI request failed (attempt ${attempt}/${this.retryAttempts}), retrying in ${delay}ms:`, error.message);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
} 