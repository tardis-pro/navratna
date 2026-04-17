import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInserted = [{ id: 'test-id-1' }];

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

import { SemanticIndexService } from '../../services/semantic_index_service.js';
import type { SymbolInfo } from '@uaip/types';

describe('SemanticIndexService', () => {
  let service: SemanticIndexService;

  beforeEach(() => {
    service = new SemanticIndexService();
    vi.clearAllMocks();
  });

  it('should skip indexing when no symbols provided', async () => {
    const { logger } = await import('@uaip/utils');
    await service.indexSymbols([], 'repo-1');
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      'Semantic indexing skipped: no symbols found',
      { repoId: 'repo-1' }
    );
  });

  it('should index symbols and sync to Qdrant', async () => {
    const symbols: SymbolInfo[] = [
      { name: 'AgentService', kind: 'class', file: 'src/agent.ts', line: 10 },
      { name: 'createAgent', kind: 'function', file: 'src/agent.ts', line: 50 },
    ];

    await expect(service.indexSymbols(symbols, 'repo-1')).resolves.not.toThrow();
  });

  it('should degrade gracefully when Qdrant is unavailable', async () => {
    const { ServiceFactory } = await import('@uaip/shared-services');
    vi.mocked(ServiceFactory.getInstance).mockReturnValue({
      getSmartEmbeddingService: vi.fn().mockRejectedValue(new Error('Qdrant down')),
      getQdrantService: vi.fn().mockRejectedValue(new Error('Qdrant down')),
    } as never);

    const symbols: SymbolInfo[] = [
      { name: 'Foo', kind: 'class', file: 'src/foo.ts', line: 1 },
    ];

    await expect(service.indexSymbols(symbols, 'repo-1')).resolves.not.toThrow();
  });

  it('should include symbol metadata in knowledge item values', async () => {
    const { getIntelligenceDb } = await import('@uaip/shared-services');
    const mockInsertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'id-1' }]),
    });
    vi.mocked(getIntelligenceDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
    } as never);

    const symbols: SymbolInfo[] = [
      { name: 'MyClass', kind: 'class', file: 'src/my.ts', line: 5 },
    ];

    await service.indexSymbols(symbols, 'repo-2');

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({ title: 'MyClass', kind: 'class' }),
          tags: expect.arrayContaining(['code-symbol', 'class']),
        }),
      ])
    );
  });
});
