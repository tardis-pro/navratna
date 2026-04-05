/**
 * MacrodataMemoryService — Layered Agent Memory
 *
 * Inspired by @ascorbic/macrodata's memory architecture (Severance-themed):
 *   - IDENTITY layer : stable facts about the agent (who they are, their values)
 *   - JOURNAL layer  : recent episodes from this session (what just happened)
 *   - TOPICS layer   : consolidated knowledge organized by topic (what they know)
 *   - DISTILLATION   : background process that refines journal → topics
 *
 * Integrates with the existing KnowledgeGraphService + QmdSearchService so
 * agents can query ALL layers simultaneously before generating a response.
 */

import { logger } from '@uaip/utils';

/** Minimal interface compatible with both pg.Pool (via adapter) and raw query executors */
export interface QueryExecutor {
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
}

export interface MacrodataMemoryLayer {
  /** Fixed role + expertise + values from the agent's persona */
  identity: string;
  /** Recent N conversation turns from this session */
  journal: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  /** Top-K topic knowledge items relevant to the current query */
  topics: Array<{ content: string; tags: string[]; relevanceScore: number }>;
}

export interface MacrodataContext {
  agentId: string;
  userId: string;
  query: string;
  sessionEpisodes: Array<{ role: string; content: string; timestamp: string }>;
}

export class MacrodataMemoryService {
  constructor(private readonly dataSource: QueryExecutor) {}

  /**
   * Build a fully-layered memory context for an agent response.
   * Called before LLM generation — injects identity + journal + topics
   * into the system prompt so the agent "remembers" everything.
   */
  async buildMemoryContext(ctx: MacrodataContext): Promise<MacrodataMemoryLayer> {
    const [identity, journal, topics] = await Promise.allSettled([
      this.getIdentityLayer(ctx.agentId),
      this.getJournalLayer(ctx.agentId, ctx.userId, ctx.sessionEpisodes),
      this.getTopicsLayer(ctx.agentId, ctx.userId, ctx.query),
    ]);

    return {
      identity: identity.status === 'fulfilled' ? identity.value : '',
      journal: journal.status === 'fulfilled' ? journal.value : [],
      topics: topics.status === 'fulfilled' ? topics.value : [],
    };
  }

  /**
   * Format the macrodata memory context into a system prompt addendum.
   * Agents get this prepended to their persona so they "remember" who they
   * are, what happened recently, and what they know about the topic.
   */
  formatForPrompt(memory: MacrodataMemoryLayer, maxTokens = 2000): string {
    const parts: string[] = [];

    if (memory.identity) {
      parts.push(`## My Identity\n${memory.identity}`);
    }

    if (memory.topics.length > 0) {
      const topicsText = memory.topics
        .slice(0, 5)
        .map((t) => `- ${t.content.slice(0, 300).replace(/\n/g, ' ')}`)
        .join('\n');
      parts.push(`## Relevant Knowledge\n${topicsText}`);
    }

    if (memory.journal.length > 0) {
      const journalText = memory.journal
        .slice(-6) // last 6 turns
        .map((e) => `${e.role === 'user' ? 'User' : 'Me'}: ${e.content.slice(0, 200)}`)
        .join('\n');
      parts.push(`## Recent Conversation\n${journalText}`);
    }

    const combined = parts.join('\n\n');
    // Rough token truncation (4 chars ≈ 1 token)
    return combined.slice(0, maxTokens * 4);
  }

