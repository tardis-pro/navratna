import { Episode, EpisodicQuery, KnowledgeItem, KnowledgeType, SourceType } from '@uaip/types';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';

export class EpisodicMemoryManager {
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
      for (const _relatedId of episode.connections.relatedEpisodes) {
        // This would create relationships in the Knowledge Graph
        // For now, we'll skip the implementation details
      }
    } catch (error) {
      console.error('Episode storage error:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to store episode: ${message}`);
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

  private contentToEpisode(item: KnowledgeItem): Episode {
    // Parse content back to episode structure
    const metadata = item.metadata;

    if (!metadata) {
      // Fallback parsing from content if metadata is not available
      return this.parseEpisodeFromContent(item);
    }

    const context = this.asEpisodeContext(metadata.context);
    const experience = this.asEpisodeExperience(metadata.experience);
    const significance = this.asEpisodeSignificance(metadata.significance, item.confidence);
    const connections = this.asEpisodeConnections(metadata.connections);

    return {
      agentId: typeof metadata.agentId === 'string' ? metadata.agentId : 'unknown',
      episodeId: item.id,
      type: this.toEpisodeType(metadata.episodeType),
      context: context || {
        when: item.createdAt,
        where: 'unknown',
        who: [],
        what: item.content.substring(0, 100),
        why: 'unknown',
        how: 'unknown',
      },
      experience: experience || {
        actions: [],
        decisions: [],
        outcomes: [],
        emotions: [],
        learnings: [],
      },
      significance: significance || {
        importance: item.confidence,
        novelty: 0.5,
        success: 0.5,
        impact: 0.5,
      },
      connections: connections || {
        relatedEpisodes: [],
        triggeredBy: [],
        ledTo: [],
        similarTo: [],
      },
    };
  }

  private parseEpisodeFromContent(item: KnowledgeItem): Episode {
    // Basic parsing from content when metadata is not available
    const content = item.content;
    const lines = content.split('\n');

    let episodeType: Episode['type'] = 'learning';
    const context = {
      when: item.createdAt,
      where: 'unknown',
      who: [] as string[],
      what: content.substring(0, 100),
      why: 'unknown',
      how: 'unknown',
    };

    // Try to extract information from content
    for (const line of lines) {
      if (line.startsWith('Episode:')) {
        episodeType = this.toEpisodeType(line.replace('Episode:', '').trim());
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
      agentId: item.createdBy || 'unknown',
      episodeId: item.id,
      type: episodeType,
      context,
      experience: {
        actions: [],
        decisions: [],
        outcomes: [],
        emotions: [],
        learnings: [],
      },
      significance: {
        importance: item.confidence,
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

  private toEpisodeType(value: unknown): Episode['type'] {
    if (
      value === 'discussion' ||
      value === 'operation' ||
      value === 'learning' ||
      value === 'problem_solving' ||
      value === 'collaboration'
    ) {
      return value;
    }
    return 'learning';
  }

  private asEpisodeContext(value: unknown): Episode['context'] | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    return value as Episode['context'];
  }

  private asEpisodeExperience(value: unknown): Episode['experience'] | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    return value as Episode['experience'];
  }

  private asEpisodeSignificance(value: unknown, fallbackImportance: number): Episode['significance'] | null {
    if (typeof value !== 'object' || value === null) {
      return {
        importance: fallbackImportance,
        novelty: 0.5,
        success: 0.5,
        impact: 0.5,
      };
    }
    return value as Episode['significance'];
  }

  private asEpisodeConnections(value: unknown): Episode['connections'] | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    return value as Episode['connections'];
  }
}
