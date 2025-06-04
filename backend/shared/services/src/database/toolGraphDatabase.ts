// Tool Graph Database Service - Neo4j Operations
// Handles all Neo4j graph operations for tool relationships and recommendations
// Part of @uaip/shared-services

import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import { ToolDefinition } from '@uaip/types';
import { logger } from '@uaip/utils';

export interface ToolGraphDatabaseConfig {
  uri: string;
  user: string;
  password: string;
  database?: string;
  maxConnectionPoolSize?: number;
  connectionTimeout?: number;
}

export interface ToolRelationship {
  type: 'DEPENDS_ON' | 'SIMILAR_TO' | 'REPLACES' | 'ENHANCES' | 'REQUIRES';
  strength: number; // 0.0 to 1.0
  reason?: string;
  metadata?: Record<string, any>;
}

export interface ToolRecommendation {
  toolId: string;
  score: number;
  reason: string;
  confidence: number;
}

export interface UsagePattern {
  agentId: string;
  toolId: string;
  frequency: number;
  successRate: number;
  avgExecutionTime: number;
  contextPatterns: string[];
}

export class ToolGraphDatabase {
  private driver: Driver;
  private database: string;

  constructor(config: ToolGraphDatabaseConfig) {
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
      {
        maxConnectionPoolSize: config.maxConnectionPoolSize || 50,
        connectionTimeout: config.connectionTimeout || 5000,
      }
    );
    this.database = config.database || 'neo4j';
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  async verifyConnectivity(): Promise<void> {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run('RETURN 1');
      logger.info('Neo4j connectivity verified');
    } finally {
      await session.close();
    }
  }

  // Tool Node Operations
  async createToolNode(tool: ToolDefinition): Promise<void> {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        `MERGE (t:Tool {id: $id})
         SET t.name = $name,
             t.category = $category,
             t.capabilities = $capabilities,
             t.tags = $tags,
             t.security_level = $securityLevel,
             t.created_at = datetime(),
             t.updated_at = datetime()`,
        {
          id: tool.id,
          name: tool.name,
          category: tool.category,
          capabilities: tool.tags || [], // Using tags as capabilities for now
          tags: tool.tags || [],
          securityLevel: tool.securityLevel
        }
      );
      logger.info(`Tool node created: ${tool.id}`);
    } finally {
      await session.close();
    }
  }

  async updateToolNode(toolId: string, updates: Partial<ToolDefinition>): Promise<void> {
    const session = this.driver.session({ database: this.database });
    try {
      const setClause: string[] = ['t.updated_at = datetime()'];
      const params: Record<string, any> = { id: toolId };

      if (updates.name) {
        setClause.push('t.name = $name');
        params.name = updates.name;
      }
      if (updates.category) {
        setClause.push('t.category = $category');
        params.category = updates.category;
      }
      if (updates.tags) {
        setClause.push('t.tags = $tags');
        params.tags = updates.tags;
      }
      if (updates.securityLevel) {
        setClause.push('t.security_level = $securityLevel');
        params.securityLevel = updates.securityLevel;
      }

      await session.run(
        `MATCH (t:Tool {id: $id}) SET ${setClause.join(', ')}`,
        params
      );
    } finally {
      await session.close();
    }
  }

  async deleteToolNode(toolId: string): Promise<void> {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        'MATCH (t:Tool {id: $id}) DETACH DELETE t',
        { id: toolId }
      );
      logger.info(`Tool node deleted: ${toolId}`);
    } finally {
      await session.close();
    }
  }

  // Tool Relationship Operations
  async addToolRelationship(
    fromToolId: string,
    toToolId: string,
    relationship: ToolRelationship
  ): Promise<void> {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        `MATCH (t1:Tool {id: $fromId}), (t2:Tool {id: $toId})
         MERGE (t1)-[r:${relationship.type}]->(t2)
         SET r.strength = $strength,
             r.reason = $reason,
             r.metadata = $metadata,
             r.created_at = datetime(),
             r.updated_at = datetime()`,
        {
          fromId: fromToolId,
          toId: toToolId,
          strength: relationship.strength,
          reason: relationship.reason || '',
          metadata: relationship.metadata || {}
        }
      );
      logger.info(`Relationship added: ${fromToolId} -[${relationship.type}]-> ${toToolId}`);
    } finally {
      await session.close();
    }
  }

  async getRelatedTools(toolId: string, relationshipTypes?: string[], minStrength = 0.5): Promise<ToolDefinition[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const typeFilter = relationshipTypes && relationshipTypes.length > 0 
        ? `[${relationshipTypes.map(t => `'${t}'`).join('|')}]`
        : '';

      const result = await session.run(
        `MATCH (t1:Tool {id: $toolId})-[r${typeFilter}]-(t2:Tool)
         WHERE r.strength >= $minStrength
         RETURN t2.id as id, t2.name as name, t2.category as category,
                t2.tags as tags, t2.security_level as securityLevel,
                r.strength as strength, type(r) as relationshipType
         ORDER BY r.strength DESC
         LIMIT 10`,
        { toolId, minStrength }
      );

      return result.records.map(record => ({
        id: record.get('id'),
        name: record.get('name'),
        category: record.get('category'),
        tags: record.get('tags') || [],
        securityLevel: record.get('securityLevel'),
        // Add minimal required fields for ToolDefinition
        description: '',
        version: '1.0.0',
        parameters: {},
        returnType: {},
        examples: [],
        requiresApproval: false,
        dependencies: [],
        isEnabled: true,
        executionTimeEstimate: 1000,
        costEstimate: 0,
        author: 'system'
      }));
    } finally {
      await session.close();
    }
  }

  // Agent Usage Pattern Operations
  async updateUsagePattern(pattern: UsagePattern): Promise<void> {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        `MERGE (a:Agent {id: $agentId})
         MERGE (t:Tool {id: $toolId})
         MERGE (a)-[u:USES]->(t)
         SET u.frequency = $frequency,
             u.success_rate = $successRate,
             u.avg_execution_time = $avgExecutionTime,
             u.context_patterns = $contextPatterns,
             u.last_used = datetime(),
             u.updated_at = datetime()`,
        {
          agentId: pattern.agentId,
          toolId: pattern.toolId,
          frequency: pattern.frequency,
          successRate: pattern.successRate,
          avgExecutionTime: pattern.avgExecutionTime,
          contextPatterns: pattern.contextPatterns
        }
      );
    } finally {
      await session.close();
    }
  }

  async incrementUsage(agentId: string, toolId: string, executionTime: number, success: boolean): Promise<void> {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        `MERGE (a:Agent {id: $agentId})
         MERGE (t:Tool {id: $toolId})
         MERGE (a)-[u:USES]->(t)
         SET u.frequency = COALESCE(u.frequency, 0) + 1,
             u.total_execution_time = COALESCE(u.total_execution_time, 0) + $executionTime,
             u.success_count = COALESCE(u.success_count, 0) + $successIncrement,
             u.last_used = datetime(),
             u.success_rate = toFloat(COALESCE(u.success_count, 0) + $successIncrement) / (COALESCE(u.frequency, 0) + 1),
             u.avg_execution_time = toFloat(COALESCE(u.total_execution_time, 0) + $executionTime) / (COALESCE(u.frequency, 0) + 1)`,
        {
          agentId,
          toolId,
          executionTime,
          successIncrement: success ? 1 : 0
        }
      );
    } finally {
      await session.close();
    }
  }

  // Recommendation Engine
  async getRecommendations(agentId: string, context?: string, limit = 5): Promise<ToolRecommendation[]> {
    const session = this.driver.session({ database: this.database });
    try {
      // Get recommendations based on usage patterns and tool relationships
      const result = await session.run(
        `MATCH (a:Agent {id: $agentId})-[u:USES]->(t1:Tool)
         MATCH (t1)-[r:SIMILAR_TO|ENHANCES]-(t2:Tool)
         WHERE NOT EXISTS((a)-[:USES]->(t2))
         WITH t2, 
              avg(u.success_rate) as avg_success,
              avg(r.strength) as avg_relationship_strength,
              count(u) as usage_count
         WHERE avg_success > 0.7 AND avg_relationship_strength > 0.5
         RETURN t2.id as toolId,
                t2.name as toolName,
                (avg_success * avg_relationship_strength * usage_count) as score,
                'Based on similar tools you use successfully' as reason,
                avg_relationship_strength as confidence
         ORDER BY score DESC
         LIMIT $limit`,
        { agentId, limit }
      );

      return result.records.map(record => ({
        toolId: record.get('toolId'),
        score: record.get('score'),
        reason: record.get('reason'),
        confidence: record.get('confidence')
      }));
    } finally {
      await session.close();
    }
  }

  async getContextualRecommendations(context: string, limit = 5): Promise<ToolRecommendation[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (ctx:Context)-[s:SUGGESTS]->(t:Tool)
         WHERE ctx.pattern CONTAINS $context 
            OR ANY(keyword IN ctx.keywords WHERE keyword CONTAINS $context)
         RETURN t.id as toolId,
                t.name as toolName,
                s.strength as score,
                'Contextually relevant for: ' + ctx.description as reason,
                s.strength as confidence
         ORDER BY s.strength DESC, s.priority ASC
         LIMIT $limit`,
        { context: context.toLowerCase(), limit }
      );

      return result.records.map(record => ({
        toolId: record.get('toolId'),
        score: record.get('score'),
        reason: record.get('reason'),
        confidence: record.get('confidence')
      }));
    } finally {
      await session.close();
    }
  }

  // Analytics and Insights
  async getToolUsageAnalytics(toolId?: string, agentId?: string): Promise<any[]> {
    const session = this.driver.session({ database: this.database });
    try {
      let query = `
        MATCH (a:Agent)-[u:USES]->(t:Tool)
        WHERE 1=1
      `;
      const params: Record<string, any> = {};

      if (toolId) {
        query += ' AND t.id = $toolId';
        params.toolId = toolId;
      }

      if (agentId) {
        query += ' AND a.id = $agentId';
        params.agentId = agentId;
      }

      query += `
        RETURN t.id as toolId,
               t.name as toolName,
               a.id as agentId,
               u.frequency as frequency,
               u.success_rate as successRate,
               u.avg_execution_time as avgExecutionTime,
               u.last_used as lastUsed
        ORDER BY u.frequency DESC
      `;

      const result = await session.run(query, params);
      return result.records.map(record => ({
        toolId: record.get('toolId'),
        toolName: record.get('toolName'),
        agentId: record.get('agentId'),
        frequency: record.get('frequency'),
        successRate: record.get('successRate'),
        avgExecutionTime: record.get('avgExecutionTime'),
        lastUsed: record.get('lastUsed')
      }));
    } finally {
      await session.close();
    }
  }

  async getToolDependencies(toolId: string): Promise<string[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (t1:Tool {id: $toolId})-[:DEPENDS_ON]->(t2:Tool)
         RETURN t2.id as dependencyId
         ORDER BY dependencyId`,
        { toolId }
      );

      return result.records.map(record => record.get('dependencyId'));
    } finally {
      await session.close();
    }
  }

  async findSimilarTools(toolId: string, minSimilarity = 0.6, limit = 5): Promise<ToolRecommendation[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (t1:Tool {id: $toolId})-[r:SIMILAR_TO]-(t2:Tool)
         WHERE r.strength >= $minSimilarity
         RETURN t2.id as toolId,
                t2.name as toolName,
                r.strength as score,
                'Similar tool: ' + COALESCE(r.reason, 'No specific reason') as reason,
                r.strength as confidence
         ORDER BY r.strength DESC
         LIMIT $limit`,
        { toolId, minSimilarity, limit }
      );

      return result.records.map(record => ({
        toolId: record.get('toolId'),
        score: record.get('score'),
        reason: record.get('reason'),
        confidence: record.get('confidence')
      }));
    } finally {
      await session.close();
    }
  }

  // Utility Methods
  async getAgentToolPreferences(agentId: string): Promise<any[]> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (a:Agent {id: $agentId})-[u:USES]->(t:Tool)
         RETURN t.id as toolId,
                t.name as toolName,
                t.category as category,
                u.frequency as frequency,
                u.success_rate as successRate
         ORDER BY u.frequency DESC, u.success_rate DESC`,
        { agentId }
      );

      return result.records.map(record => ({
        toolId: record.get('toolId'),
        toolName: record.get('toolName'),
        category: record.get('category'),
        frequency: record.get('frequency'),
        successRate: record.get('successRate')
      }));
    } finally {
      await session.close();
    }
  }

  async getPopularTools(category?: string, limit = 10): Promise<any[]> {
    const session = this.driver.session({ database: this.database });
    try {
      let query = `
        MATCH (a:Agent)-[u:USES]->(t:Tool)
      `;
      const params: Record<string, any> = { limit };

      if (category) {
        query += ' WHERE t.category = $category';
        params.category = category;
      }

      query += `
        RETURN t.id as toolId,
               t.name as toolName,
               t.category as category,
               count(u) as totalUsage,
               avg(u.success_rate) as avgSuccessRate,
               avg(u.avg_execution_time) as avgExecutionTime
        ORDER BY totalUsage DESC, avgSuccessRate DESC
        LIMIT $limit
      `;

      const result = await session.run(query, params);
      return result.records.map(record => ({
        toolId: record.get('toolId'),
        toolName: record.get('toolName'),
        category: record.get('category'),
        totalUsage: record.get('totalUsage').toNumber(),
        avgSuccessRate: record.get('avgSuccessRate'),
        avgExecutionTime: record.get('avgExecutionTime')
      }));
    } finally {
      await session.close();
    }
  }
} 