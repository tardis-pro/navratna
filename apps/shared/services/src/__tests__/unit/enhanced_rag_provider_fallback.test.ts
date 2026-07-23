import { describe, expect, it, vi } from 'vitest';
import { EnhancedRAGService } from '../../knowledge-graph/enhanced_rag_service';
import { EmbeddingService } from '../../knowledge-graph/embedding_service';
import { QdrantService } from '../../qdrant_service';

function makeVectorStore(): QdrantService {
  return new QdrantService('http://qdrant.invalid');
}

describe('EnhancedRAGService reranking fallback', () => {
  it('preserves first-stage vector order and does not fabricate rerank scores when no reranker exists', async () => {
    const embeddingService = new EmbeddingService({
      provider: { baseUrl: 'https://embeddings.example/v1', apiKey: 'key' },
    });
    vi.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue([0.1, 0.2]);

    const vectorStore = makeVectorStore();
    vi.spyOn(vectorStore, 'search').mockResolvedValue([
      { id: 'first', score: 0.91, payload: { content: 'first document' } },
      { id: 'second', score: 0.75, payload: { content: 'second document' } },
    ]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const service = new EnhancedRAGService(embeddingService, vectorStore);
    const results = await service.semanticSearch('query', { topK: 2, useReranking: true });

    expect(results.map((result) => result.id)).toEqual(['first', 'second']);
    expect(results.map((result) => result.score)).toEqual([0.91, 0.75]);
    expect(results.every((result) => result.rerankScore === undefined)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to vector order without fabricated scores when the reranker fails', async () => {
    const embeddingService = new EmbeddingService({
      provider: { baseUrl: 'https://embeddings.example/v1', apiKey: 'key' },
    });
    vi.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue([0.1, 0.2]);

    const vectorStore = makeVectorStore();
    vi.spyOn(vectorStore, 'search').mockResolvedValue([
      { id: 'first', score: 0.91, payload: { content: 'first document' } },
      { id: 'second', score: 0.75, payload: { content: 'second document' } },
    ]);
    const reranker = {
      rerank: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    };

    const service = new EnhancedRAGService(embeddingService, vectorStore, reranker);
    const results = await service.semanticSearch('query', { topK: 2, useReranking: true });

    expect(results.map((result) => result.id)).toEqual(['first', 'second']);
    expect(results.map((result) => result.score)).toEqual([0.91, 0.75]);
    expect(results.every((result) => result.rerankScore === undefined)).toBe(true);
  });
});
