import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunQuery = vi.fn().mockResolvedValue({});
const mockInsertValues = vi.fn().mockResolvedValue(undefined);

vi.mock('@uaip/shared-services', () => ({
  getIntelligenceDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
  })),
  knowledgeItems: {},
  ServiceFactory: {
    getInstance: vi.fn(() => ({
      getToolGraphDatabase: vi.fn().mockResolvedValue({
        runQuery: mockRunQuery,
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
    mockRunQuery.mockResolvedValue({});
  });

  it('should build graph from import info', async () => {
    const imports: ImportInfo[] = [
      { file: 'src/index.ts', source: './services/agent', symbols: ['AgentService'] },
      { file: 'src/index.ts', source: '@uaip/utils', symbols: ['logger'] },
    ];
    await expect(service.buildGraph(imports, '/repo')).resolves.not.toThrow();
  });

  it('should handle empty imports gracefully', async () => {
    await expect(service.buildGraph([], '/repo')).resolves.not.toThrow();
  });

  it('should call Neo4j with MERGE Cypher for non-empty imports', async () => {
    const imports: ImportInfo[] = [
      { file: 'src/app.ts', source: './services/foo', symbols: ['Foo'] },
    ];

    await service.buildGraph(imports, '/repo');

    const calls = mockRunQuery.mock.calls;
    const mergeCalls = calls.filter(([cypher]) =>
      typeof cypher === 'string' && cypher.includes('MERGE')
    );
    expect(mergeCalls.length).toBeGreaterThan(0);
  });

  it('should pass edges array and repoRoot to Neo4j MERGE query', async () => {
    const imports: ImportInfo[] = [
      { file: 'src/a.ts', source: './b', symbols: ['B'] },
    ];

    await service.buildGraph(imports, '/myrepo');

    const mergeCalls = mockRunQuery.mock.calls.filter(([cypher]) =>
      typeof cypher === 'string' && cypher.includes('MERGE')
    );
    expect(mergeCalls.length).toBeGreaterThan(0);

    const [, params] = mergeCalls[mergeCalls.length - 1];
    expect(params).toMatchObject({ repoRoot: '/myrepo' });
    expect(params.edges).toBeInstanceOf(Array);
    expect(params.edges[0]).toMatchObject({ from: 'src/a.ts', symbols: ['B'] });
  });

  it('should chunk large edge sets into batches of 500', async () => {
    const imports: ImportInfo[] = Array.from({ length: 1200 }, (_, i) => ({
      file: `src/file${i}.ts`,
      source: `./dep${i}`,
      symbols: [`Dep${i}`],
    }));

    await service.buildGraph(imports, '/repo');

    const mergeCalls = mockRunQuery.mock.calls.filter(([cypher]) =>
      typeof cypher === 'string' && cypher.includes('MERGE (from)-[r:IMPORTS]->(to)')
    );
    expect(mergeCalls.length).toBe(3);
  });

  it('should resolve relative imports relative to repoRoot', async () => {
    const imports: ImportInfo[] = [
      { file: 'src/app.ts', source: './services/foo', symbols: ['Foo'] },
    ];

    await service.buildGraph(imports, '/repo');

    const mergeCalls = mockRunQuery.mock.calls.filter(([cypher]) =>
      typeof cypher === 'string' && cypher.includes('MERGE')
    );
    const [, params] = mergeCalls[mergeCalls.length - 1];
    const edge = params.edges[0];
    expect(edge.to).toBe('src/services/foo');
  });

  it('should handle absolute (external) imports without path resolution', async () => {
    const imports: ImportInfo[] = [
      { file: 'src/app.ts', source: 'express', symbols: ['Router'] },
    ];

    await service.buildGraph(imports, '/repo');

    const mergeCalls = mockRunQuery.mock.calls.filter(([cypher]) =>
      typeof cypher === 'string' && cypher.includes('MERGE')
    );
    const [, params] = mergeCalls[mergeCalls.length - 1];
    const edge = params.edges[0];
    expect(edge.to).toBe('express');
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

  it('deleteStaleImports should call Neo4j with correct WHERE clause', async () => {
    const { ServiceFactory } = await import('@uaip/shared-services');
    vi.mocked(ServiceFactory.getInstance).mockReturnValue({
      getToolGraphDatabase: vi.fn().mockResolvedValue({ runQuery: mockRunQuery }),
    } as never);

    await service.deleteStaleImports('/repo', ['src/a.ts', 'src/b.ts']);

    const staleCall = mockRunQuery.mock.calls.find(([cypher]) =>
      typeof cypher === 'string' && cypher.includes('DELETE r')
    );
    expect(staleCall).toBeDefined();
    const [, params] = staleCall!;
    expect(params).toMatchObject({
      repoRoot: '/repo',
      currentFilePaths: ['src/a.ts', 'src/b.ts'],
    });
  });

  it('deleteStaleImports should skip when no current paths provided', async () => {
    await service.deleteStaleImports('/repo', []);
    const deleteCalls = mockRunQuery.mock.calls.filter(([cypher]) =>
      typeof cypher === 'string' && cypher.includes('DELETE r')
    );
    expect(deleteCalls.length).toBe(0);
  });

  it('getImportGraph should return empty result when Neo4j fails', async () => {
    const { ServiceFactory } = await import('@uaip/shared-services');
    vi.mocked(ServiceFactory.getInstance).mockReturnValue({
      getToolGraphDatabase: vi.fn().mockRejectedValue(new Error('timeout')),
    } as never);

    const result = await service.getImportGraph('src/index.ts', '/repo');
    expect(result).toMatchObject({ root: 'src/index.ts', nodes: [], edges: [] });
  });

  it('getImportGraph should query Neo4j with IMPORTS pattern', async () => {
    const { ServiceFactory } = await import('@uaip/shared-services');
    vi.mocked(ServiceFactory.getInstance).mockReturnValue({
      getToolGraphDatabase: vi.fn().mockResolvedValue({ runQuery: mockRunQuery }),
    } as never);
    mockRunQuery.mockResolvedValue([
      { fromPath: 'src/index.ts', toPath: 'src/agent.ts', symbols: ['AgentService'] },
    ]);

    const result = await service.getImportGraph('src/index.ts', '/repo', 2);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      from: 'src/index.ts',
      to: 'src/agent.ts',
      symbols: ['AgentService'],
    });

    const graphCall = mockRunQuery.mock.calls.find(([cypher]) =>
      typeof cypher === 'string' && cypher.includes('IMPORTS')
    );
    expect(graphCall).toBeDefined();
    const [, params] = graphCall!;
    expect(params).toMatchObject({ path: 'src/index.ts', repoRoot: '/repo' });
  });
});
