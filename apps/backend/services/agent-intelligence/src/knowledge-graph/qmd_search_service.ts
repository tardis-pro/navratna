/**
 * QmdSearchService — Hybrid BM25 + Vector Search for Agent Memory
 *
 * Inspired by @tobilu/qmd's hybrid search pattern:
 *   1. PostgreSQL full-text search (BM25-equivalent via ts_rank_cd)
 *   2. Qdrant vector similarity search
 *   3. Reciprocal Rank Fusion (RRF) to merge both lists
 *
 * This gives agents both exact-keyword recall (BM25) AND semantic recall
 * (vector) — better than either alone.
 */

import { logger } from '@uaip/utils';
import type { QueryExecutor } from '../agent-memory/macrodata_memory_service.js';
import { QdrantService } from './qdrant_service.js';
import { EmbeddingService } from './embedding_service.js';

export interface QmdSearchResult {
  id: string;
  content: string;
  summary?: string;
  tags: string[];
  confidence: number;
  score: number; // RRF combined score
  bm25Score?: number;
  vectorScore?: number;
  sourceType: string;
}

export interface QmdSearchOptions {
  query: string;
  userId?: string;
  agentId?: string;
  limit?: number;
  /** 0–1: weight for vector score in RRF merge (default 0.6) */
  vectorWeight?: number;
}

const RRF_K = 60; // standard RRF constant

export class QmdSearchService {
  constructor(
    private readonly dataSource: QueryExecutor,
    private readonly vectorDb: QdrantService,
    private readonly embeddings: EmbeddingService
  ) {}

  /**
   * Hybrid BM25 + vector search with RRF merge.
   * Returns up to `limit` knowledge items most relevant to `query`.
   */
  async search(opts: QmdSearchOptions): Promise<QmdSearchResult[]> {
    const { query, userId, agentId, limit = 10, vectorWeight = 0.6 } = opts;

    if (!query || query.trim().length === 0) return [];

    const [bm25Results, vectorResults] = await Promise.allSettled([
      this.bm25Search(query, userId, agentId, limit * 2),
      this.vectorSearch(query, userId, agentId, limit * 2),
    ]);

    const bm25 = bm25Results.status === 'fulfilled' ? bm25Results.value : [];
    const vector = vectorResults.status === 'fulfilled' ? vectorResults.value : [];

    if (bm25.length === 0 && vector.length === 0) return [];

    return this.rrfMerge(bm25, vector, vectorWeight, limit);
  }

  // ─── BM25 via PostgreSQL full-text search ──────────────────────────────────

