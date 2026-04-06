import { VectorSearchResult } from '@uaip/types';
import { TEIEmbeddingService } from './tei_embedding_service';
import { QdrantService } from '../qdrant_service';

export interface SearchResult {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  score: number;
  embedding?: number[];
}

export interface EnhancedSearchResult extends SearchResult {
  rerankScore?: number;
  originalScore: number;
  rank: number;
}

export interface SearchOptions {
  topK?: number;
  minScore?: number;
  useReranking?: boolean;
  rerankTopK?: number;
  includeEmbeddings?: boolean;
  filters?: Record<string, unknown>;
}

type VectorCandidate = VectorSearchResult;

type StoredVectorDocument = {
  id: string;
  embedding?: number[];
};

function getPayloadString(payload: Record<string, unknown>, key: string): string {
  const val = payload[key];
  return typeof val === 'string' ? val : '';
}

function getPayloadRecord(payload: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const val = payload[key];
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return undefined;
  return val as Record<string, unknown>;
}

function getPayloadNumberArray(payload: Record<string, unknown>, key: string): number[] | undefined {
  const val = payload[key];
  if (!Array.isArray(val)) return undefined;
  return val as number[];
}

function mapCandidateToResult(candidate: VectorCandidate, index: number, includeEmbeddings = false): EnhancedSearchResult {
  const payload = candidate.payload;
  return {
    id: candidate.id,
    content: getPayloadString(payload, 'content'),
    metadata: getPayloadRecord(payload, 'metadata'),
    score: candidate.score,
    originalScore: candidate.score,
    rank: index + 1,
    embedding: includeEmbeddings ? getPayloadNumberArray(payload, 'embedding') : undefined,
  };
}

export class EnhancedRAGService {
  constructor(
    private embeddingService: TEIEmbeddingService,
    private vectorStore: QdrantService
  ) {}