  /**
   * DISTILLATION: After a session ends or N episodes accumulate,
   * consolidate journal entries into structured topic knowledge.
   * This is "macrodata refinement" — sorting raw experience into knowledge.
   */
  async distillEpisodes(
    agentId: string,
    userId: string,
    episodes: Array<{ role: string; content: string; timestamp: string }>
  ): Promise<{ distilled: number; topics: string[] }> {
    if (episodes.length < 3) return { distilled: 0, topics: [] };

    try {
      // Extract key topics from the episode list
      const topics = this.extractTopics(episodes);

      // Store each topic as a knowledge item scoped to this agent
      for (const topic of topics) {
        // Check if a similar item already exists to avoid duplicates
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        const exists = await this.dataSource.query(
          `SELECT id FROM knowledge_items WHERE "agentId" = $1 AND content LIKE $2 LIMIT 1`,
          [agentId, `%${topic.slice(0, 50)}%`]
        );

        if (exists.length === 0) {
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          await this.dataSource.query(
            `INSERT INTO knowledge_items
               (id, content, type, "sourceType", "sourceIdentifier", tags, confidence, metadata, "agentId", "userId", "accessLevel", "createdAt", "updatedAt")
             VALUES
               (gen_random_uuid(), $1, 'EPISODIC', 'AGENT_MEMORY', $2, $3, 0.75, '{}', $4, $5, 'private', NOW(), NOW())`,
            [
              topic,
              `macrodata-distill-${agentId}-${Date.now()}`,
              JSON.stringify(['distilled', 'agent-memory', agentId]),
              agentId,
              userId,
            ]
          );
        }
      }

      logger.info('Macrodata distillation complete', {
        agentId,
        episodeCount: episodes.length,
        topicsExtracted: topics.length,
      });
      return { distilled: episodes.length, topics };
    } catch (err) {
      logger.warn('Macrodata distillation failed', {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { distilled: 0, topics: [] };
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async getIdentityLayer(agentId: string): Promise<string> {
    try {
      const rows = await this.dataSource.query(
        `SELECT name, persona, capabilities FROM agents WHERE id = $1 LIMIT 1`,
        [agentId]
      );
      if (!rows.length) return '';

      const rawAgent = rows[0];
      if (typeof rawAgent !== 'object' || rawAgent === null) return '';
      const agent = rawAgent as Record<string, unknown>;
      const persona =
        typeof agent.persona === 'string' ? JSON.parse(agent.persona) : (agent.persona ?? {});
      const caps =
        typeof agent.capabilities === 'string'
          ? JSON.parse(agent.capabilities)
          : (agent.capabilities ?? {});

      const lines: string[] = [`Name: ${agent.name}`];
      if (persona.role) lines.push(`Role: ${persona.role}`);
      if (persona.expertise?.length)
        lines.push(`Expertise: ${(persona.expertise as string[]).join(', ')}`);
      if (caps.languages?.length)
        lines.push(`Languages: ${(caps.languages as string[]).join(', ')}`);

      return lines.join('\n');
    } catch {
      return '';
    }
  }

  private async getJournalLayer(
    agentId: string,
    userId: string,
    sessionEpisodes: Array<{ role: string; content: string; timestamp: string }>
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>> {
    // Session episodes already provided — just normalize
    return sessionEpisodes
      .filter((e) => e.content && e.content.trim().length > 0)
      .slice(-10)
      .map((e) => ({
        role: e.role === 'assistant' || e.role === 'agent' ? 'assistant' : ('user' as const),
        content: e.content.slice(0, 500),
        timestamp: e.timestamp || new Date().toISOString(),
      }));
  }

  private async getTopicsLayer(
    agentId: string,
    userId: string,
    query: string
  ): Promise<Array<{ content: string; tags: string[]; relevanceScore: number }>> {
    try {
      if (!query || query.trim().length === 0) return [];

      // FTS query for topic-relevant knowledge scoped to agent or user
      const rows = await this.dataSource.query(
        `SELECT content, tags, confidence,
                ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $1)) AS rank
         FROM knowledge_items
         WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
           AND ("agentId" = $2 OR "userId" = $3 OR ("agentId" IS NULL AND "userId" IS NULL))
           AND LENGTH(TRIM(content)) > 20
         ORDER BY rank DESC
         LIMIT 8`,
        [query.slice(0, 200), agentId, userId]
      );

      return rows
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map((r) => ({
          content: typeof r.content === 'string' ? r.content : '',
          tags: Array.isArray(r.tags)
            ? r.tags.filter((tag): tag is string => typeof tag === 'string')
            : [],
          relevanceScore: typeof r.rank === 'number' ? r.rank : Number(r.rank) || 0,
        }));
    } catch (err) {
      logger.warn('Macrodata topics layer failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /** Simple topic extraction: pull distinct factual sentences from episodes */
  private extractTopics(
    episodes: Array<{ role: string; content: string; timestamp: string }>
  ): string[] {
    const topics: string[] = [];
    const seen = new Set<string>();

    for (const ep of episodes) {
      if (ep.role !== 'assistant' && ep.role !== 'agent') continue;
      // Split on sentence boundaries, keep substantial ones
      const sentences = ep.content
        .replace(/\n+/g, ' ')
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 40 && s.length < 500);

      for (const sentence of sentences.slice(0, 3)) {
        const key = sentence.slice(0, 30).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          topics.push(sentence);
          if (topics.length >= 10) break;
        }
      }
      if (topics.length >= 10) break;
    }

    return topics;
  }
}
