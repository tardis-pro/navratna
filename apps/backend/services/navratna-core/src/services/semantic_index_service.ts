import { getIntelligenceDb, knowledgeItems, ServiceFactory } from '@uaip/shared-services'
import { KnowledgeType, SourceType } from '@uaip/types'
import type { SymbolInfo } from '@uaip/types'
import { config } from '@uaip/config'
import { logger } from '@uaip/utils'

/** Batch size for embedding generation to avoid overloading the embedding service. */
const EMBEDDING_BATCH_SIZE = 50

/** Name and dimension of the Qdrant collection dedicated to code symbols. */
const CODE_SYMBOLS_COLLECTION = 'code_symbols'
const CODE_SYMBOLS_DIM = 768

export type SemanticSearchResult = {
  knowledgeItemId: string
  name: string
  kind: string
  file: string
  line: number
  repoId: string
  score: number
}

export class SemanticIndexService {
  private codeSymbolsBootstrapped = false

  async indexSymbols(symbols: SymbolInfo[], repoId: string): Promise<void> {
    if (symbols.length === 0) {
      logger.info('Semantic indexing skipped: no symbols found', { repoId })
      return
    }

    await this.bootstrapCodeSymbolsCollection()

    const intelligenceDb = getIntelligenceDb()
    const values = symbols.map((symbol) => ({
      type: KnowledgeType.CODE_SYMBOL,
      content: JSON.stringify({
        file: symbol.file,
        kind: symbol.kind,
        line: symbol.line,
      }),
      sourceType: SourceType.AST_EXTRACTION,
      sourceIdentifier: repoId,
      tags: ['layer-2', 'code-symbol', symbol.kind],
      confidence: 0.8,
      metadata: {
        title: symbol.name,
        file: symbol.file,
        kind: symbol.kind,
        line: symbol.line,
      },
      summary: `Code symbol ${symbol.name} (${symbol.kind})`,
    }))

    const inserted = await intelligenceDb
      .insert(knowledgeItems)
      .values(values)
      .returning({ id: knowledgeItems.id })

    logger.info('Semantic symbol indexing completed', {
      repoId,
      symbolCount: symbols.length,
    })

    await this.syncToQdrant(symbols, inserted.map((r) => r.id), repoId)
  }

