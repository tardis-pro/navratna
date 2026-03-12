import { Episode, KnowledgeType, SourceType } from '@uaip/types';
import { EpisodicMemoryManager } from '../agent-memory/episodic-memory.manager';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { DatabaseService } from '../databaseService';

function createEpisode(): Episode {
  return {
    agentId: 'agent-1',
    episodeId: 'episode-1',
    type: 'learning',
    context: {
      when: new Date('2026-01-01T10:00:00Z'),
      where: 'discussion-room',
      who: ['agent-1', 'agent-2'],
      what: 'Investigated flaky orchestration test',
      why: 'Fix CI stability',
      how: 'Analyzed logs and updated retry strategy',
    },
    experience: {
      actions: [
        {
          id: 'action-1',
          description: 'Review test failures',
          type: 'analysis',
          timestamp: new Date('2026-01-01T10:01:00Z'),
          success: true,
        },
      ],
      decisions: [
        {
          id: 'decision-1',
          description: 'Increase backoff for retries',
          decidedBy: 'agent-1',
        },
      ],
      outcomes: [
        {
          id: 'outcome-1',
          description: 'Stability improved',
          type: 'result',
          success: true,
          impact: 0.8,
          timestamp: new Date('2026-01-01T10:05:00Z'),
        },
      ],
      emotions: [
        {
          emotion: 'confident',
          intensity: 0.6,
          trigger: 'passing test suite',
          timestamp: new Date('2026-01-01T10:06:00Z'),
        },
      ],
      learnings: ['Retry backoff reduces transient failures'],
    },
    significance: {
      importance: 0.9,
      novelty: 0.5,
      success: 0.8,
      impact: 0.7,
    },
    connections: {
      relatedEpisodes: ['episode-0'],
      triggeredBy: [],
      ledTo: [],
      similarTo: [],
    },
  };
}

describe('EpisodicMemoryManager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores an episode and creates FOLLOWED_BY relationships', async () => {
    const runQuery = jest.fn().mockResolvedValue(undefined);
    const getToolGraphDatabase = jest.fn().mockResolvedValue({ runQuery });
    const databaseMock = { getToolGraphDatabase } as unknown as DatabaseService;
    jest.spyOn(DatabaseService, 'getInstance').mockReturnValue(databaseMock);

    const ingest = jest.fn().mockResolvedValue(undefined);
    const search = jest.fn();
    const knowledgeGraph = { ingest, search } as unknown as KnowledgeGraphService;

    const manager = new EpisodicMemoryManager(knowledgeGraph);
    const episode = createEpisode();

    await manager.storeEpisode('agent-1', episode);

    expect(ingest).toHaveBeenCalledWith([
      expect.objectContaining({
        type: KnowledgeType.EPISODIC,
        source: expect.objectContaining({
          type: SourceType.AGENT_EPISODE,
          identifier: episode.episodeId,
        }),
      }),
    ]);

    expect(getToolGraphDatabase).toHaveBeenCalledTimes(1);
    expect(runQuery).toHaveBeenCalledWith(
      expect.stringContaining('FOLLOWED_BY'),
      expect.objectContaining({
        prevId: 'episode-0',
        newId: 'episode-1',
        agentId: 'agent-1',
      })
    );
  });

  it('finds similar episodes based on knowledge graph search results', async () => {
    const getToolGraphDatabase = jest.fn();
    const databaseMock = { getToolGraphDatabase } as unknown as DatabaseService;
    jest.spyOn(DatabaseService, 'getInstance').mockReturnValue(databaseMock);

    const search = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'knowledge-1',
          content: 'Episode content',
          type: KnowledgeType.EPISODIC,
          source: {
            identifier: 'episode-42',
            metadata: {
              agentId: 'agent-1',
              episodeType: 'learning',
              context: {
                when: new Date('2026-01-01T12:00:00Z'),
                where: 'workspace',
                who: ['agent-1'],
                what: 'Solved a deployment issue',
                why: 'Pipeline was failing',
                how: 'Fixed missing environment variable',
              },
              experience: {
                actions: [],
                decisions: [],
                outcomes: [],
                emotions: [],
                learnings: [],
              },
              significance: {
                importance: 0.7,
                novelty: 0.4,
                success: 0.9,
                impact: 0.6,
              },
              connections: {
                relatedEpisodes: [],
                triggeredBy: [],
                ledTo: [],
                similarTo: [],
              },
            },
          },
        },
      ],
      totalCount: 1,
      searchMetadata: {
        query: 'similar situation: deployment failure',
        processingTime: 5,
        similarityScores: [0.91],
        filtersApplied: ['agent-memory'],
      },
    });
    const ingest = jest.fn();
    const knowledgeGraph = { ingest, search } as unknown as KnowledgeGraphService;

    const manager = new EpisodicMemoryManager(knowledgeGraph);
    const episodes = await manager.findSimilarEpisodes('agent-1', 'deployment failure');

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'similar situation: deployment failure',
      })
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0].episodeId).toBe('episode-42');
    expect(episodes[0].agentId).toBe('agent-1');
  });
});