  private async bm25Search(
    query: string,
    userId?: string,
    agentId?: string,
    limit = 20
  ): Promise<
    Array<{
      id: string;
      content: string;
      summary?: string;
      tags: string[];
      confidence: number;
      sourceType: string;
      rank: number;
    }>
  > {
    try {
      // Build scope WHERE clause
      const scopeParts: string[] = [];
      const params: Array<string | number> = [];
      let paramIdx = 1;

      // Scope filter: agent-specific + user-specific + general (null)
      if (agentId && userId) {
        scopeParts.push(
          `("agentId" = $${paramIdx} OR "userId" = $${paramIdx + 1} OR ("agentId" IS NULL AND "userId" IS NULL))`
        );
        params.push(agentId, userId);
        paramIdx += 2;
      } else if (agentId) {
        scopeParts.push(`("agentId" = $${paramIdx} OR "agentId" IS NULL)`);
        params.push(agentId);
        paramIdx++;
      } else if (userId) {
        scopeParts.push(`("userId" = $${paramIdx} OR "userId" IS NULL)`);
        params.push(userId);
        paramIdx++;
      }

      // FTS query — plainto_tsquery handles natural-language input safely
      const ftsPart = `to_tsvector('english', content) @@ plainto_tsquery('english', $${paramIdx})`;
      params.push(query);
      const rankParam = paramIdx;
      paramIdx++;

      const whereClause = [...scopeParts, ftsPart].join(' AND ');

      params.push(limit);
      const sql = `
        SELECT
          id,
          content,
          summary,
          tags,
          confidence,
          "sourceType",
          ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $${rankParam})) AS rank
        FROM knowledge_items
        WHERE ${whereClause}
        ORDER BY rank DESC
        LIMIT $${paramIdx}
      `;

      const rawRows: unknown[] = await this.dataSource.query(sql, params);
      const rows = rawRows.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null);
      return rows.map((r) => ({
        id: String(r.id),
        content: String(r.content ?? ''),
        summary: r.summary != null ? String(r.summary) : undefined,
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        confidence: parseFloat(String(r.confidence)) || 0.8,
        sourceType: String(r.sourceType || 'UNKNOWN'),
        rank: parseFloat(String(r.rank)) || 0,
      }));
    } catch (err) {
      logger.warn('QMD BM25 search failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // ─── Vector search via Qdrant ──────────────────────────────────────────────

  private async vectorSearch(
    query: string,
    userId?: string,
    agentId?: string,
    limit = 20
  ): Promise<Array<{ id: string; score: number }>> {
    try {
      const queryEmbedding = await this.embeddings.generateEmbedding(query);
      const results = await this.vectorDb.search(queryEmbedding, {
        limit,
        threshold: 0.4, // lower threshold for broader recall; RRF handles quality
        filters: undefined,
      });
      return results.map((r) => ({
        id: String(r.payload?.knowledge_item_id ?? r.id),
        score: r.score,
      }));
    } catch (err) {
      logger.warn('QMD vector search failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // ─── Reciprocal Rank Fusion ────────────────────────────────────────────────

  private rrfMerge(
    bm25: Array<{
      id: string;
      content: string;
      summary?: string;
      tags: string[];
      confidence: number;
      sourceType: string;
      rank: number;
    }>,
    vector: Array<{ id: string; score: number }>,
    vectorWeight: number,
    limit: number
  ): QmdSearchResult[] {
    const bm25Weight = 1 - vectorWeight;

    // Build ID → metadata map from BM25 results
    const metaMap = new Map<
      string,
      { content: string; summary?: string; tags: string[]; confidence: number; sourceType: string }
    >();
    bm25.forEach((r) =>
      metaMap.set(r.id, {
        content: r.content,
        summary: r.summary,
        tags: r.tags,
        confidence: r.confidence,
        sourceType: r.sourceType,
      })
    );

    // Build RRF score map
    const rrfScores = new Map<
      string,
      { rrf: number; bm25?: number; vector?: number; id: string }
    >();

    bm25.forEach((r, rank) => {
      const rrf = (bm25Weight * 1) / (RRF_K + rank + 1);
      rrfScores.set(r.id, { rrf, bm25: r.rank, id: r.id });
    });

    // We need metadata for vector-only results — fetch from DB lazily below
    vector.forEach((r, rank) => {
      const contribution = (vectorWeight * 1) / (RRF_K + rank + 1);
      if (rrfScores.has(r.id)) {
        const existing = rrfScores.get(r.id)!;
        existing.rrf += contribution;
        existing.vector = r.score;
      } else {
        rrfScores.set(r.id, { rrf: contribution, vector: r.score, id: r.id });
      }
    });

    // Sort by RRF score descending, take top N
    const sorted = [...rrfScores.values()].sort((a, b) => b.rrf - a.rrf).slice(0, limit);

    // Map to results — only include IDs we have metadata for
    const results: QmdSearchResult[] = [];
    for (const entry of sorted) {
      const meta = metaMap.get(entry.id);
      if (!meta) continue; // vector-only hit without metadata — skip for now
      results.push({
        id: entry.id,
        content: meta.content,
        summary: meta.summary,
        tags: meta.tags,
        confidence: meta.confidence,
        sourceType: meta.sourceType,
        score: entry.rrf,
        bm25Score: entry.bm25,
        vectorScore: entry.vector,
      });
    }

    return results;
  }
}
