import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInserted = [{ id: 'test-id-1' }, { id: 'test-id-2' }];
const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

vi.mock('@uaip/shared-services', () => ({
  getIntelligenceDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(mockInserted),
      })),
    })),
  })),
  knowledgeItems: {},
  ServiceFactory: {
    getInstance: vi.fn(() => ({
      getSmartEmbeddingService: vi.fn().mockResolvedValue({
        generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
        getEmbeddingDimensions: vi.fn().mockReturnValue(768),
      }),
      getQdrantService: vi.fn().mockResolvedValue({
        store: vi.fn().mockResolvedValue(undefined),
      }),
    })),
  },
}));

vi.mock('@uaip/types', () => ({
  KnowledgeType: { CODE_SYMBOL: 'code_symbol' },
  SourceType: { AST_EXTRACTION: 'ast_extraction' },
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@uaip/config', () => ({
  config: {
    database: { qdrant: { url: 'http://localhost:6333' } },
  },
}));

import { SemanticIndexService } from '../../services/semantic_index_service.js';
import type { SymbolInfo } from '@uaip/types';

function makeOkFetch(body: unknown = { status: 'ok' }) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function makeNotFoundFetch() {
  return Promise.resolve({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('Not Found'),
  } as Response);
}

describe('SemanticIndexService', () => {
  let service: SemanticIndexService;

  beforeEach(() => {
    service = new SemanticIndexService();
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
  });

  it('should skip indexing when no symbols provided', async () => {
    const { logger } = await import('@uaip/utils');
    await service.indexSymbols([], 'repo-1');
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      'Semantic indexing skipped: no symbols found',
      { repoId: 'repo-1' }
    );
  });

  it('should index symbols and upsert to Qdrant with full payload', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);

    const symbols: SymbolInfo[] = [
      { name: 'AgentService', kind: 'class', file: 'src/agent.ts', line: 10 },
    ];

    await service.indexSymbols(symbols, 'repo-1');

    const upsertCall = mockFetch.mock.calls.find(([url]) =>
      typeof url === 'string' && url.includes('code_symbols/points')
    );
    expect(upsertCall).toBeDefined();

    const [, upsertOptions] = upsertCall!;
    const body = JSON.parse((upsertOptions as RequestInit).body as string);
    expect(body.points).toBeInstanceOf(Array);
    expect(body.points[0].payload).toMatchObject({
      name: 'AgentService',
      kind: 'class',
      file: 'src/agent.ts',
      line: 10,
      repoId: 'repo-1',
    });
  });

  it('should include knowledgeItemId in Qdrant payload', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);

    const symbols: SymbolInfo[] = [
      { name: 'createAgent', kind: 'function', file: 'src/agent.ts', line: 50 },
    ];

    await service.indexSymbols(symbols, 'repo-2');

    const upsertCall = mockFetch.mock.calls.find(([url]) =>
      typeof url === 'string' && url.includes('code_symbols/points')
    );
    expect(upsertCall).toBeDefined();
    const [, opts] = upsertCall!;
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.points[0].payload.knowledgeItemId).toBeDefined();
    expect(body.points[0].id).toBe('test-id-1');
  });

  it('should degrade gracefully when Qdrant upsert fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)
      .mockRejectedValue(new Error('Qdrant connection refused'));

    const symbols: SymbolInfo[] = [
      { name: 'Foo', kind: 'class', file: 'src/foo.ts', line: 1 },
    ];

    await expect(service.indexSymbols(symbols, 'repo-3')).resolves.not.toThrow();
  });

  it('should bootstrap code_symbols collection (PUT) when it does not exist', async () => {
    mockFetch
      .mockResolvedValueOnce(makeNotFoundFetch())
      .mockResolvedValueOnce(makeOkFetch());

    await service.bootstrapCodeSymbolsCollection();

    const createCall = mockFetch.mock.calls.find(([, opts]) => {
      const o = opts as RequestInit;
      return o.method === 'PUT';
    });
    expect(createCall).toBeDefined();
    const [url, opts] = createCall!;
    expect(url).toContain('code_symbols');
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.vectors.size).toBe(768);
    expect(body.vectors.distance).toBe('Cosine');
  });

  it('should skip collection creation when it already exists', async () => {
    mockFetch.mockResolvedValue(makeOkFetch());

    await service.bootstrapCodeSymbolsCollection();
    await service.bootstrapCodeSymbolsCollection();

    const putCalls = mockFetch.mock.calls.filter(([, opts]) => (opts as RequestInit).method === 'PUT');
    expect(putCalls.length).toBe(0);
  });

  it('semanticSearch should return mapped results from Qdrant', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOkFetch())
      .mockResolvedValueOnce(
        makeOkFetch({
          result: [
            {
              id: 'id-123',
              score: 0.9,
              payload: {
                knowledgeItemId: 'id-123',
                name: 'AgentService',
                kind: 'class',
                file: 'src/agent.ts',
                line: 10,
                repoId: 'repo-1',
              },
            },
          ],
        })
      );

    const results = await service.semanticSearch('agent service', 'repo-1', 5);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      knowledgeItemId: 'id-123',
      name: 'AgentService',
      kind: 'class',
      file: 'src/agent.ts',
      score: 0.9,
      repoId: 'repo-1',
    });
  });

  it('semanticSearch should filter by repoId in Qdrant payload filter', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOkFetch())
      .mockResolvedValueOnce(makeOkFetch({ result: [] }));

    await service.semanticSearch('query', 'repo-x', 10);

    const searchCall = mockFetch.mock.calls.find(([url]) =>
      typeof url === 'string' && url.includes('points/search')
    );
    expect(searchCall).toBeDefined();
    const [, opts] = searchCall!;
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.filter.must[0].key).toBe('repoId');
    expect(body.filter.must[0].match.value).toBe('repo-x');
  });

  it('semanticSearch should return empty array when Qdrant fails', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));

    const results = await service.semanticSearch('query', 'repo-1', 5);
    expect(results).toEqual([]);
  });

  it('should include symbol metadata in knowledge item values', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);

    const { getIntelligenceDb } = await import('@uaip/shared-services');
    const mockInsertValuesLocal = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'id-1' }]),
    });
    vi.mocked(getIntelligenceDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({ values: mockInsertValuesLocal }),
    } as never);

    const symbols: SymbolInfo[] = [
      { name: 'MyClass', kind: 'class', file: 'src/my.ts', line: 5 },
    ];

    await service.indexSymbols(symbols, 'repo-2');

    expect(mockInsertValuesLocal).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({ title: 'MyClass', kind: 'class' }),
          tags: expect.arrayContaining(['code-symbol', 'class']),
        }),
      ])
    );
  });
});
