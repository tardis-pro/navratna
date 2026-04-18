import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@uaip/shared-services', () => ({
  getIntelligenceDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'ki-uuid-1' }]),
      })),
    })),
  })),
  knowledgeItems: {},
  ServiceFactory: {
    getInstance: vi.fn(() => ({
      getToolGraphDatabase: vi.fn().mockResolvedValue({
        runQuery: vi.fn().mockResolvedValue({}),
      }),
    })),
  },
}));

vi.mock('@uaip/types', () => ({
  KnowledgeType: { REPO_CONTEXT: 'repo_context' },
  SourceType: { GIT_REPOSITORY: 'git_repository', FILE_SYSTEM: 'file_system' },
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
  },
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
  },
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, msg: string, public code?: string) { super(msg); }
  },
}));

vi.mock('../../services/ast_symbol_extractor.js', () => ({
  AstSymbolExtractor: vi.fn().mockImplementation(() => ({
    extractFromDirectory: vi.fn().mockResolvedValue({
      symbols: [],
      imports: [],
      fileCount: 0,
    }),
  })),
}));

vi.mock('../../services/semantic_index_service.js', () => ({
  SemanticIndexService: vi.fn().mockImplementation(() => ({
    indexSymbols: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../services/import_graph_service.js', () => ({
  ImportGraphService: vi.fn().mockImplementation(() => ({
    buildGraph: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from('')),
}));

vi.mock('node:fs', () => {
  const actual = {
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    readFileSync: vi.fn().mockReturnValue(''),
    readdirSync: vi.fn().mockReturnValue([]),
    rmSync: vi.fn(),
  };
  return { ...actual, default: actual };
});

import { RepoIngestionService } from '../../services/repo_ingestion_service.js';
import { existsSync, statSync } from 'node:fs';

describe('RepoIngestionService', () => {
  let service: RepoIngestionService;

  beforeEach(() => {
    service = new RepoIngestionService();
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as never);
  });

  it('throws ValidationError for empty source', async () => {
    await expect(service.ingest('')).rejects.toThrow();
  });

  it('throws ValidationError for whitespace-only source', async () => {
    await expect(service.ingest('   ')).rejects.toThrow();
  });

  it('throws NotFoundError for non-existent local path', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await expect(service.ingest('/does/not/exist')).rejects.toThrow();
  });

  it('throws ValidationError for path pointing to a file not a directory', async () => {
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as never);
    await expect(service.ingest('/some/file.ts')).rejects.toThrow();
  });

  it('ingests a valid local directory and returns RepoContext', async () => {
    const result = await service.ingest('/valid/repo');
    expect(result).toBeDefined();
    expect(result.source).toBe('/valid/repo');
    expect(result.id).toBeTruthy();
    expect(result.knowledgeItemId).toBe('ki-uuid-1');
    expect(['brownfield', 'greenfield']).toContain(result.repoMode);
  });

  it('continues (layer2 is optional) even when AST extraction fails', async () => {
    const { AstSymbolExtractor } = await import('../../services/ast_symbol_extractor.js');
    vi.mocked(AstSymbolExtractor).mockImplementationOnce(() => ({
      extractFromDirectory: vi.fn().mockRejectedValue(new Error('tree-sitter unavailable')),
    }) as never);

    const result = await service.ingest('/valid/repo');
    expect(result).toBeDefined();
    expect(result.source).toBe('/valid/repo');
  });

  it('propagates DB errors as thrown exceptions', async () => {
    const { getIntelligenceDb } = await import('@uaip/shared-services');
    vi.mocked(getIntelligenceDb).mockImplementationOnce(() => {
      throw new Error('Postgres unreachable');
    });

    await expect(service.ingest('/valid/repo')).rejects.toThrow('Postgres unreachable');
  });
});