  /**
   * Perform semantic search with optional reranking
   */
  async semanticSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    const {
      topK = 10,
      minScore = 0.0,
      useReranking = true,
      rerankTopK = topK * 2,
      includeEmbeddings = false,
      filters = {},
    } = options;

    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    try {
      // Step 1: Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Step 2: Vector similarity search (get more candidates for reranking)
      const searchLimit = useReranking ? Math.max(rerankTopK, topK * 2) : topK;
      const candidates = await this.vectorStore.search(queryEmbedding, {
        limit: searchLimit,
        threshold: minScore,
        filters: filters,
      });

      // Filter by minimum score
      const filteredCandidates = candidates.filter((c) => c.score >= minScore);

      if (filteredCandidates.length === 0) {
        return [];
      }

      let results: EnhancedSearchResult[];

      if (useReranking && filteredCandidates.length > 1) {
        // Step 3: Rerank results for better relevance
        const candidatesWithContent = filteredCandidates.map((c) => ({
          id: c.id,
          content: typeof c.payload?.content === 'string' ? c.payload.content : '',
          metadata: (typeof c.payload?.metadata === 'object' && c.payload.metadata !== null)
            ? (c.payload.metadata as Record<string, unknown>)
            : undefined,
          score: c.score,
        }));
        results = await this.rerankResults(query, candidatesWithContent, topK);
      } else {
        // Use vector similarity scores only
        results = filteredCandidates.slice(0, topK).map((c, i) => mapCandidateToResult(c, i, includeEmbeddings));
      }

      return results;
    } catch (error) {
      console.error('Enhanced semantic search failed:', error);
      const wrappedError = new Error(`Semantic search failed: ${error instanceof Error ? error.message : String(error)}`);
      Object.assign(wrappedError, { cause: error });
      throw wrappedError;
    }
  }

  /**
   * Perform hybrid search combining keyword and semantic search
   */
  async hybridSearch(
    query: string,
    keywordResults: SearchResult[],
    options: SearchOptions = {}
  ): Promise<EnhancedSearchResult[]> {
    const semanticResults = await this.semanticSearch(query, options);

    // Combine and deduplicate results
    const combinedResults = this.combineSearchResults(
      keywordResults,
      semanticResults,
      options.topK || 10
    );

    return combinedResults;
  }

  /**
   * Index documents with embeddings
   */
  async indexDocuments(
    documents: Array<{
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<void> {
    if (!documents || documents.length === 0) {
      return;
    }

    try {
      // Generate embeddings for all documents
      const contents = documents.map((doc) => doc.content);
      const embeddings = await this.embeddingService.generateBatchEmbeddings(contents);

      // Prepare documents for vector store
      const vectorDocuments = documents.map((doc, index) => ({
        id: doc.id,
        content: doc.content,
        embedding: embeddings[index],
        metadata: doc.metadata || {},
      }));

      // Store in vector database
      await this.vectorStore.upsert(vectorDocuments);
    } catch (error) {
      console.error('Document indexing failed:', error);
      const wrappedError = new Error(`Failed to index documents: ${error instanceof Error ? error.message : String(error)}`);
      Object.assign(wrappedError, { cause: error });
      throw wrappedError;
    }
  }

  /**
   * Find similar documents to a given document
   */
  async findSimilarDocuments(
    documentId: string,
    topK: number = 5,
    minScore: number = 0.7
  ): Promise<EnhancedSearchResult[]> {
    try {
      // Get the document and its embedding
      const docResult = await this.vectorStore.getById(documentId);
      const document: StoredVectorDocument | null = docResult
        ? { id: docResult.id, embedding: Array.isArray(docResult.embedding) ? docResult.embedding : undefined }
        : null;
      if (!document || !document.embedding) {
        throw new Error(`Document ${documentId} not found or missing embedding`);
      }

      // Search for similar documents
      const candidates = await this.vectorStore.search(document.embedding, {
        limit: topK + 1,
        threshold: minScore,
        filters: { exclude_ids: [documentId] },
      });

      // Filter by minimum score and format results
      return candidates
        .filter((c) => c.score >= minScore)
        .slice(0, topK)
        .map((c, i) => mapCandidateToResult(c, i));
    } catch (error) {
      console.error('Similar documents search failed:', error);
      const wrappedError = new Error(`Failed to find similar documents: ${error instanceof Error ? error.message : String(error)}`);
      Object.assign(wrappedError, { cause: error });
      throw wrappedError;
    }
  }

  /**
   * Get query suggestions based on semantic similarity
   */
  async getQuerySuggestions(
    partialQuery: string,
    existingQueries: string[],
    topK: number = 5
  ): Promise<string[]> {
    if (!partialQuery || partialQuery.trim().length < 2) {
      return [];
    }

    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(partialQuery);
      const queryEmbeddings = await this.embeddingService.generateBatchEmbeddings(existingQueries);

      // Calculate similarities
      const similarities = await Promise.all(
        queryEmbeddings.map((embedding) =>
          this.embeddingService.calculateSimilarity(queryEmbedding, embedding)
        )
      );

      // Sort by similarity and return top suggestions
      const suggestions = existingQueries
        .map((query, index) => ({ query, similarity: similarities[index] }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK)
        .map((item) => item.query);

      return suggestions;
    } catch (error) {
      console.error('Query suggestions failed:', error);
      return [];
    }
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<{
    embedding: unknown;
    reranker: unknown;
    vectorStore: boolean;
  }> {
    try {
      const [teiHealth, vectorStoreHealth] = await Promise.allSettled([
        this.embeddingService.checkHealth(),
        Promise.resolve(this.vectorStore.isHealthy()),
      ]);

      return {
        embedding:
          teiHealth.status === 'fulfilled' ? teiHealth.value.embedding : { status: 'error' },
        reranker: teiHealth.status === 'fulfilled' ? teiHealth.value.reranker : { status: 'error' },
        vectorStore: vectorStoreHealth.status === 'fulfilled' ? vectorStoreHealth.value : false,
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        embedding: { status: 'error' },
        reranker: { status: 'error' },
        vectorStore: false,
      };
    }
  }

  /**
   * Private method to rerank search results
   */
  private async rerankResults(
    query: string,
    candidates: SearchResult[],
    topK: number
  ): Promise<EnhancedSearchResult[]> {
    try {
      const documents = candidates.map((c) => c.content);
      const rerankResults = await this.embeddingService.rerank(query, documents, topK);

      // Map rerank results back to original candidates
      const enhancedResults: EnhancedSearchResult[] = rerankResults.map((rerankResult, rank) => {
        const originalCandidate = candidates[rerankResult.index];
        return {
          ...originalCandidate,
          rerankScore: rerankResult.score,
          originalScore: originalCandidate.score,
          rank: rank + 1,
          score: rerankResult.score, // Use rerank score as primary score
        };
      });

      return enhancedResults;
    } catch (error) {
      console.error('Reranking failed, falling back to vector scores:', error);

      // Fallback to original vector similarity scores
      return candidates.slice(0, topK).map((candidate, index) => ({
        ...candidate,
        originalScore: candidate.score,
        rank: index + 1,
      }));
    }
  }

  /**
   * Combine keyword and semantic search results
   */
  private combineSearchResults(
    keywordResults: SearchResult[],
    semanticResults: EnhancedSearchResult[],
    topK: number
  ): EnhancedSearchResult[] {
    // Create a map to avoid duplicates
    const resultMap = new Map<string, EnhancedSearchResult>();

    // Add semantic results first (they have rerank scores)
    semanticResults.forEach((result) => {
      resultMap.set(result.id, result);
    });

    // Add keyword results, but don't override semantic results
    keywordResults.forEach((result, index) => {
      if (!resultMap.has(result.id)) {
        resultMap.set(result.id, {
          ...result,
          originalScore: result.score,
          rank: semanticResults.length + index + 1,
        });
      }
    });

    // Sort by score (rerank score for semantic results, original score for others)
    const combinedResults = Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Update ranks after sorting
    combinedResults.forEach((result, index) => {
      result.rank = index + 1;
    });

    return combinedResults;
  }
}