  /**
   * Search for code symbols semantically.
   * Generates an embedding for `query` and retrieves the top-K matching symbols
   * from the `code_symbols` Qdrant collection, optionally filtered by `repoId`.
   */
  async semanticSearch(query: string, repoId: string, topK: number = 10): Promise<SemanticSearchResult[]> {
    try {
      await this.bootstrapCodeSymbolsCollection()

      const factory = ServiceFactory.getInstance()
      const embeddingService = await factory.getSmartEmbeddingService()

      const embeddings = await embeddingService.generateEmbeddings(query)
      if (embeddings.length === 0) {
        logger.warn('Semantic search: embedding generation returned empty result', { query, repoId })
        return []
      }

      const queryVector = embeddings[0]
      const qdrantUrl = this.resolveQdrantUrl()

      const filter = repoId
        ? { must: [{ key: 'repoId', match: { value: repoId } }] }
        : undefined

      const response = await fetch(
        `${qdrantUrl}/collections/${CODE_SYMBOLS_COLLECTION}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: queryVector,
            limit: topK,
            with_payload: true,
            score_threshold: 0.5,
            ...(filter ? { filter } : {}),
          }),
          signal: AbortSignal.timeout(5000),
        }
      )

      if (!response.ok) {
        logger.warn('Semantic search Qdrant request failed', {
          status: response.status,
          query,
          repoId,
        })
        return []
      }

      const data: unknown = await response.json()
      return this.mapSearchResults(data)
    } catch (searchError) {
      logger.warn('Semantic search failed; returning empty result', {
        query,
        repoId,
        error: searchError instanceof Error ? searchError.message : String(searchError),
      })
      return []
    }
  }

  /**
   * Ensure the `code_symbols` Qdrant collection (768-dim, Cosine distance) exists.
   * Safe to call repeatedly — idempotent.
   */
  async bootstrapCodeSymbolsCollection(): Promise<void> {
    if (this.codeSymbolsBootstrapped) {
      return
    }

    const qdrantUrl = this.resolveQdrantUrl()

    try {
      const checkResponse = await fetch(
        `${qdrantUrl}/collections/${CODE_SYMBOLS_COLLECTION}`,
        { signal: AbortSignal.timeout(5000) }
      )

      if (checkResponse.status === 404) {
        const createResponse = await fetch(
          `${qdrantUrl}/collections/${CODE_SYMBOLS_COLLECTION}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vectors: { size: CODE_SYMBOLS_DIM, distance: 'Cosine' },
              optimizers_config: { default_segment_number: 2 },
              replication_factor: 1,
            }),
            signal: AbortSignal.timeout(5000),
          }
        )

        if (!createResponse.ok) {
          throw new Error(`Failed to create ${CODE_SYMBOLS_COLLECTION}: ${createResponse.statusText}`)
        }

        logger.info('Bootstrapped code_symbols Qdrant collection', {
          collection: CODE_SYMBOLS_COLLECTION,
          dimensions: CODE_SYMBOLS_DIM,
        })
      } else if (!checkResponse.ok) {
        throw new Error(`Unexpected Qdrant status ${checkResponse.status} checking collection`)
      }

      this.codeSymbolsBootstrapped = true
    } catch (bootstrapError) {
      logger.warn('Failed to bootstrap code_symbols Qdrant collection; continuing without it', {
        error: bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError),
      })
    }
  }

  private async syncToQdrant(symbols: SymbolInfo[], knowledgeIds: string[], repoId: string): Promise<void> {
    try {
      const factory = ServiceFactory.getInstance()
      const embeddingService = await factory.getSmartEmbeddingService()

      const qdrantUrl = this.resolveQdrantUrl()
      let synced = 0

      for (let batchStart = 0; batchStart < symbols.length; batchStart += EMBEDDING_BATCH_SIZE) {
        const batchSymbols = symbols.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE)
        const batchIds = knowledgeIds.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE)

        const points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = []

        for (let i = 0; i < batchSymbols.length; i++) {
          const symbol = batchSymbols[i]
          const knowledgeItemId = batchIds[i]
          if (!symbol || !knowledgeItemId) continue

          const text = `${symbol.name} ${symbol.kind} in ${symbol.file}`
          // oxlint-disable-next-line no-await-in-loop -- sequential per-symbol embedding required
          const embeddings = await embeddingService.generateEmbeddings(text)
          if (embeddings.length === 0) continue

          points.push({
            id: knowledgeItemId,
            vector: embeddings[0],
            payload: {
              knowledgeItemId,
              name: symbol.name,
              kind: symbol.kind,
              file: symbol.file,
              line: symbol.line,
              repoId,
              createdAt: new Date().toISOString(),
            },
          })
          synced++
        }

        if (points.length > 0) {
          // oxlint-disable-next-line no-await-in-loop -- sequential batch upsert required
          await this.upsertPoints(qdrantUrl, points)
        }
      }

      logger.info('Vector embedding sync to Qdrant completed', {
        repoId,
        symbolCount: symbols.length,
        synced,
      })
    } catch (qdrantError) {
      logger.warn('Failed to sync vector embeddings to Qdrant; PostgreSQL data intact', {
        repoId,
        symbolCount: symbols.length,
        error: qdrantError instanceof Error ? qdrantError.message : String(qdrantError),
      })
    }
  }

  private async upsertPoints(
    qdrantUrl: string,
    points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>
  ): Promise<void> {
    const response = await fetch(
      `${qdrantUrl}/collections/${CODE_SYMBOLS_COLLECTION}/points`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!response.ok) {
      throw new Error(`Qdrant upsert failed: ${response.statusText}`)
    }
  }

  private mapSearchResults(data: unknown): SemanticSearchResult[] {
    if (typeof data !== 'object' || data === null || !('result' in data)) {
      return []
    }
    const result: unknown = (data as { result: unknown }).result
    if (!Array.isArray(result)) {
      return []
    }

    return result
      .filter(
        (item): item is { id: string; score: number; payload: Record<string, unknown> } =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          'score' in item &&
          'payload' in item
      )
      .map((item) => ({
        knowledgeItemId: typeof item.payload.knowledgeItemId === 'string' ? item.payload.knowledgeItemId : item.id,
        name: typeof item.payload.name === 'string' ? item.payload.name : '',
        kind: typeof item.payload.kind === 'string' ? item.payload.kind : '',
        file: typeof item.payload.file === 'string' ? item.payload.file : '',
        line: typeof item.payload.line === 'number' ? item.payload.line : 0,
        repoId: typeof item.payload.repoId === 'string' ? item.payload.repoId : '',
        score: item.score,
      }))
  }

  private resolveQdrantUrl(): string {
    return config.database?.qdrant?.url ?? process.env.QDRANT_URL ?? 'http://localhost:6333'
  }
}
