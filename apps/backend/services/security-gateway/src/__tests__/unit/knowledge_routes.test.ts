import { KnowledgeType, SourceType } from '@uaip/types';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

const {
  mockUserKnowledgeService,
  mockKnowledgeGraphService,
  mockServicesHealthCheck,
} = vi.hoisted(() => ({
  mockUserKnowledgeService: {
    addKnowledge: vi.fn(),
    search: vi.fn(),
    getKnowledgeItem: vi.fn(),
    getKnowledgeByTags: vi.fn(),
    updateKnowledge: vi.fn(),
    deleteKnowledge: vi.fn(),
    findRelatedKnowledge: vi.fn(),
    getUserKnowledgeStats: vi.fn(),
  },
  mockKnowledgeGraphService: {
    generateQAFromKnowledge: vi.fn(),
    extractWorkflowsFromChats: vi.fn(),
    analyzeParticipantExpertise: vi.fn(),
    detectLearningMoments: vi.fn(),
    listRelationships: vi.fn(),
    createRelationship: vi.fn(),
    deleteRelationship: vi.fn(),
    getRelationshipById: vi.fn(),
    updateKnowledge: vi.fn(),
  },
  mockServicesHealthCheck: vi.fn(),
}));

vi.mock('@uaip/shared-services', () => ({
  servicesHealthCheck: mockServicesHealthCheck,
  getUserKnowledgeService: vi.fn().mockResolvedValue(mockUserKnowledgeService),
  getKnowledgeGraphService: vi.fn().mockResolvedValue(mockKnowledgeGraphService),
  serviceFactory: { getEnhancedRAGService: vi.fn(), getSmartEmbeddingService: vi.fn() },
  chunkDocument: vi.fn().mockReturnValue([]),
  UnifiedModelSelectionFacade: class {
    selectForSystem = vi.fn();
  },
}));

vi.mock('@uaip/llm-service', () => ({ LLMService: vi.fn() }));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  AuthenticationError: class AuthenticationError extends Error {},
}));

vi.mock('@uaip/middleware', async () => {
  const { t } = await import('elysia');
  const attach = (app: unknown) =>
    (app as { derive: (fn: () => unknown) => unknown }).derive(() => ({
      user: { id: TEST_USER_ID, email: 'test@example.com', role: 'user' },
    }));
  return { t, withOptionalAuth: attach, withRequiredAuth: attach };
});

const { registerKnowledgeRoutes } = await import('../../http/knowledge_elysia.ts');

const makeItem = (overrides: Record<string, unknown> = {}) => ({
  id: '22222222-2222-4222-8222-222222222222',
  content: 'alice: how do I deploy?\n\nbob: run the deploy script',
  type: KnowledgeType.FACTUAL,
  sourceType: SourceType.FILE_SYSTEM,
  sourceIdentifier: 'notes.md',
  tags: ['ops', 'deploy'],
  confidence: 0.9,
  metadata: {},
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  accessLevel: 'private',
  ...overrides,
});

const app = registerKnowledgeRoutes();

const call = async (
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ status: number; body: unknown; text: string; headers: Headers }> => {
  const hasBody = init?.body !== undefined;
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: init?.method ?? 'GET',
      ...(hasBody
        ? {
            body: JSON.stringify(init?.body),
            headers: { 'content-type': 'application/json' },
          }
        : {}),
    })
  );
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON response (export endpoint) */
  }
  return { status: response.status, body, text, headers: response.headers };
};

beforeEach(() => {
  mockUserKnowledgeService.search.mockResolvedValue({
    items: [],
    totalCount: 0,
    searchMetadata: {},
  });
});

describe('POST /api/v1/knowledge/bulk', () => {
  it('uploads every valid item and reports the processed count', async () => {
    mockUserKnowledgeService.addKnowledge.mockResolvedValue({ processedCount: 2, items: [] });

    const res = await call('/api/v1/knowledge/bulk', {
      method: 'POST',
      body: { items: [{ content: 'first' }, { content: 'second' }] },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ uploaded: 2, failed: 0 });
    expect(mockUserKnowledgeService.addKnowledge).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.arrayContaining([expect.objectContaining({ content: 'first' })])
    );
  });

  it('rejects a request with no items array', async () => {
    const res = await call('/api/v1/knowledge/bulk', { method: 'POST', body: { items: [] } });
    expect(res.status).toBe(400);
    expect(mockUserKnowledgeService.addKnowledge).not.toHaveBeenCalled();
  });

  it('reports contentless entries as failures without dropping the valid ones', async () => {
    mockUserKnowledgeService.addKnowledge.mockResolvedValue({ processedCount: 1, items: [] });

    const res = await call('/api/v1/knowledge/bulk', {
      method: 'POST',
      body: { items: [{ content: 'ok' }, { title: 'no content' }] },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ uploaded: 1, failed: 1 });
    expect((res.body as { errors: string[] }).errors[0]).toContain('items[1]');
  });
});

