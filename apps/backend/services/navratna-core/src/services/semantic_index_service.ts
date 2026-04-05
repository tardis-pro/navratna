import { getIntelligenceDb, knowledgeItems } from '@uaip/shared-services'
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
      type: 'code-symbol',
      content: JSON.stringify({
        file: symbol.file,
        kind: symbol.kind,
        line: symbol.line,
      }),
      sourceType: 'ast-extraction',
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

    // TODO: Add Qdrant vector embedding sync once the embeddings service is available.
    // @ts-expect-error -- 'code-symbol'/'ast-extraction' extend KnowledgeType/SourceType enums not yet updated; db column is text
    await intelligenceDb.insert(knowledgeItems).values(values)

    logger.info('Semantic symbol indexing completed', {
      repoId,
      symbolCount: symbols.length,
    })
  }
}
