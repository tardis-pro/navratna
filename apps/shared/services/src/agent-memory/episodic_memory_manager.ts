import { Episode, EpisodicQuery, KnowledgeType, SourceType } from '@uaip/types';
import { logger } from '@uaip/utils';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge_graph_service';
import { DatabaseService } from '../database_service';

export class EpisodicMemoryManager {
  private readonly databaseService = DatabaseService.getInstance();

  constructor(private readonly knowledgeGraph: KnowledgeGraphService) {}

  async storeEpisode(agentId: string, episode: Episode): Promise<void> {
    try {
      // Store episode as knowledge item in the Knowledge Graph
      await this.knowledgeGraph.ingest([
        {
          content: this.episodeToContent(episode),
          type: KnowledgeType.EPISODIC,
          tags: [
            'agent-memory',
            `agent-${agentId}`,
            `episode-${episode.type}`,
            `significance-${Math.round(episode.significance.importance * 10)}`,
            ...episode.context.who.map((who) => `participant-${who}`),
          ],
          source: {
            type: SourceType.AGENT_EPISODE,
            identifier: episode.episodeId,
            metadata: {
              agentId,
              episodeType: episode.type,
              significance: episode.significance,
              context: episode.context,
              experience: episode.experience,
              connections: episode.connections,
              collectionType: 'episodic',
            },
          },
          confidence: episode.significance.importance,
        },
      ]);

      // Create relationships with related episodes
      await this.createEpisodeRelationships(episode);
    } catch (error) {
      console.error('Episode storage error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to store episode: ${msg}`, { cause: error });
    }
  }

  private async createEpisodeRelationships(episode: Episode): Promise<void> {
    if (!episode.connections.relatedEpisodes.length) {
      return;
    }

    try {
      const graphDatabase = await this.databaseService.getToolGraphDatabase();

      for (const relatedId of episode.connections.relatedEpisodes) {
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await graphDatabase.runQuery(
          `MERGE (a:Episode {id: $prevId})
           MERGE (b:Episode {id: $newId})
           ON CREATE SET b.agentId = $agentId,
                         b.type = $episodeType,
                         b.createdAt = datetime($createdAt)
           MERGE (a)-[:FOLLOWED_BY]->(b)`,
          {
            prevId: relatedId,
            newId: episode.episodeId,
            agentId: episode.agentId,
            episodeType: episode.type,
            createdAt: episode.context.when.toISOString(),
          }
        );
      }
    } catch (error) {
      logger.warn('Failed to create episodic FOLLOWED_BY relationships', {
        episodeId: episode.episodeId,
        relatedCount: episode.connections.relatedEpisodes.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async retrieveEpisodes(agentId: string, query: EpisodicQuery): Promise<Episode[]> {
    try {
      const searchResults = await this.knowledgeGraph.search({
        query: query.description,
        filters: {
          tags: [`agent-${agentId}`, 'agent-memory'],
          types: [KnowledgeType.EPISODIC],
          confidence: query.minSignificance || 0.3,
        },
        options: {
          limit: query.limit || 10,
          similarityThreshold: 0.6,
        },
        timestamp: Date.now(),
      });

      return searchResults.items.map((item) => this.contentToEpisode(item));
    } catch (error) {
      console.error('Episode retrieval error:', error);
      return [];
    }
  }

  async findSimilarEpisodes(agentId: string, currentSituation: string): Promise<Episode[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `similar situation: ${currentSituation}`,
        filters: {
          tags: [`agent-${agentId}`, 'agent-memory'],
          types: [KnowledgeType.EPISODIC],
        },
        options: {
          limit: 5,
          similarityThreshold: 0.7,
        },
        timestamp: Date.now(),
      });

      return results.items.map((item) => this.contentToEpisode(item));
    } catch (error) {
      console.error('Similar episodes retrieval error:', error);
      return [];
    }
  }

  async getEpisodesByTimeRange(
    agentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Episode[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `agent ${agentId} episodes`,
        filters: {
          tags: [`agent-${agentId}`, 'agent-memory'],
          types: [KnowledgeType.EPISODIC],
          dateRange: { start: startDate, end: endDate },
        },
        timestamp: Date.now(),
      });

      return results.items.map((item) => this.contentToEpisode(item));
    } catch (error) {
      console.error('Episodes by time range retrieval error:', error);
      return [];
    }
  }