describe('GET /api/v1/knowledge/categories and /tags', () => {
  it('tallies categories by knowledge type in descending count order', async () => {
    mockUserKnowledgeService.search.mockResolvedValue({
      items: [
        makeItem({ id: 'a', type: KnowledgeType.FACTUAL }),
        makeItem({ id: 'b', type: KnowledgeType.EPISODIC }),
        makeItem({ id: 'c', type: KnowledgeType.EPISODIC }),
      ],
      totalCount: 3,
      searchMetadata: {},
    });

    const res = await call('/api/v1/knowledge/categories');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { name: KnowledgeType.EPISODIC, count: 2 },
      { name: KnowledgeType.FACTUAL, count: 1 },
    ]);
  });

  it('tallies every tag across items', async () => {
    mockUserKnowledgeService.search.mockResolvedValue({
      items: [makeItem({ tags: ['ops'] }), makeItem({ id: 'b', tags: ['ops', 'deploy'] })],
      totalCount: 2,
      searchMetadata: {},
    });

    const res = await call('/api/v1/knowledge/tags');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { name: 'ops', count: 2 },
      { name: 'deploy', count: 1 },
    ]);
  });
});

describe('GET /api/v1/knowledge/export', () => {
  it('returns CSV with a header row and one row per item', async () => {
    mockUserKnowledgeService.search.mockResolvedValue({
      items: [makeItem()],
      totalCount: 1,
      searchMetadata: {},
    });

    const res = await call('/api/v1/knowledge/export?format=csv');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('.csv');
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toContain('sourceIdentifier');
    expect(res.text).toContain('ops|deploy');
  });

  it('escapes embedded quotes so CSV stays parseable', async () => {
    mockUserKnowledgeService.search.mockResolvedValue({
      items: [makeItem({ content: 'he said "hi"' })],
      totalCount: 1,
      searchMetadata: {},
    });

    const res = await call('/api/v1/knowledge/export?format=csv');

    expect(res.text).toContain('""hi""');
  });

  it('rejects an unsupported format', async () => {
    const res = await call('/api/v1/knowledge/export?format=xml');
    expect(res.status).toBe(400);
  });

  it('returns JSON when format is json', async () => {
    mockUserKnowledgeService.search.mockResolvedValue({
      items: [makeItem()],
      totalCount: 1,
      searchMetadata: {},
    });

    const res = await call('/api/v1/knowledge/export?format=json');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((res.body as { items: unknown[] }).items).toHaveLength(1);
  });
});

describe('POST /api/v1/knowledge/generate-qa', () => {
  it('maps generated pairs into the client response shape', async () => {
    mockKnowledgeGraphService.generateQAFromKnowledge.mockResolvedValue([
      { question: 'Q1?', answer: 'A1', confidence: 0.8, topic: 'ops', source: 'notes.md' },
    ]);

    const res = await call('/api/v1/knowledge/generate-qa?domain=ops&limit=5', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ generated: 1 });
    expect(mockKnowledgeGraphService.generateQAFromKnowledge).toHaveBeenCalledWith('ops', {
      maxPairs: 5,
    });
  });

  it('surfaces a 500 when generation throws', async () => {
    mockKnowledgeGraphService.generateQAFromKnowledge.mockRejectedValue(new Error('llm down'));
    const res = await call('/api/v1/knowledge/generate-qa', { method: 'POST' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/v1/knowledge/extract-workflows', () => {
  it('returns an empty result when the user has no imported conversations', async () => {
    mockUserKnowledgeService.getKnowledgeByTags.mockResolvedValue([]);

    const res = await call('/api/v1/knowledge/extract-workflows', { method: 'POST', body: {} });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ workflows: [], extracted: 0 });
    expect(mockKnowledgeGraphService.extractWorkflowsFromChats).not.toHaveBeenCalled();
  });

  it('reconstructs conversations from chat-import items before extracting', async () => {
    mockUserKnowledgeService.getKnowledgeByTags.mockResolvedValue([makeItem()]);
    mockKnowledgeGraphService.extractWorkflowsFromChats.mockResolvedValue([{ name: 'deploy' }]);

    const res = await call('/api/v1/knowledge/extract-workflows', { method: 'POST', body: {} });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ extracted: 1 });
    const [conversations] = mockKnowledgeGraphService.extractWorkflowsFromChats.mock.calls[0];
    expect(conversations[0].messages).toHaveLength(2);
    expect(conversations[0].messages[0]).toMatchObject({
      sender: 'alice',
      content: 'how do I deploy?',
    });
    expect(conversations[0].participants).toEqual(['alice', 'bob']);
  });

  it('narrows to the requested conversation ids', async () => {
    mockUserKnowledgeService.getKnowledgeByTags.mockResolvedValue([
      makeItem({ id: 'keep-me' }),
      makeItem({ id: 'drop-me' }),
    ]);
    mockKnowledgeGraphService.extractWorkflowsFromChats.mockResolvedValue([]);

    await call('/api/v1/knowledge/extract-workflows', {
      method: 'POST',
      body: { conversationIds: ['keep-me'] },
    });

    const [conversations] = mockKnowledgeGraphService.extractWorkflowsFromChats.mock.calls[0];
    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe('keep-me');
  });
});

