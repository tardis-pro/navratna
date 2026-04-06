/**
 * ToolGraphDatabase - Neo4j-based graph database for tool relationships
 *
 * Provides graph database capabilities for knowledge graph and tool relationships
 */
import { Driver, Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { createLogger } from '@uaip/utils';
import type { ToolGraphDatabaseConfig, ToolNode, ToolRelationship } from '@uaip/types';

const logger = createLogger({
  serviceName: 'tool-graph-database',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export type { ToolGraphDatabaseConfig, ToolNode, ToolRelationship };

function toToolNode(
  record: { get: (key: string) => { properties: Record<string, unknown> } },
  key: string
): ToolNode {
  const props = record.get(key).properties;
  return {
    id: String(props.id ?? ''),
    name: String(props.name ?? ''),
    category: String(props.category ?? ''),
    tags: Array.isArray(props.tags) ? props.tags.map(String) : [],
    capabilities: Array.isArray(props.capabilities) ? props.capabilities.map(String) : [],
    version: props.version != null ? String(props.version) : undefined,
    description: props.description != null ? String(props.description) : undefined,
  };
}

const mapRecordToToolNode = (
  record: { get: (key: string) => { properties: Record<string, unknown> } }
): ToolNode => toToolNode(record, 'tool');

export class ToolGraphDatabase {
  private driver: Driver | null = null;
  private config: ToolGraphDatabaseConfig;
  private isInitialized: boolean = false;

  constructor(config: ToolGraphDatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize Neo4j connection
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing ToolGraphDatabase...', {
        uri: this.config.uri,
        database: this.config.database ?? 'neo4j',
      });

      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
          maxConnectionPoolSize: 100,
        }
      );

      // Verify connection
      const session = await this.getSession();
      await session.run('MATCH (n) RETURN n LIMIT 1');
      await session.close();

      this.isInitialized = true;
      logger.info('ToolGraphDatabase initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ToolGraphDatabase', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get Neo4j session
   */
  private async getSession(): Promise<Session> {
    if (!this.driver) {
      throw new Error('ToolGraphDatabase not initialized');
    }
    return this.driver.session({
      database: this.config.database ?? 'neo4j',
    });
  }

  /**
   * Create or update a tool node
   */
  public async upsertTool(tool: ToolNode): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ToolGraphDatabase not initialized');
    }

    const session = await this.getSession();
    try {
      await session.run(
        `
        MERGE (t:Tool {id: $id})
        SET t.name = $name,
            t.category = $category,
            t.tags = $tags,
            t.capabilities = $capabilities,
            t.version = $version,
            t.description = $description,
            t.updatedAt = datetime()
        `,
        {
          id: tool.id,
          name: tool.name,
          category: tool.category,
          tags: tool.tags,
          capabilities: tool.capabilities,
          version: tool.version,
          description: tool.description,
        }
      );

      logger.debug('Upserted tool node', { toolId: tool.id });
    } catch (error) {
      logger.error('Failed to upsert tool', {
        error: error instanceof Error ? error.message : 'Unknown error',
        toolId: tool.id,
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a relationship between tools
   */
  public async upsertRelationship(relationship: ToolRelationship): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ToolGraphDatabase not initialized');
    }

    const session = await this.getSession();
    try {
      await session.run(
        `
        MATCH (source:Tool {id: $sourceId})
        MATCH (target:Tool {id: $targetId})
        MERGE (source)-[r:RELATIONSHIP {type: $type}]->(target)
        SET r.strength = $strength,
            r.metadata = $metadata,
            r.updatedAt = datetime()
        `,
        {
          sourceId: relationship.sourceToolId,
          targetId: relationship.targetToolId,
          type: relationship.relationshipType,
          strength: relationship.strength ?? 1.0,
          metadata: relationship.metadata,
        }
      );

      logger.debug('Upserted tool relationship', {
        sourceId: relationship.sourceToolId,
        targetId: relationship.targetToolId,
        type: relationship.relationshipType,
      });
    } catch (error) {
      logger.error('Failed to upsert relationship', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Find similar tools
   */
  public async findSimilarTools(
    toolId: string,
    options?: { limit?: number; minSimilarity?: number }
  ): Promise<ToolNode[]> {
    if (!this.isInitialized) {
      throw new Error('ToolGraphDatabase not initialized');
    }

    const session = await this.getSession();
    try {
      const result = await session.run(
        `
        MATCH (tool:Tool {id: $toolId})-[r:RELATIONSHIP {type: 'SIMILAR_TO'}]->(similar:Tool)
        WHERE r.strength >= $minSimilarity
        RETURN similar
        ORDER BY r.strength DESC
        LIMIT $limit
        `,
        {
          toolId,
          minSimilarity: options?.minSimilarity ?? 0.5,
          limit: options?.limit ?? 10,
        }
      );

      return result.records.map((record) => toToolNode(record, 'similar'));
    } catch (error) {
      logger.error('Failed to find similar tools', {
        error: error instanceof Error ? error.message : 'Unknown error',
        toolId,
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get tool recommendations based on context
   */
  public async getRecommendations(
    context: { categories?: string[]; tags?: string[] },
    options?: { limit?: number }
  ): Promise<ToolNode[]> {
    if (!this.isInitialized) {
      throw new Error('ToolGraphDatabase not initialized');
    }

    const session = await this.getSession();
    try {
      let query = `
        MATCH (tool:Tool)
        WHERE 1=1
      `;

      const params: Record<string, unknown> = {
        limit: options?.limit ?? 10,
      };

      if (context.categories?.length) {
        query += ` AND tool.category IN $categories`;
        params.categories = context.categories;
      }

      if (context.tags?.length) {
        query += ` AND ANY(tag IN $tags WHERE tag IN tool.tags)`;
        params.tags = context.tags;
      }

      query += `
        RETURN tool
        ORDER BY tool.name
        LIMIT $limit
      `;

      const result = await session.run(query, params);
      return result.records.map(mapRecordToToolNode);
    } catch (error) {
      logger.error('Failed to get recommendations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get all tools (for initial sync)
   */
  public async getAllTools(): Promise<ToolNode[]> {
    if (!this.isInitialized) {
      throw new Error('ToolGraphDatabase not initialized');
    }

    const session = await this.getSession();
    try {
      const result = await session.run('MATCH (tool:Tool) RETURN tool');
      return result.records.map(mapRecordToToolNode);
    } catch (error) {
      logger.error('Failed to get all tools', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get tool by ID
   */
  public async getToolById(toolId: string): Promise<ToolNode | null> {
    if (!this.isInitialized) {
      throw new Error('ToolGraphDatabase not initialized');
    }

    const session = await this.getSession();
    try {
      const result = await session.run('MATCH (tool:Tool {id: $toolId}) RETURN tool LIMIT 1', {
        toolId,
      });

      if (result.records.length === 0) {
        return null;
      }

      return toToolNode(result.records[0], 'tool');
    } catch (error) {
      logger.error('Failed to get tool by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        toolId,
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete tool and its relationships
   */
  public async deleteTool(toolId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ToolGraphDatabase not initialized');
    }

    const session = await this.getSession();
    try {
      await session.run(
        `
        MATCH (tool:Tool {id: $toolId})
        DETACH DELETE tool
        `,
        { toolId }
      );

      logger.debug('Deleted tool', { toolId });
    } catch (error) {
      logger.error('Failed to delete tool', {
        error: error instanceof Error ? error.message : 'Unknown error',
        toolId,
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Health check
   */
  public isHealthy(): boolean {
    return this.isInitialized && this.driver !== null;
  }

  /**
   * Close connection
   */
  public async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
    this.isInitialized = false;
    logger.info('ToolGraphDatabase closed');
  }
}
