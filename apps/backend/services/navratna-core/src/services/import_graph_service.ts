import { dirname, relative, resolve } from 'node:path'
import { getIntelligenceDb, knowledgeItems } from '@uaip/shared-services'
import type { ImportEdge, ImportInfo } from '@uaip/types'
import { logger } from '@uaip/utils'

export class ImportGraphService {
  async buildGraph(imports: ImportInfo[], repoRoot: string): Promise<void> {
    const edges: ImportEdge[] = imports.map((importInfo) => {
      const fromFile = importInfo.file
      const toTarget = importInfo.source.startsWith('.')
        ? relative(repoRoot, resolve(dirname(resolve(repoRoot, fromFile)), importInfo.source))
        : importInfo.source

      return {
        from: fromFile,
        to: toTarget,
        symbols: importInfo.symbols,
      }
    })

    const intelligenceDb = getIntelligenceDb()

    // TODO: Persist import graph relationships in Neo4j when the graph driver is available.
    await intelligenceDb.insert(knowledgeItems).values({
      type: 'import-graph' as unknown as typeof knowledgeItems.$inferInsert['type'],
      content: JSON.stringify({ edges }),
      sourceType: 'ast-extraction' as unknown as typeof knowledgeItems.$inferInsert['sourceType'],
      sourceIdentifier: repoRoot,
      tags: ['layer-2', 'import-graph'],
      confidence: 0.75,
      metadata: {
        title: 'Import Graph',
        edgeCount: edges.length,
      },
      summary: `Import graph with ${edges.length} edges`,
    })

    logger.info('Import graph persisted to knowledge items', {
      repoRoot,
      edgeCount: edges.length,
    })
  }
}