describe('GET /api/v1/knowledge/expertise/:participant', () => {
  it('projects the analyzer profile onto the client contract', async () => {
    mockUserKnowledgeService.getKnowledgeByTags.mockResolvedValue([makeItem()]);
    mockKnowledgeGraphService.analyzeParticipantExpertise.mockResolvedValue([
      {
        id: 'p1',
        participant: 'alice',
        confidenceScore: 0.77,
        domains: [
          {
            domain: 'devops',
            confidence: 0.8,
            indicators: [{ type: 'technical_depth' }],
            knowledge: [{ area: 'kubernetes' }],
          },
        ],
        metadata: { totalMessages: 12 },
      },
    ]);

    const res = await call('/api/v1/knowledge/expertise/alice');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      participant: 'alice',
      overallConfidence: 0.77,
      totalInteractions: 12,
      knowledgeAreas: ['kubernetes'],
    });
    expect((res.body as { domains: unknown[] }).domains[0]).toMatchObject({
      domain: 'devops',
      evidenceCount: 1,
      topics: ['kubernetes'],
    });
  });

  it('returns an empty profile when the participant has no analysed expertise', async () => {
    mockUserKnowledgeService.getKnowledgeByTags.mockResolvedValue([makeItem()]);
    mockKnowledgeGraphService.analyzeParticipantExpertise.mockResolvedValue([]);

    const res = await call('/api/v1/knowledge/expertise/nobody');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      participant: 'nobody',
      domains: [],
      overallConfidence: 0,
    });
  });
});

describe('GET /api/v1/knowledge/learning-insights', () => {
  it('serialises detected learning moments', async () => {
    mockUserKnowledgeService.getKnowledgeByTags.mockResolvedValue([makeItem()]);
    mockKnowledgeGraphService.detectLearningMoments.mockResolvedValue([
      {
        learner: 'bob',
        teacher: 'alice',
        topic: 'deploys',
        content: 'run the script',
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
        confidence: 0.6,
      },
    ]);

    const res = await call('/api/v1/knowledge/learning-insights?participant=bob');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalLearningMoments: 1, activeTopics: ['deploys'] });
    expect((res.body as { insights: { timestamp: string }[] }).insights[0].timestamp).toBe(
      '2026-01-02T00:00:00.000Z'
    );
    expect(mockKnowledgeGraphService.detectLearningMoments).toHaveBeenCalledWith(
      expect.any(Array),
      { participants: ['bob'] }
    );
  });

  it('short-circuits when there are no conversations', async () => {
    mockUserKnowledgeService.getKnowledgeByTags.mockResolvedValue([]);

    const res = await call('/api/v1/knowledge/learning-insights');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalLearningMoments: 0 });
    expect(mockKnowledgeGraphService.detectLearningMoments).not.toHaveBeenCalled();
  });
});

