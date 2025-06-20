// Tool Graph Database Service - Neo4j Operations
// Handles all Neo4j graph operations for tool relationships and recommendations
// Part of @uaip/shared-services

import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import { ToolDefinition } from '@uaip/types';
import { logger } from '@uaip/utils';
import { config, DatabaseConfig } from '@uaip/config';

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
  private isConnected: boolean = false;
  private connectionRetries: number = 0;
  private maxRetries: number = 3;

  constructor(neo4jConfig?: DatabaseConfig['neo4j']) {
    // Use shared config if no specific config provided
    const dbConfig = neo4jConfig || config.database.neo4j;
    
    try {
      this.driver = neo4j.driver(
        dbConfig.uri,
        neo4j.auth.basic(dbConfig.user, dbConfig.password),
        {
          maxConnectionPoolSize: dbConfig.maxConnectionPoolSize || 50,
          connectionTimeout: dbConfig.connectionTimeout || 5000,
          maxTransactionRetryTime: 15000,
          logging: {
            level: 'warn',
            logger: (level, message) => logger.debug(`Neo4j [${level}]: ${message}`)
          }
        }
      );
      this.database = dbConfig.database || 'neo4j';
      
      logger.info(`Neo4j driver initialized for ${dbConfig.uri}`);
    } catch (error) {
      logger.error('Failed to initialize Neo4j driver:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.driver) {
        await this.driver.close();
        this.isConnected = false;
        logger.info('Neo4j driver closed successfully');
      }
    } catch (error) {
      logger.error('Error closing Neo4j driver:', error);
      throw error;
    }
  }

  async verifyConnectivity(maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const session = this.driver.session({ database: this.database });
      try {
        logger.info(`🔄 Verifying Neo4j connectivity (attempt ${attempt}/${maxRetries})`);
        logger.info(`Neo4j config: uri=${this.driver['_config']?.serverAgent || 'unknown'}, database=${this.database}`);
        
        const result = await session.run('RETURN 1 as test');
        
        // Enhanced debugging
        logger.info(`Neo4j query result: records=${result.records?.length}, summary=${JSON.stringify(result.summary?.counters || {})}`);
        
        if (!result.records || result.records.length === 0) {
          throw new Error('No records returned from Neo4j query');
        }
        
        const record = result.records[0];
        if (!record) {
          throw new Error('First record is null or undefined');
        }
        
        let testValue;
        try {
          testValue = record.get('test');
        } catch (recordError) {
          throw new Error(`Failed to get 'test' field from record: ${recordError.message}`);
        }
        
        logger.info(`Neo4j test value: ${testValue} (type: ${typeof testValue})`);
        
        // Handle Neo4j Integer objects - convert to JavaScript number for comparison
        const numericValue = typeof testValue === 'object' && testValue !== null && 'toNumber' in testValue 
          ? testValue.toNumber() 
          : testValue;
        
        if (numericValue === 1) {
          this.isConnected = true;
          this.connectionRetries = 0;
          logger.info('✅ Neo4j connectivity verified successfully');
          return;
        } else {
          throw new Error(`Invalid test value from Neo4j: expected 1, got ${numericValue} (original: ${testValue}, type: ${typeof testValue})`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`❌ Neo4j connectivity check failed (attempt ${attempt}/${maxRetries}):`, errorMessage);
        
        // Log additional error details for debugging
        if (error instanceof Error && error.stack) {
          logger.info(`Neo4j error stack: ${error.stack}`);
        }
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          logger.info(`⏳ Retrying Neo4j connection in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          this.isConnected = false;
          throw new Error(`Failed to connect to Neo4j after ${maxRetries} attempts. Last error: ${errorMessage}`);
        }
      } finally {
        await session.close();
      }
    }
  }

  public async executeWithRetry<T>(
    operation: (session: Session) => Promise<T>,
    operationName: string = 'Neo4j operation'
  ): Promise<T> {
    if (!this.isConnected) {
      try {
        await this.verifyConnectivity(2); // Quick retry
      } catch (error) {
        logger.warn(`${operationName} skipped - Neo4j not available:`, error.message);
        throw new Error(`Neo4j not available: ${error.message}`);
      }
    }

    const session = this.driver.session({ database: this.database });
    try {
      return await operation(session);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`${operationName} failed:`, errorMessage);
      
      // Mark as disconnected if it's a connection error
      if (errorMessage.includes('connection') || errorMessage.includes('timeout')) {
        this.isConnected = false;
      }
      
      throw error;
    } finally {
      await session.close();
    }
  }

  // Helper method to check if Neo4j operations should be attempted
  private shouldSkipOperation(operationName: string): boolean {
    if (!this.isConnected) {
      logger.warn(`${operationName} skipped - Neo4j not connected`);
      return true;
    }
    return false;
  }

  // Public method to check connection status
  public getConnectionStatus(): { isConnected: boolean; database: string; retries: number } {
    return {
      isConnected: this.isConnected,
      database: this.database,
      retries: this.connectionRetries
    };
  }

  // Tool Node Operations
  async createToolNode(tool: ToolDefinition): Promise<void> {
    if (this.shouldSkipOperation(`Create tool node ${tool.id}`)) {
      return; // Gracefully skip if Neo4j not available
    }
    
    return this.executeWithRetry(async (session) => {
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
    }, `Create tool node ${tool.id}`);
  }

  async updateToolNode(toolId: string, updates: Partial<ToolDefinition>): Promise<void> {
    return this.executeWithRetry(async (session) => {
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
    }, `Update tool node ${toolId}`);
  }

  async deleteToolNode(toolId: string): Promise<void> {
    return this.executeWithRetry(async (session) => {
      await session.run(
        'MATCH (t:Tool {id: $id}) DETACH DELETE t',
        { id: toolId }
      );
      logger.info(`Tool node deleted: ${toolId}`);
    }, `Delete tool node ${toolId}`);
  }

  // Tool Relationship Operations
  async addToolRelationship(
    fromToolId: string,
    toToolId: string,
    relationship: ToolRelationship
  ): Promise<void> {
    return this.executeWithRetry(async (session) => {
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
    }, `Add tool relationship ${fromToolId} -> ${toToolId}`);
  }

  async getRelatedTools(toolId: string, relationshipTypes?: string[], minStrength = 0.5): Promise<ToolDefinition[]> {
    if (this.shouldSkipOperation(`Get related tools for ${toolId}`)) {
      return []; // Return empty array if Neo4j not available
    }
    
    return this.executeWithRetry(async (session) => {
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
    }, `Get related tools for ${toolId}`);
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
    if (this.shouldSkipOperation(`Get recommendations for agent ${agentId}`)) {
      return []; // Return empty array if Neo4j not available
    }
    
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

  // ===== MCP INTEGRATION METHODS =====

  /**
   * Create or update MCP Server node in Neo4j
   */
  async createMcpServerNode(serverData: {
    id: string;
    name: string;
    type: string;
    status: string;
    capabilities?: any;
    tags?: string[];
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (this.shouldSkipOperation(`Create MCP server node ${serverData.id}`)) {
      return;
    }

    await this.executeWithRetry(async (session) => {
      await session.run(
        `MERGE (s:MCPServer {id: $id})
         SET s.name = $name,
             s.type = $type,
             s.status = $status,
             s.capabilities = $capabilities,
             s.tags = $tags,
             s.metadata = $metadata,
             s.updatedAt = datetime()
         RETURN s`,
        {
          id: serverData.id,
          name: serverData.name,
          type: serverData.type,
          status: serverData.status,
          capabilities: serverData.capabilities || {},
          tags: serverData.tags || [],
          metadata: serverData.metadata || {}
        }
      );
    }, `Create MCP server node ${serverData.id}`);
  }

  /**
   * Update MCP Server node in Neo4j
   */
  async updateMcpServerNode(serverId: string, updates: Record<string, any>): Promise<void> {
    if (this.shouldSkipOperation(`Update MCP server node ${serverId}`)) {
      return;
    }

    await this.executeWithRetry(async (session) => {
      const setClause = Object.keys(updates)
        .map(key => `s.${key} = $${key}`)
        .join(', ');

      await session.run(
        `MATCH (s:MCPServer {id: $serverId})
         SET ${setClause}, s.updatedAt = datetime()
         RETURN s`,
        { serverId, ...updates }
      );
    }, `Update MCP server node ${serverId}`);
  }

  /**
   * Delete MCP Server node from Neo4j
   */
  async deleteMcpServerNode(serverId: string): Promise<void> {
    if (this.shouldSkipOperation(`Delete MCP server node ${serverId}`)) {
      return;
    }

    await this.executeWithRetry(async (session) => {
      await session.run(
        `MATCH (s:MCPServer {id: $serverId})
         DETACH DELETE s`,
        { serverId }
      );
    }, `Delete MCP server node ${serverId}`);
  }

  /**
   * Create MCP Tool Call node and relationships
   */
  async createMcpToolCallNode(toolCallData: {
    id: string;
    serverId: string;
    toolName: string;
    status: string;
    duration?: number;
    agentId?: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (this.shouldSkipOperation(`Create MCP tool call node ${toolCallData.id}`)) {
      return;
    }

    await this.executeWithRetry(async (session) => {
      await session.run(
        `// Create the tool call node
         CREATE (tc:MCPToolCall {
           id: $id,
           toolName: $toolName,
           status: $status,
           duration: $duration,
           timestamp: datetime($timestamp),
           metadata: $metadata
         })
         
         // Link to MCP Server
         WITH tc
         MATCH (s:MCPServer {id: $serverId})
         CREATE (tc)-[:EXECUTED_ON]->(s)
         
         // Link to Agent if provided
         WITH tc
         OPTIONAL MATCH (a:Agent {id: $agentId})
         FOREACH (agent IN CASE WHEN a IS NOT NULL THEN [a] ELSE [] END |
           CREATE (agent)-[:INITIATED]->(tc)
         )
         
         // Link to Tool if it exists
         WITH tc
         OPTIONAL MATCH (t:Tool {name: $toolName})
         FOREACH (tool IN CASE WHEN t IS NOT NULL THEN [t] ELSE [] END |
           CREATE (tc)-[:CALLS]->(tool)
         )
         
         RETURN tc`,
        {
          id: toolCallData.id,
          serverId: toolCallData.serverId,
          toolName: toolCallData.toolName,
          status: toolCallData.status,
          duration: toolCallData.duration || null,
          agentId: toolCallData.agentId || null,
          timestamp: toolCallData.timestamp.toISOString(),
          metadata: toolCallData.metadata || {}
        }
      );
    }, `Create MCP tool call node ${toolCallData.id}`);
  }

  /**
   * Update MCP Tool Call status and metrics
   */
  async updateMcpToolCallNode(toolCallId: string, updates: Record<string, any>): Promise<void> {
    if (this.shouldSkipOperation(`Update MCP tool call node ${toolCallId}`)) {
      return;
    }

    await this.executeWithRetry(async (session) => {
      const setClause = Object.keys(updates)
        .map(key => `tc.${key} = $${key}`)
        .join(', ');

      await session.run(
        `MATCH (tc:MCPToolCall {id: $toolCallId})
         SET ${setClause}, tc.updatedAt = datetime()
         RETURN tc`,
        { toolCallId, ...updates }
      );
    }, `Update MCP tool call node ${toolCallId}`);
  }

  /**
   * Get MCP Server dependencies and impact analysis
   */
  async getMcpServerImpactAnalysis(serverId: string): Promise<{
    dependentTools: string[];
    affectedAgents: string[];
    recentToolCalls: number;
    averageResponseTime: number;
  }> {
    if (this.shouldSkipOperation(`Get MCP server impact ${serverId}`)) {
      return {
        dependentTools: [],
        affectedAgents: [],
        recentToolCalls: 0,
        averageResponseTime: 0
      };
    }

    return await this.executeWithRetry(async (session) => {
      const result = await session.run(
        `MATCH (s:MCPServer {id: $serverId})
         
         // Get tools hosted by this server
         OPTIONAL MATCH (s)<-[:HOSTED_BY]-(t:Tool)
         WITH s, collect(DISTINCT t.id) as dependentTools
         
         // Get agents that use tools on this server
         OPTIONAL MATCH (s)<-[:EXECUTED_ON]-(tc:MCPToolCall)<-[:INITIATED]-(a:Agent)
         WITH s, dependentTools, collect(DISTINCT a.id) as affectedAgents
         
         // Get recent tool call metrics (last 24 hours)
         OPTIONAL MATCH (s)<-[:EXECUTED_ON]-(tc:MCPToolCall)
         WHERE tc.timestamp > datetime() - duration('P1D')
         WITH s, dependentTools, affectedAgents,
              count(tc) as recentToolCalls,
              avg(tc.duration) as averageResponseTime
         
         RETURN dependentTools,
                affectedAgents,
                recentToolCalls,
                averageResponseTime`,
        { serverId }
      );

      const record = result.records[0];
      if (!record) {
        return {
          dependentTools: [],
          affectedAgents: [],
          recentToolCalls: 0,
          averageResponseTime: 0
        };
      }

      return {
        dependentTools: record.get('dependentTools') || [],
        affectedAgents: record.get('affectedAgents') || [],
        recentToolCalls: record.get('recentToolCalls')?.toNumber() || 0,
        averageResponseTime: record.get('averageResponseTime') || 0
      };
    }, `Get MCP server impact ${serverId}`);
  }

  /**
   * Get MCP Tool Call analytics
   */
  async getMcpToolCallAnalytics(serverId?: string, toolName?: string): Promise<{
    totalCalls: number;
    successRate: number;
    averageDuration: number;
    errorPatterns: Array<{ error: string; count: number }>;
  }> {
    if (this.shouldSkipOperation('Get MCP tool call analytics')) {
      return {
        totalCalls: 0,
        successRate: 0,
        averageDuration: 0,
        errorPatterns: []
      };
    }

    return await this.executeWithRetry(async (session) => {
      let query = `MATCH (tc:MCPToolCall)`;
      const params: Record<string, any> = {};

      if (serverId) {
        query += `-[:EXECUTED_ON]->(s:MCPServer {id: $serverId})`;
        params.serverId = serverId;
      }

      if (toolName) {
        query += ` WHERE tc.toolName = $toolName`;
        params.toolName = toolName;
      }

      query += `
        WITH tc
        RETURN count(tc) as totalCalls,
               avg(CASE WHEN tc.status = 'completed' THEN 1.0 ELSE 0.0 END) as successRate,
               avg(tc.duration) as averageDuration,
               collect(CASE WHEN tc.status = 'failed' THEN tc.metadata.error ELSE null END) as errors
      `;

      const result = await session.run(query, params);
      const record = result.records[0];

      if (!record) {
        return {
          totalCalls: 0,
          successRate: 0,
          averageDuration: 0,
          errorPatterns: []
        };
      }

      const errors = record.get('errors').filter((e: any) => e !== null);
      const errorCounts = errors.reduce((acc: Record<string, number>, error: string) => {
        acc[error] = (acc[error] || 0) + 1;
        return acc;
      }, {});

      const errorPatterns = Object.entries(errorCounts)
        .map(([error, count]) => ({ error, count: count as number }))
        .sort((a, b) => b.count - a.count);

      return {
        totalCalls: record.get('totalCalls')?.toNumber() || 0,
        successRate: record.get('successRate') || 0,
        averageDuration: record.get('averageDuration') || 0,
        errorPatterns
      };
    }, 'Get MCP tool call analytics');
  }

  /**
   * Create relationship between Tool and MCP Server
   */
  async linkToolToMcpServer(toolId: string, serverId: string): Promise<void> {
    if (this.shouldSkipOperation(`Link tool ${toolId} to MCP server ${serverId}`)) {
      return;
    }

    await this.executeWithRetry(async (session) => {
      await session.run(
        `MATCH (t:Tool {id: $toolId}), (s:MCPServer {id: $serverId})
         MERGE (t)-[:HOSTED_BY]->(s)
         RETURN t, s`,
        { toolId, serverId }
      );
    }, `Link tool ${toolId} to MCP server ${serverId}`);
  }

  // ===== AGENT INTEGRATION METHODS =====

  /**
   * Create or update Agent node in Neo4j
   */
  async createAgentNode(agentData: {
    id: string;
    name: string;
    role?: string;
    isActive?: boolean;
    capabilities?: string[];
  }): Promise<void> {
    if (this.shouldSkipOperation(`Create agent node ${agentData.id}`)) {
      return;
    }

    await this.executeWithRetry(async (session) => {
      await session.run(
        `MERGE (a:Agent {id: $id})
         SET a.name = $name,
             a.role = $role,
             a.isActive = $isActive,
             a.capabilities = $capabilities,
             a.updatedAt = datetime()
         RETURN a`,
        {
          id: agentData.id,
          name: agentData.name,
          role: agentData.role || 'assistant',
          isActive: agentData.isActive !== false,
          capabilities: agentData.capabilities || []
        }
      );
    }, `Create agent node ${agentData.id}`);
  }

  /**
   * Soft delete Agent node (mark as inactive)
   */
  async deactivateAgentNode(agentId: string): Promise<void> {
    if (this.shouldSkipOperation(`Deactivate agent node ${agentId}`)) {
      return;
    }

    await this.executeWithRetry(async (session) => {
      await session.run(
        `MATCH (a:Agent {id: $id})
         SET a.isActive = false,
             a.deletedAt = datetime()
         RETURN a`,
        { id: agentId }
      );
    }, `Deactivate agent ${agentId}`);
  }
} 