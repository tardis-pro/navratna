import { dirname, relative, resolve } from 'node:path'
import { getIntelligenceDb, knowledgeItems, ServiceFactory } from '@uaip/shared-services'
import type { ImportEdge, ImportInfo } from '@uaip/types'
import { KnowledgeType, SourceType } from '@uaip/types'
import { logger } from '@uaip/utils'

type Neo4jEdge = {
  from: string
  to: string
  symbols: string[]
}

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

    await intelligenceDb.insert(knowledgeItems).values({
      type: KnowledgeType.PROCEDURAL,
      content: JSON.stringify({ edges }),
      sourceType: SourceType.FILE_SYSTEM,
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

    await this.persistToNeo4j(edges, repoRoot)
  }

  private async persistToNeo4j(edges: ImportEdge[], repoRoot: string): Promise<void> {
    if (edges.length === 0) {
      return
    }

    try {
      const factory = ServiceFactory.getInstance()
      const graphDb = await factory.getToolGraphDatabase()

      const cypher = `
        UNWIND $edges AS edge
        MERGE (from:File {path: edge.from, repoRoot: $repoRoot})
        MERGE (to:File {path: edge.to, repoRoot: $repoRoot})
        MERGE (from)-[r:IMPORTS]->(to)
        SET r.symbols = edge.symbols, r.updatedAt = datetime()
      `

      const neo4jEdges: Neo4jEdge[] = edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        symbols: edge.symbols ?? [],
      }))

      await graphDb.runQuery(cypher, { edges: neo4jEdges, repoRoot })

      logger.info('Import graph persisted to Neo4j', {
        repoRoot,
        edgeCount: edges.length,
      })
    } catch (neo4jError) {
      logger.warn('Failed to persist import graph to Neo4j; PostgreSQL data intact', {
        repoRoot,
        edgeCount: edges.length,
        error: neo4jError instanceof Error ? neo4jError.message : String(neo4jError),
      })
    }
  }
}