describe('knowledge relationship routes', () => {
  const ITEM_ID = '22222222-2222-4222-8222-222222222222';
  const TARGET_ID = '33333333-3333-4333-8333-333333333333';
  const REL_ID = '44444444-4444-4444-8444-444444444444';

  it('lists relationships for an owned item', async () => {
    mockUserKnowledgeService.getKnowledgeItem.mockResolvedValue(makeItem());
    mockKnowledgeGraphService.listRelationships.mockResolvedValue([
      {
        id: REL_ID,
        sourceId: ITEM_ID,
        targetId: TARGET_ID,
        relationshipType: 'related',
        strength: '0.80',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await call(`/api/v1/knowledge/${ITEM_ID}/relations`);

    expect(res.status).toBe(200);
    expect((res.body as unknown[])[0]).toMatchObject({
      id: REL_ID,
      sourceItemId: ITEM_ID,
      targetItemId: TARGET_ID,
      confidence: 0.8,
    });
  });

  it('refuses to list relationships for an item the caller does not own', async () => {
    mockUserKnowledgeService.getKnowledgeItem.mockResolvedValue(null);

    const res = await call(`/api/v1/knowledge/${ITEM_ID}/relations`);

    expect(res.status).toBe(404);
    expect(mockKnowledgeGraphService.listRelationships).not.toHaveBeenCalled();
  });

  it('creates a relationship only when both endpoints belong to the caller', async () => {
    mockUserKnowledgeService.getKnowledgeItem.mockResolvedValue(makeItem());
    mockKnowledgeGraphService.createRelationship.mockResolvedValue({
      id: REL_ID,
      sourceId: ITEM_ID,
      targetId: TARGET_ID,
      relationshipType: 'depends_on',
      strength: '0.90',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const res = await call(`/api/v1/knowledge/${ITEM_ID}/relations`, {
      method: 'POST',
      body: { targetItemId: TARGET_ID, relationshipType: 'depends_on', confidence: 0.9 },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: REL_ID, relationshipType: 'depends_on' });
  });

  it('rejects a relationship whose target the caller does not own', async () => {
    mockUserKnowledgeService.getKnowledgeItem
      .mockResolvedValueOnce(makeItem())
      .mockResolvedValueOnce(null);

    const res = await call(`/api/v1/knowledge/${ITEM_ID}/relations`, {
      method: 'POST',
      body: { targetItemId: TARGET_ID, relationshipType: 'depends_on' },
    });

    expect(res.status).toBe(404);
    expect(mockKnowledgeGraphService.createRelationship).not.toHaveBeenCalled();
  });

  it('requires targetItemId and relationshipType', async () => {
    const res = await call(`/api/v1/knowledge/${ITEM_ID}/relations`, {
      method: 'POST',
      body: { targetItemId: TARGET_ID },
    });

    expect(res.status).toBe(400);
  });

  it('deletes a relationship whose source the caller owns', async () => {
    mockKnowledgeGraphService.getRelationshipById.mockResolvedValue({
      id: REL_ID,
      sourceId: ITEM_ID,
      targetId: TARGET_ID,
      relationshipType: 'related',
      strength: '0.80',
      createdAt: new Date(),
    });
    mockUserKnowledgeService.getKnowledgeItem.mockResolvedValue(makeItem());
    mockKnowledgeGraphService.deleteRelationship.mockResolvedValue(true);

    const res = await call(`/api/v1/knowledge/relations/${REL_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(mockKnowledgeGraphService.deleteRelationship).toHaveBeenCalledWith(REL_ID);
  });

  it('does not delete a relationship belonging to another user', async () => {
    mockKnowledgeGraphService.getRelationshipById.mockResolvedValue({
      id: REL_ID,
      sourceId: ITEM_ID,
      targetId: TARGET_ID,
      relationshipType: 'related',
      strength: '0.80',
      createdAt: new Date(),
    });
    mockUserKnowledgeService.getKnowledgeItem.mockResolvedValue(null);

    const res = await call(`/api/v1/knowledge/relations/${REL_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(mockKnowledgeGraphService.deleteRelationship).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/knowledge/:itemId', () => {
  it('returns an owned item', async () => {
    const item = makeItem();
    mockUserKnowledgeService.getKnowledgeItem.mockResolvedValue(item);

    const res = await call(`/api/v1/knowledge/${item.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: item.id });
  });

  it('404s for an item the caller cannot access', async () => {
    mockUserKnowledgeService.getKnowledgeItem.mockResolvedValue(null);

    const res = await call('/api/v1/knowledge/22222222-2222-4222-8222-222222222222');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/knowledge/reindex', () => {
  it('re-embeds every item and reports the count', async () => {
    mockUserKnowledgeService.search.mockResolvedValue({
      items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })],
      totalCount: 2,
      searchMetadata: {},
    });
    mockKnowledgeGraphService.updateKnowledge.mockResolvedValue({});

    const res = await call('/api/v1/knowledge/reindex', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ indexed: 2 });
  });

  it('skips items that fail to re-embed without aborting the run', async () => {
    mockUserKnowledgeService.search.mockResolvedValue({
      items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })],
      totalCount: 2,
      searchMetadata: {},
    });
    mockKnowledgeGraphService.updateKnowledge
      .mockRejectedValueOnce(new Error('embedding failed'))
      .mockResolvedValueOnce({});

    const res = await call('/api/v1/knowledge/reindex', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ indexed: 1 });
  });
});
