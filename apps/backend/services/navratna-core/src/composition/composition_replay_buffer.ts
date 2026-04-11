import { logger } from '@uaip/utils';
import type { CompositionDefinition } from '@uaip/types';
import { getControlDb, compositionAttempts, desc, eq, like, sql, and } from '@uaip/shared-services';

// ============================================================================
// Types
// ============================================================================

export interface CompositionAttempt {
  id: string;
  intent: string;
  intentEmbedding?: number[]; // For future Qdrant similarity search
  tools: string[];            // Tool names used
  definition: CompositionDefinition | null; // null if failed
  outcome: 'success' | 'failure' | 'partial';
  failureType?: 'structural' | 'binding' | 'semantic' | 'runtime';
  failureDetails?: string;
  createdAt: Date;
}

// ============================================================================
// CompositionReplayBuffer
//
// Stores every composition attempt with outcome for learning. The composer
// uses this to find similar past compositions and include successful ones
// as few-shot examples in LLM prompts.
// ============================================================================

export class CompositionReplayBuffer {
  private static instance: CompositionReplayBuffer;

  static getInstance(): CompositionReplayBuffer {
    if (!CompositionReplayBuffer.instance) {
      CompositionReplayBuffer.instance = new CompositionReplayBuffer();
    }
    return CompositionReplayBuffer.instance;
  }

  // --------------------------------------------------------------------------
  // Record a composition attempt
  // --------------------------------------------------------------------------

  async record(attempt: CompositionAttempt): Promise<void> {
    try {
      const db = getControlDb();

      await db.insert(compositionAttempts).values({
        id: attempt.id,
        intent: attempt.intent,
        tools: attempt.tools,
        definition: attempt.definition as unknown as Record<string, unknown>,
        outcome: attempt.outcome,
        failureType: attempt.failureType ?? null,
        failureDetails: attempt.failureDetails ?? null,
        createdAt: attempt.createdAt,
      });

      logger.info('[CompositionReplayBuffer] Recorded attempt', {
        id: attempt.id,
        outcome: attempt.outcome,
        toolCount: attempt.tools.length,
      });
    } catch (error) {
      // Recording failures should not crash the composition pipeline
      logger.error('[CompositionReplayBuffer] Failed to record attempt', {
        id: attempt.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // --------------------------------------------------------------------------
  // Find similar compositions by intent text
  // --------------------------------------------------------------------------

  async findSimilar(intent: string, limit: number = 5): Promise<CompositionAttempt[]> {
    try {
      const db = getControlDb();

      // Simple text similarity: extract key words and search with ILIKE
      // Future: replace with Qdrant embedding similarity
      const keywords = this.extractKeywords(intent);

      if (keywords.length === 0) {
        return [];
      }

      // Build OR condition across keywords using ILIKE
      const conditions = keywords.map(
        (kw) => like(compositionAttempts.intent, `%${kw}%`)
      );

      const rows = await db
        .select()
        .from(compositionAttempts)
        .where(
          conditions.length === 1
            ? conditions[0]
            : sql`(${sql.join(conditions, sql` OR `)})`
        )
        .orderBy(desc(compositionAttempts.createdAt))
        .limit(limit);

      return rows.map((row) => this.rowToAttempt(row));
    } catch (error) {
      logger.warn('[CompositionReplayBuffer] findSimilar failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Find successful compositions that used similar tools
  // --------------------------------------------------------------------------

  async getSuccessfulExamples(
    tools: string[],
    limit: number = 3
  ): Promise<CompositionAttempt[]> {
    try {
      const db = getControlDb();

      if (tools.length === 0) {
        return [];
      }

      // Find successful compositions where the tools array contains any of the given tools.
      // Using jsonb containment: tools @> '["tool_name"]'::jsonb
      const toolConditions = tools.slice(0, 5).map(
        (tool) => sql`${compositionAttempts.tools}::jsonb @> ${JSON.stringify([tool])}::jsonb`
      );

      const rows = await db
        .select()
        .from(compositionAttempts)
        .where(
          and(
            eq(compositionAttempts.outcome, 'success'),
            toolConditions.length === 1
              ? toolConditions[0]
              : sql`(${sql.join(toolConditions, sql` OR `)})`
          )
        )
        .orderBy(desc(compositionAttempts.createdAt))
        .limit(limit);

      return rows.map((row) => this.rowToAttempt(row));
    } catch (error) {
      logger.warn('[CompositionReplayBuffer] getSuccessfulExamples failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Find failures as counter-examples
  // --------------------------------------------------------------------------

  async getFailureExamples(
    tools: string[],
    limit: number = 3
  ): Promise<CompositionAttempt[]> {
    try {
      const db = getControlDb();

      if (tools.length === 0) {
        return [];
      }

      const toolConditions = tools.slice(0, 5).map(
        (tool) => sql`${compositionAttempts.tools}::jsonb @> ${JSON.stringify([tool])}::jsonb`
      );

      const rows = await db
        .select()
        .from(compositionAttempts)
        .where(
          and(
            eq(compositionAttempts.outcome, 'failure'),
            toolConditions.length === 1
              ? toolConditions[0]
              : sql`(${sql.join(toolConditions, sql` OR `)})`
          )
        )
        .orderBy(desc(compositionAttempts.createdAt))
        .limit(limit);

      return rows.map((row) => this.rowToAttempt(row));
    } catch (error) {
      logger.warn('[CompositionReplayBuffer] getFailureExamples failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private extractKeywords(intent: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'and', 'or', 'but', 'not', 'this', 'that', 'it', 'i', 'me',
      'my', 'we', 'our', 'you', 'your', 'can', 'will', 'should',
      'do', 'does', 'did', 'have', 'has', 'had', 'want', 'need',
      'please', 'help', 'create', 'make', 'use', 'using',
    ]);

    return intent
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .slice(0, 5);
  }

  private rowToAttempt(row: typeof compositionAttempts.$inferSelect): CompositionAttempt {
    return {
      id: row.id,
      intent: row.intent,
      tools: (row.tools ?? []) as string[],
      definition: (row.definition as unknown as CompositionDefinition) ?? null,
      outcome: row.outcome as CompositionAttempt['outcome'],
      failureType: (row.failureType as CompositionAttempt['failureType']) ?? undefined,
      failureDetails: row.failureDetails ?? undefined,
      createdAt: row.createdAt,
    };
  }

  /**
   * Reset the singleton (for testing).
   */
  static resetInstance(): void {
    CompositionReplayBuffer.instance = undefined as unknown as CompositionReplayBuffer;
  }
}
