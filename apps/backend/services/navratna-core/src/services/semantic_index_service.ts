import { getIntelligenceDb, knowledgeItems, ServiceFactory } from '@uaip/shared-services'
import { KnowledgeType, SourceType } from '@uaip/types'
import type { SymbolInfo } from '@uaip/types'
import { logger } from '@uaip/utils'

export class SemanticIndexService {
  async indexSymbols(symbols: SymbolInfo[], repoId: string): Promise<void> {
    if (symbols.length === 0) {
      logger.info('Semantic indexing skipped: no symbols found', { repoId })
      return
    }

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

  private async syncToQdrant(symbols: SymbolInfo[], knowledgeIds: string[], repoId: string): Promise<void> {
    try {
      const factory = ServiceFactory.getInstance()
      const [embeddingService, qdrantService] = await Promise.all([
        factory.getSmartEmbeddingService(),
        factory.getQdrantService(),
      ])

      let synced = 0
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i]
        const knowledgeItemId = knowledgeIds[i]
        if (!symbol || !knowledgeItemId) {
          continue
        }

        const text = `${symbol.name} ${symbol.kind} in ${symbol.file}`
        const embeddings = await embeddingService.generateEmbeddings(text)
        if (embeddings.length > 0) {
          await qdrantService.store(knowledgeItemId, embeddings)
          synced++
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
}
