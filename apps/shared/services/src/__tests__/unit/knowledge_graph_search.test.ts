import { KnowledgeType, SourceType } from '@uaip/types';
import { describe, expect, it, vi } from 'vitest';

import { KnowledgeRepository } from '../../database/repositories/knowledge_repository';
import { EmbeddingService } from '../../knowledge-graph/embedding_service';
import { KnowledgeGraphService } from '../../knowledge-graph/knowledge_graph_service';
import { RelationshipDetector } from '../../knowledge-graph/relationship_detector_service';
import type { RerankingPort } from '../../knowledge-graph/provider_reranking';
import { KnowledgeSyncService } from '../../knowledge-graph/knowledge_sync_service';
import { ContentClassifier } from '../../knowledge-graph/content_classifier_service';
import { QdrantService } from '../../qdrant_service';

const firstItem = {
  id: '11111111-1111-4111-8111-111111111111',
  content: 'first document',
  type: KnowledgeType.FACTUAL,
  sourceType: SourceType.USER_INPUT,
  sourceIdentifier: 'first',
  sourceUrl: null,
  tags: ['uat'],
  confidence: 0.8,
  metadata: {},
  createdAt: new Date('2026-08-13T00:00:00Z'),
  updatedAt: new Date('2026-08-13T00:00:00Z'),
  createdBy: null,
  organizationId: '00000000-0000-0000-0000-000000000001',
  accessLevel: 'private',
  userId: '22222222-2222-4222-8222-222222222222',
  agentId: null,
  summary: null,
};

const secondItem = {
  ...firstItem,
  id: '33333333-3333-4333-8333-333333333333',
  content: 'second document',
  sourceIdentifier: 'second',
};

function createService(reranker?: RerankingPort) {
  const vectorDb = new QdrantService('http://qdrant.invalid');
  vi.spyOn(vectorDb, 'search').mockResolvedValue([
    { id: firstItem.id, score: 0.91, payload: { content: firstItem.content } },
    { id: secondItem.id, score: 0.75, payload: { content: secondItem.content } },
  ]);
  const repository = new KnowledgeRepository();
  vi.spyOn(repository, 'getItems').mockResolvedValue([firstItem, secondItem]);
  const embeddings = new EmbeddingService({
    provider: {
      endpoint: 'https://embeddings.example/v1',
      source: 'environment',
      apiKey: 'key',
    },
  });
  vi.spyOn(embeddings, 'generateEmbedding').mockResolvedValue([0.1, 0.2]);
  const classifier = new ContentClassifier();
  const relationshipDetector = Object.create(
    RelationshipDetector.prototype
  ) as RelationshipDetector;
  const knowledgeSync = Object.create(KnowledgeSyncService.prototype) as KnowledgeSyncService;

  return {
    service: new KnowledgeGraphService(
      vectorDb,
      repository,
      embeddings,
      classifier,
      relationshipDetector,
      knowledgeSync,
      reranker
    ),
    vectorDb,
    repository,
  };
}

describe('KnowledgeGraphService search', () => {
  it('returns only vector hits and preserves vector rank when no reranker exists', async () => {
    const { service, vectorDb, repository } = createService();

    const result = await service.search({
      query: 'query',
      scope: { userId: firstItem.userId },
      options: { limit: 2 },
      timestamp: Date.now(),
    });

    expect(result.items.map((item) => item.id)).toEqual([firstItem.id, secondItem.id]);
    expect(result.searchMetadata.similarityScores).toEqual([0.91, 0.75]);
    expect(repository.getItems).toHaveBeenCalledWith([firstItem.id, secondItem.id]);
    expect(vectorDb.search).toHaveBeenCalledWith(
      [0.1, 0.2],
      expect.objectContaining({
        filters: expect.objectContaining({
          must: expect.arrayContaining([
            { key: 'user_id', match: { value: firstItem.userId } },
          ]),
        }),
      }),
      expect.any(Object)
    );
  });

  it('uses provider scores and provider order when reranking succeeds', async () => {
    const reranker: RerankingPort = {
      rerank: vi.fn().mockResolvedValue([
        { index: 1, score: 0.98 },
        { index: 0, score: 0.42 },
      ]),
    };
    const { service } = createService(reranker);

    const result = await service.search({
      query: 'query',
      scope: { userId: firstItem.userId },
      options: { limit: 2 },
      timestamp: Date.now(),
    });

    expect(result.items.map((item) => item.id)).toEqual([secondItem.id, firstItem.id]);
    expect(result.searchMetadata.similarityScores).toEqual([0.98, 0.42]);
    expect(reranker.rerank).toHaveBeenCalledWith(
      'query',
      [firstItem.content, secondItem.content],
      2
    );
  });
});
