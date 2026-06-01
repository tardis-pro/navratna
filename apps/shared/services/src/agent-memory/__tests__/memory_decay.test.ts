import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SemanticMemory } from '@uaip/types';
import { MemoryConsolidator } from '../memory_consolidator_service';
import type { WorkingMemoryManager } from '../working_memory_manager';
import type { EpisodicMemoryManager } from '../episodic_memory_manager';
import type { SemanticMemoryManager } from '../semantic_memory_manager';
import type { ToolGraphDatabase } from '../../database/tool_graph_database';
import type { ImmutableAuditService } from '../../composition/immutable_audit_service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSemanticMemory(overrides: Partial<SemanticMemory> = {}): SemanticMemory {
  return {
    agentId: 'agent-1',
    concept: 'test-concept',
    knowledge: {
      definition: 'A test concept',
      properties: {},
      relationships: [],
      examples: [],
      counterExamples: [],
    },
    confidence: 0.8,
    sources: {
      episodeIds: [],
      externalSources: [],
      reinforcements: 3,
    },
    usage: {
      timesAccessed: 5,
      lastUsed: new Date(),
      successRate: 0.9,
      contexts: [],
    },
    ...overrides,
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeConsolidator(concepts: SemanticMemory[] = []) {
  const mockWorkingMemoryManager = {} as unknown as WorkingMemoryManager;
  const mockEpisodicMemoryManager = {} as unknown as EpisodicMemoryManager;

  const mockSemanticMemoryManager = {
    getRelatedConcepts: vi.fn().mockResolvedValue(concepts),
    pruneMemory: vi.fn().mockResolvedValue(undefined),
  } as unknown as SemanticMemoryManager;

  const mockNeo4jClient = {
    runQuery: vi.fn().mockResolvedValue(undefined),
  } as unknown as ToolGraphDatabase;

  const mockAuditService = {
    appendEvent: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  } as unknown as ImmutableAuditService;

  const consolidator = new MemoryConsolidator(
    mockWorkingMemoryManager,
    mockEpisodicMemoryManager,
    mockSemanticMemoryManager,
    mockNeo4jClient,
    mockAuditService,
  );

  return {
    consolidator,
    mockSemanticMemoryManager,
    mockNeo4jClient,
    mockAuditService,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryConsolidator.runPurge', () => {
  beforeEach(() => {
    delete process.env['DRY_RUN_PURGE'];
  });

  // T1: concept with lastUsed 91 days ago + 0 reinforcements → score < 0.15 → purged
  it('T1: purges concept with lastUsed 91 days ago and 0 reinforcements', async () => {
    const staleConcept = makeSemanticMemory({
      concept: 'stale-concept',
      sources: { episodeIds: [], externalSources: [], reinforcements: 0 },
      usage: {
        timesAccessed: 0,
        lastUsed: daysAgo(91),
        successRate: 0.0,
        contexts: [],
      },
    });

    const { consolidator, mockSemanticMemoryManager } = makeConsolidator([staleConcept]);

    const cert = await consolidator.runPurge('agent-1');

    expect(cert.purgedCount).toBe(1);
    expect(cert.dryRun).toBe(false);
    expect(mockSemanticMemoryManager.pruneMemory).toHaveBeenCalledWith('agent-1', 'stale-concept');
  });

  // T2: concept with lastUsed today + 5 reinforcements → score > 0.15 → retained
  it('T2: retains concept with lastUsed today and 5 reinforcements', async () => {
    const freshConcept = makeSemanticMemory({
      concept: 'fresh-concept',
      sources: { episodeIds: [], externalSources: [], reinforcements: 5 },
      usage: {
        timesAccessed: 10,
        lastUsed: new Date(),
        successRate: 0.95,
        contexts: [],
      },
    });

    const { consolidator, mockSemanticMemoryManager } = makeConsolidator([freshConcept]);

    const cert = await consolidator.runPurge('agent-1');

    expect(cert.purgedCount).toBe(0);
    expect(mockSemanticMemoryManager.pruneMemory).not.toHaveBeenCalled();
  });

  // T3: concept with lastUsed 30 days ago + high successRate → borderline (~0.3) → retained
  it('T3: retains concept with lastUsed 30 days ago and high success rate (score ~0.3)', async () => {
    const borderlineConcept = makeSemanticMemory({
      concept: 'borderline-concept',
      sources: { episodeIds: [], externalSources: [], reinforcements: 3 },
      usage: {
        timesAccessed: 5,
        lastUsed: daysAgo(30),
        successRate: 0.9,
        contexts: [],
      },
    });

    const { consolidator, mockSemanticMemoryManager } = makeConsolidator([borderlineConcept]);

    const cert = await consolidator.runPurge('agent-1');

    // Score at 30 days, 3 reinforcements, 5 accesses, 0.9 success should be well above 0.15
    expect(cert.purgedCount).toBe(0);
    expect(mockSemanticMemoryManager.pruneMemory).not.toHaveBeenCalled();
  });

  // T4: purge deletes from Qdrant (verify pruneMemory called with correct concept name)
  it('T4: purge deletes from Qdrant via pruneMemory with correct concept identifier', async () => {
    const staleConcept = makeSemanticMemory({
      concept: 'qdrant-target',
      sources: { episodeIds: [], externalSources: [], reinforcements: 0 },
      usage: { timesAccessed: 0, lastUsed: daysAgo(100), successRate: 0.0, contexts: [] },
    });

    const { consolidator, mockSemanticMemoryManager } = makeConsolidator([staleConcept]);
    await consolidator.runPurge('agent-1');

    expect(mockSemanticMemoryManager.pruneMemory).toHaveBeenCalledOnce();
    expect(mockSemanticMemoryManager.pruneMemory).toHaveBeenCalledWith('agent-1', 'qdrant-target');
  });

  // T5: purge deletes from Neo4j (verify neo4jClient.runQuery called for each purged concept)
  it('T5: purge deletes from Neo4j via runQuery for each purged concept', async () => {
    const stale1 = makeSemanticMemory({
      concept: 'neo4j-target-1',
      sources: { episodeIds: [], externalSources: [], reinforcements: 0 },
      usage: { timesAccessed: 0, lastUsed: daysAgo(120), successRate: 0.0, contexts: [] },
    });
    const stale2 = makeSemanticMemory({
      concept: 'neo4j-target-2',
      sources: { episodeIds: [], externalSources: [], reinforcements: 0 },
      usage: { timesAccessed: 0, lastUsed: daysAgo(90), successRate: 0.0, contexts: [] },
    });

    const { consolidator, mockNeo4jClient } = makeConsolidator([stale1, stale2]);
    await consolidator.runPurge('agent-1');

    expect(mockNeo4jClient.runQuery).toHaveBeenCalledTimes(2);
    expect(mockNeo4jClient.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('DETACH DELETE'),
      { id: 'neo4j-target-1' },
    );
    expect(mockNeo4jClient.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('DETACH DELETE'),
      { id: 'neo4j-target-2' },
    );
  });

  // T6: purge writes audit event with erasure certificate fields
  it('T6: purge writes audit event with certificate fields to ImmutableAuditService', async () => {
    const staleConcept = makeSemanticMemory({
      concept: 'audit-target',
      sources: { episodeIds: [], externalSources: [], reinforcements: 0 },
      usage: { timesAccessed: 0, lastUsed: daysAgo(95), successRate: 0.0, contexts: [] },
    });

    const { consolidator, mockAuditService } = makeConsolidator([staleConcept]);
    const cert = await consolidator.runPurge('agent-1');

    expect(mockAuditService.appendEvent).toHaveBeenCalledOnce();
    const [auditInput] = (mockAuditService.appendEvent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(auditInput.eventType).toBe('MEMORY_PURGE');
    expect(auditInput.details).toMatchObject({
      agentId: 'agent-1',
      purgedCount: 1,
      dryRun: false,
    });
    expect(auditInput.details.purgedConceptIds).toContain('audit-target');

    expect(cert.purgedCount).toBe(1);
    expect(cert.agentId).toBe('agent-1');
    expect(cert.dryRun).toBe(false);
    expect(cert.timestamp).toBeInstanceOf(Date);
  });

  // T7: idempotent — second run after purge finds nothing, returns purgedCount 0, no error
  it('T7: second run on same agent returns purgedCount 0 (idempotent)', async () => {
    const { consolidator, mockSemanticMemoryManager, mockAuditService } = makeConsolidator([]);

    const cert = await consolidator.runPurge('agent-1');

    expect(cert.purgedCount).toBe(0);
    expect(cert.dryRun).toBe(false);
    expect(mockSemanticMemoryManager.pruneMemory).not.toHaveBeenCalled();
    expect(mockAuditService.appendEvent).not.toHaveBeenCalled();
  });

  // T8: DRY_RUN_PURGE=true → scores computed, nothing deleted, certificate not written
  it('T8: DRY_RUN_PURGE=true computes candidates but deletes nothing and writes no audit', async () => {
    process.env['DRY_RUN_PURGE'] = 'true';

    const staleConcept = makeSemanticMemory({
      concept: 'dry-run-target',
      sources: { episodeIds: [], externalSources: [], reinforcements: 0 },
      usage: { timesAccessed: 0, lastUsed: daysAgo(91), successRate: 0.0, contexts: [] },
    });

    const { consolidator, mockSemanticMemoryManager, mockNeo4jClient, mockAuditService } =
      makeConsolidator([staleConcept]);

    const cert = await consolidator.runPurge('agent-1');

    expect(cert.purgedCount).toBe(0);
    expect(cert.dryRun).toBe(true);
    expect(mockSemanticMemoryManager.pruneMemory).not.toHaveBeenCalled();
    expect(mockNeo4jClient.runQuery).not.toHaveBeenCalled();
    expect(mockAuditService.appendEvent).not.toHaveBeenCalled();
  });
});