  async getEpisodesByType(
    agentId: string,
    episodeType: string,
    limit: number = 10
  ): Promise<Episode[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `${episodeType} episodes`,
        filters: {
          tags: [`agent-${agentId}`, `episode-${episodeType}`],
          types: [KnowledgeType.EPISODIC],
        },
        options: { limit },
        timestamp: Date.now(),
      });

      return results.items.map((item) => this.contentToEpisode(item));
    } catch (error) {
      console.error('Episodes by type retrieval error:', error);
      return [];
    }
  }

  async getSignificantEpisodes(
    agentId: string,
    minSignificance: number = 0.8,
    limit: number = 10
  ): Promise<Episode[]> {
    try {
      const results = await this.knowledgeGraph.search({
        query: `significant episodes`,
        filters: {
          tags: [`agent-${agentId}`, 'agent-memory'],
          types: [KnowledgeType.EPISODIC],
          confidence: minSignificance,
        },
        options: { limit },
        timestamp: Date.now(),
      });

      return results.items.map((item) => this.contentToEpisode(item));
    } catch (error) {
      console.error('Significant episodes retrieval error:', error);
      return [];
    }
  }

  private episodeToContent(episode: Episode): string {
    return `Episode: ${episode.type}
Context: ${episode.context.what} on ${episode.context.when.toISOString()}
Location: ${episode.context.where}
Participants: ${episode.context.who.join(', ')}
Purpose: ${episode.context.why}
Method: ${episode.context.how}
Actions: ${episode.experience.actions.map((a) => a.description).join('; ')}
Decisions: ${episode.experience.decisions.map((d) => `${d.description}: decided by ${d.decidedBy}`).join('; ')}
Outcomes: ${episode.experience.outcomes.map((o) => o.description).join('; ')}
Emotions: ${episode.experience.emotions.map((e) => `${e.emotion} (${e.intensity})`).join('; ')}
Learnings: ${episode.experience.learnings.join('; ')}
Significance: Importance=${episode.significance.importance}, Novelty=${episode.significance.novelty}, Success=${episode.significance.success}, Impact=${episode.significance.impact}`;
  }

  private contentToEpisode(item: unknown): Episode {
    // Parse content back to episode structure
    const record = item as Record<string, unknown>;
    const source = record.source as Record<string, unknown> | undefined;
    const metadata = (source?.metadata || record.metadata) as Record<string, unknown> | undefined;

    if (!metadata) {
      // Fallback parsing from content if metadata is not available
      return this.parseEpisodeFromContent(item);
    }

    return {
      agentId: metadata.agentId as string,
      episodeId: (source?.identifier as string) || (record.id as string),
      type: (metadata.episodeType as Episode['type']) || 'learning',
      context: (metadata.context as Episode['context']) || {
        when: new Date(record.createdAt as string),
        where: 'unknown',
        who: [],
        what: (record.content as string).substring(0, 100),
        why: 'unknown',
        how: 'unknown',
      },
      experience: (metadata.experience as Episode['experience']) || {
        actions: [],
        decisions: [],
        outcomes: [],
        emotions: [],
        learnings: [],
      },
      significance: (metadata.significance as Episode['significance']) || {
        importance: (record.confidence as number) || 0.5,
        novelty: 0.5,
        success: 0.5,
        impact: 0.5,
      },
      connections: (metadata.connections as Episode['connections']) || {
        relatedEpisodes: [],
        triggeredBy: [],
        ledTo: [],
        similarTo: [],
      },
    };
  }

  private parseEpisodeFromContent(item: unknown): Episode {
    // Basic parsing from content when metadata is not available
    const record = item as Record<string, unknown>;
    const content = (record.content as string) || '';
    const lines = content.split('\n');

    let episodeType = 'learning';
    const context = {
      when: new Date(record.createdAt as string),
      where: 'unknown',
      who: [] as string[],
      what: content.substring(0, 100),
      why: 'unknown',
      how: 'unknown',
    };

    // Try to extract information from content
    for (const line of lines) {
      if (line.startsWith('Episode:')) {
        episodeType = line.replace('Episode:', '').trim();
      } else if (line.startsWith('Context:')) {
        context.what = line.replace('Context:', '').trim();
      } else if (line.startsWith('Participants:')) {
        context.who = line
          .replace('Participants:', '')
          .split(',')
          .map((p: string) => p.trim());
      }
    }

    return {
      agentId: (record.createdBy as string) || 'unknown',
      episodeId: record.id as string,
      type: episodeType as Episode['type'],
      context,
      experience: {
        actions: [],
        decisions: [],
        outcomes: [],
        emotions: [],
        learnings: [],
      },
      significance: {
        importance: (record.confidence as number) || 0.5,
        novelty: 0.5,
        success: 0.5,
        impact: 0.5,
      },
      connections: {
        relatedEpisodes: [],
        triggeredBy: [],
        ledTo: [],
        similarTo: [],
      },
    };
  }
}
