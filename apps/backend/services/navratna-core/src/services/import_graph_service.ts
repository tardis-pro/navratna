import { dirname, relative, resolve } from 'node:path'
import { getIntelligenceDb, knowledgeItems, ServiceFactory } from '@uaip/shared-services'
import type { ImportEdge, ImportInfo } from '@uaip/types'
import { KnowledgeType, SourceType } from '@uaip/types'
import { logger } from '@uaip/utils'

/** Maximum edges per Neo4j UNWIND transaction to avoid memory pressure. */
const NEO4J_BATCH_SIZE = 500

type Neo4jEdge = {
  from: string
  to: string
  symbols: string[]
}

type ImportGraphNode = {
  path: string
  repoRoot: string
  depth: number
}

export type ImportGraphResult = {
  root: string
  nodes: ImportGraphNode[]
  edges: ImportEdge[]
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

  /**
   * Remove :IMPORTS relationships for files that no longer exist in the repository.
   * Should be called before buildGraph() on a re-ingestion run.
   */
  async deleteStaleImports(repoRoot: string, currentFilePaths: string[]): Promise<void> {
    if (currentFilePaths.length === 0) {
      logger.info('deleteStaleImports: no current file paths provided, skipping', { repoRoot })
      return
    }

    try {
      const factory = ServiceFactory.getInstance()
      const graphDb = await factory.getToolGraphDatabase()

      const cypher = `
        MATCH (from:File {repoRoot: $repoRoot})-[r:IMPORTS]->()
        WHERE NOT from.path IN $currentFilePaths
        DELETE r
      `

      await graphDb.runQuery(cypher, { repoRoot, currentFilePaths })

      logger.info('Stale IMPORTS relationships deleted from Neo4j', { repoRoot })
    } catch (neo4jError) {
      logger.warn('Failed to delete stale imports from Neo4j; data may be stale', {
        repoRoot,
        error: neo4jError instanceof Error ? neo4jError.message : String(neo4jError),
      })
    }
  }

  /**
   * Retrieve the transitive import graph for a given file up to the specified depth.
   * Returns the list of edges reachable from `file` within `depth` hops.
   */
  async getImportGraph(file: string, repoRoot: string, depth: number = 3): Promise<ImportGraphResult> {
    const safeDepth = Math.max(1, Math.min(depth, 10))

    try {
      const factory = ServiceFactory.getInstance()
      const graphDb = await factory.getToolGraphDatabase()

      const cypher = `
        MATCH (root:File {path: $path, repoRoot: $repoRoot})
        OPTIONAL MATCH path = (root)-[:IMPORTS*1..${safeDepth}]->(dep:File)
        WITH root, relationships(path) AS rels, nodes(path) AS nds
        UNWIND CASE WHEN rels IS NULL THEN [] ELSE rels END AS r
        WITH root, r, startNode(r) AS fromNode, endNode(r) AS toNode
        RETURN DISTINCT
          fromNode.path AS fromPath,
          toNode.path   AS toPath,
          r.symbols     AS symbols
      `

      const result = await graphDb.runQuery(cypher, { path: file, repoRoot })

      const edges: ImportEdge[] = []
      const nodeMap = new Map<string, ImportGraphNode>()

      nodeMap.set(file, { path: file, repoRoot, depth: 0 })

      if (Array.isArray(result)) {
        for (const row of result) {
          const fromPath = row.fromPath as string
          const toPath = row.toPath as string
          const symbols = (row.symbols as string[]) ?? []

          edges.push({ from: fromPath, to: toPath, symbols })

          if (!nodeMap.has(fromPath)) {
            nodeMap.set(fromPath, { path: fromPath, repoRoot, depth: 1 })
          }
          if (!nodeMap.has(toPath)) {
            nodeMap.set(toPath, { path: toPath, repoRoot, depth: 1 })
          }
        }
      }

      logger.info('Import graph retrieved from Neo4j', {
        file,
        repoRoot,
        depth: safeDepth,
        edgeCount: edges.length,
      })

      return {
        root: file,
        nodes: Array.from(nodeMap.values()),
        edges,
      }
    } catch (neo4jError) {
      logger.warn('Failed to retrieve import graph from Neo4j; returning empty result', {
        file,
        repoRoot,
        depth: safeDepth,
        error: neo4jError instanceof Error ? neo4jError.message : String(neo4jError),
      })
      return { root: file, nodes: [], edges: [] }
    }
  }

  private async persistToNeo4j(edges: ImportEdge[], repoRoot: string): Promise<void> {
    if (edges.length === 0) {
      return
    }

    try {
      const factory = ServiceFactory.getInstance()
      const graphDb = await factory.getToolGraphDatabase()

      await this.ensureNeo4jIndexes(graphDb)

      const neo4jEdges: Neo4jEdge[] = edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        symbols: edge.symbols ?? [],
      }))

      const cypher = `
        UNWIND $edges AS edge
        MERGE (from:File {path: edge.from, repoRoot: $repoRoot})
        MERGE (to:File {path: edge.to, repoRoot: $repoRoot})
        MERGE (from)-[r:IMPORTS]->(to)
        SET r.symbols = edge.symbols, r.updatedAt = datetime()
      `

      // Chunk to avoid Neo4j transaction memory pressure.
      for (let offset = 0; offset < neo4jEdges.length; offset += NEO4J_BATCH_SIZE) {
        const chunk = neo4jEdges.slice(offset, offset + NEO4J_BATCH_SIZE)
        // oxlint-disable-next-line no-await-in-loop -- sequential batch writes required
        await graphDb.runQuery(cypher, { edges: chunk, repoRoot })
      }

      logger.info('Import graph persisted to Neo4j', {
        repoRoot,
        edgeCount: edges.length,
        batchCount: Math.ceil(edges.length / NEO4J_BATCH_SIZE),
      })
    } catch (neo4jError) {
      logger.warn('Failed to persist import graph to Neo4j; PostgreSQL data intact', {
        repoRoot,
        edgeCount: edges.length,
        error: neo4jError instanceof Error ? neo4jError.message : String(neo4jError),
      })
    }
  }

  private async ensureNeo4jIndexes(graphDb: { runQuery: (cypher: string, params?: Record<string, unknown>) => Promise<unknown> }): Promise<void> {
    const indexQueries = [
      'CREATE INDEX file_path_repo_idx IF NOT EXISTS FOR (f:File) ON (f.path, f.repoRoot)',
      'CREATE INDEX file_path_idx IF NOT EXISTS FOR (f:File) ON (f.path)',
    ]

    for (const query of indexQueries) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential DDL required
        await graphDb.runQuery(query)
      } catch (indexError) {
        // Index creation failures are non-fatal — writes will still succeed, just slower.
        logger.warn('Failed to create Neo4j index (non-fatal)', {
          query,
          error: indexError instanceof Error ? indexError.message : String(indexError),
        })
      }
    }
  }
}
