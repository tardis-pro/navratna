import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceFactory } from '../../service_factory';
import { SmartEmbeddingService } from '../../knowledge-graph/smart_embedding_service';
import { QdrantService } from '../../qdrant_service';

const factory = ServiceFactory.getInstance();

describe('ServiceFactory provider-backed RAG wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    factory.clearServices();
  });

  it('constructs EnhancedRAGService with the smart embedding singleton, never TEI', async () => {
    const smartEmbeddingService = new SmartEmbeddingService({
      resolvedEmbeddingProvider: {
        endpoint: 'https://embeddings.example/v1/embeddings',
        source: 'database',
        apiKey: 'key',
        model: 'embedding-model',
      },
    });
    const qdrantService = new QdrantService('http://qdrant.invalid');

    vi.spyOn(factory, 'initialize').mockResolvedValue();
    const smartSpy = vi
      .spyOn(factory, 'getSmartEmbeddingService')
      .mockResolvedValue(smartEmbeddingService);
    vi.spyOn(factory, 'getQdrantService').mockResolvedValue(qdrantService);
    const teiSpy = vi.spyOn(factory, 'getTEIEmbeddingService');

    const ragService = await factory.getEnhancedRAGService();

    expect(ragService).toBeDefined();
    expect(smartSpy).toHaveBeenCalledTimes(1);
    expect(teiSpy).not.toHaveBeenCalled();
  });
});
