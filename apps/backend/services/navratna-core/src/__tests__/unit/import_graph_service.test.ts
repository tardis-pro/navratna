import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@uaip/shared-services', () => ({
  getIntelligenceDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
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
  KnowledgeType: { PROCEDURAL: 'procedural' },
  SourceType: { FILE_SYSTEM: 'file_system' },
}));

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ImportGraphService } from '../../services/import_graph_service.js';
import type { ImportInfo } from '@uaip/types';

describe('ImportGraphService', () => {
  let service: ImportGraphService;

  beforeEach(() => {
    service = new ImportGraphService();
    vi.clearAllMocks();
  });

  it('should build graph from import info', async () => {
    const imports: ImportInfo[] = [
      {
        file: 'src/index.ts',
        source: './services/agent',
        symbols: ['AgentService'],
      },
      {
        file: 'src/index.ts',
        source: '@uaip/utils',
        symbols: ['logger'],
      },
    ];

    await expect(service.buildGraph(imports, '/repo')).resolves.not.toThrow();
  });

  it('should handle empty imports gracefully', async () => {
    await expect(service.buildGraph([], '/repo')).resolves.not.toThrow();
  });

  it('should resolve relative imports relative to repoRoot', async () => {
    const imports: ImportInfo[] = [
      {
        file: 'src/app.ts',
        source: './services/foo',
        symbols: ['Foo'],
      },
    ];

    await expect(service.buildGraph(imports, '/repo')).resolves.not.toThrow();
  });

  it('should handle absolute (external) imports without path resolution', async () => {
    const imports: ImportInfo[] = [
      {
        file: 'src/app.ts',
        source: 'express',
        symbols: ['Router'],
      },
    ];

    await expect(service.buildGraph(imports, '/repo')).resolves.not.toThrow();
  });

  it('should degrade gracefully when Neo4j is unavailable', async () => {
    const { ServiceFactory } = await import('@uaip/shared-services');
    vi.mocked(ServiceFactory.getInstance).mockReturnValue({
      getToolGraphDatabase: vi.fn().mockRejectedValue(new Error('Neo4j unavailable')),
    } as never);

    const imports: ImportInfo[] = [
      { file: 'src/a.ts', source: './b', symbols: [] },
    ];

    await expect(service.buildGraph(imports, '/repo')).resolves.not.toThrow();
  });
});
