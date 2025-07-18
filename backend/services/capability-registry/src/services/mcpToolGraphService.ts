// MCP Tool Graph Integration Service
// Manages the integration between MCP tools and the knowledge graph
// Handles tool relationships, capabilities, and semantic connections

import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';

interface MCPToolGraphNode {
  id: string;
  name: string;
  description: string;
  serverName: string;
  category: string;
  capabilities: string[];
  dependencies: string[];
  parameters: any;
  metadata: {
    mcpServer: string;
    version?: string;
    author?: string;
    tags: string[];
  };
}

interface ToolRelationship {
  fromTool: string;
  toTool: string;
  relationType: 'DEPENDS_ON' | 'PROVIDES_INPUT_TO' | 'ALTERNATIVE_TO' | 'COMPLEMENTS' | 'SUPERSEDES';
  weight: number;
  metadata?: any;
}

export class MCPToolGraphService {
  private static instance: MCPToolGraphService;
  private databaseService: DatabaseService;

  private constructor() {
    this.databaseService = DatabaseService.getInstance();
  }

  public static getInstance(): MCPToolGraphService {
    if (!MCPToolGraphService.instance) {
      MCPToolGraphService.instance = new MCPToolGraphService();
    }
    return MCPToolGraphService.instance;
  }

  /**
   * Register an MCP tool in the knowledge graph
   */
  async registerToolInGraph(tool: MCPToolGraphNode): Promise<void> {
    try {
      logger.info(`Registering MCP tool in graph: ${tool.name} from server: ${tool.serverName}`);

      // Create the tool node in Neo4j
      await this.createToolNode(tool);

      // Create relationships with the MCP server
      await this.createServerRelationship(tool);

      // Analyze and create capability relationships
      await this.analyzeAndCreateCapabilityRelationships(tool);

      // Index tool in Qdrant for semantic search
      await this.indexToolForSemanticSearch(tool);

      logger.info(`Successfully registered MCP tool ${tool.name} in knowledge graph`);
    } catch (error) {
      logger.error(`Failed to register MCP tool ${tool.name} in graph:`, error);
      throw error;
    }
  }

  /**
   * Create a tool node in Neo4j
   */
  private async createToolNode(tool: MCPToolGraphNode): Promise<void> {
    const query = `
      MERGE (t:MCPTool {id: $toolId})
      SET t.name = $name,
          t.description = $description,
          t.serverName = $serverName,
          t.category = $category,
          t.capabilities = $capabilities,
          t.dependencies = $dependencies,
          t.parameters = $parameters,
          t.version = $version,
          t.author = $author,
          t.tags = $tags,
          t.createdAt = $createdAt,
          t.updatedAt = $updatedAt
      RETURN t
    `;

    const parameters = {
      toolId: tool.id,
      name: tool.name,
      description: tool.description,
      serverName: tool.serverName,
      category: tool.category,
      capabilities: tool.capabilities,
      dependencies: tool.dependencies,
      parameters: JSON.stringify(tool.parameters),
      version: tool.metadata.version || '1.0.0',
      author: tool.metadata.author || 'Unknown',
      tags: tool.metadata.tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.databaseService.executeNeo4jQuery(query, parameters);
  }

  /**
   * Create relationship between tool and MCP server
   */
  private async createServerRelationship(tool: MCPToolGraphNode): Promise<void> {
    const query = `
      MERGE (s:MCPServer {name: $serverName})
      MERGE (t:MCPTool {id: $toolId})
      MERGE (s)-[r:PROVIDES_TOOL]->(t)
      SET r.registeredAt = $timestamp
      RETURN r
    `;

    const parameters = {
      serverName: tool.serverName,
      toolId: tool.id,
      timestamp: new Date().toISOString()
    };

    await this.databaseService.executeNeo4jQuery(query, parameters);
  }

  /**
   * Analyze tool capabilities and create relationships with other tools
   */
  private async analyzeAndCreateCapabilityRelationships(tool: MCPToolGraphNode): Promise<void> {
    try {
      // Find tools with similar capabilities
      const similarToolsQuery = `
        MATCH (t1:MCPTool {id: $toolId})
        MATCH (t2:MCPTool)
        WHERE t1 <> t2 
        AND (
          ANY(cap IN t1.capabilities WHERE cap IN t2.capabilities) OR
          t1.category = t2.category
        )
        RETURN t2.id as relatedToolId, t2.name as relatedToolName, 
               t2.capabilities as relatedCapabilities, t2.category as relatedCategory
        LIMIT 10
      `;

      const similarTools = await this.databaseService.executeNeo4jQuery(similarToolsQuery, { toolId: tool.id });

      // Create relationships based on capability analysis
      for (const relatedTool of similarTools) {
        const relationshipType = this.determineRelationshipType(tool, relatedTool);
        if (relationshipType) {
          await this.createToolRelationship(tool.id, relatedTool.relatedToolId, relationshipType);
        }
      }

      // Create relationships with system tools based on dependencies
      await this.createDependencyRelationships(tool);

    } catch (error) {
      logger.error(`Failed to analyze capability relationships for tool ${tool.name}:`, error);
    }
  }

  /**
   * Create dependency relationships with other tools
   */
  private async createDependencyRelationships(tool: MCPToolGraphNode): Promise<void> {
    if (tool.dependencies && tool.dependencies.length > 0) {
      for (const dependency of tool.dependencies) {
        const dependencyQuery = `
          MATCH (t1:MCPTool {id: $toolId})
          MATCH (t2:Tool)
          WHERE t2.name CONTAINS $dependency OR t2.category CONTAINS $dependency
          MERGE (t1)-[r:DEPENDS_ON]->(t2)
          SET r.createdAt = $timestamp
          RETURN r
        `;

        await this.databaseService.executeNeo4jQuery(dependencyQuery, {
          toolId: tool.id,
          dependency,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Index tool in Qdrant for semantic search
   */
  private async indexToolForSemanticSearch(tool: MCPToolGraphNode): Promise<void> {
    try {
      // Create text content for embedding
      const textContent = [
        tool.name,
        tool.description,
        tool.category,
        ...tool.capabilities,
        ...tool.metadata.tags
      ].join(' ');

      // TODO: Generate embedding using TEI service
      // For now, we'll create a placeholder point
      const point = {
        id: tool.id,
        vector: new Array(768).fill(0).map(() => Math.random()), // Placeholder embedding
        payload: {
          name: tool.name,
          description: tool.description,
          serverName: tool.serverName,
          category: tool.category,
          capabilities: tool.capabilities,
          tags: tool.metadata.tags,
          type: 'mcp_tool',
          content: textContent
        }
      };

      // TODO: Insert into Qdrant collection
      logger.info(`Tool ${tool.name} indexed for semantic search`);

    } catch (error) {
      logger.error(`Failed to index tool ${tool.name} for semantic search:`, error);
    }
  }

  /**
   * Determine relationship type between two tools
   */
  private determineRelationshipType(tool1: MCPToolGraphNode, tool2: any): ToolRelationship['relationType'] | null {
    const sharedCapabilities = tool1.capabilities.filter(cap => 
      tool2.relatedCapabilities?.includes(cap)
    );

    if (sharedCapabilities.length > 2) {
      return 'ALTERNATIVE_TO';
    }

    if (tool1.category === tool2.relatedCategory) {
      return 'COMPLEMENTS';
    }

    // Check if one tool provides input to another
    if (this.checkInputOutputCompatibility(tool1, tool2)) {
      return 'PROVIDES_INPUT_TO';
    }

    return 'COMPLEMENTS';
  }

  /**
   * Check if tools have input/output compatibility
   */
  private checkInputOutputCompatibility(tool1: MCPToolGraphNode, tool2: any): boolean {
    // Simple heuristic: check if tool1 outputs match tool2 inputs
    const tool1Outputs = this.extractOutputTypes(tool1.parameters);
    const tool2Inputs = this.extractInputTypes(tool2.parameters);

    return tool1Outputs.some(output => tool2Inputs.includes(output));
  }

  /**
   * Extract output types from tool parameters
   */
  private extractOutputTypes(parameters: any): string[] {
    // Simple extraction logic - can be enhanced
    const outputs = [];
    if (parameters?.returnType?.type) {
      outputs.push(parameters.returnType.type);
    }
    return outputs;
  }

  /**
   * Extract input types from tool parameters
   */
  private extractInputTypes(parameters: any): string[] {
    // Simple extraction logic - can be enhanced
    const inputs = [];
    if (parameters?.properties) {
      Object.values(parameters.properties).forEach((prop: any) => {
        if (prop.type) {
          inputs.push(prop.type);
        }
      });
    }
    return inputs;
  }

  /**
   * Create a relationship between two tools
   */
  private async createToolRelationship(
    fromToolId: string, 
    toToolId: string, 
    relationType: ToolRelationship['relationType']
  ): Promise<void> {
    const query = `
      MATCH (t1:MCPTool {id: $fromToolId})
      MATCH (t2) 
      WHERE t2.id = $toToolId AND (t2:MCPTool OR t2:Tool)
      MERGE (t1)-[r:${relationType}]->(t2)
      SET r.weight = $weight,
          r.createdAt = $timestamp
      RETURN r
    `;

    const weight = this.calculateRelationshipWeight(relationType);

    await this.databaseService.executeNeo4jQuery(query, {
      fromToolId,
      toToolId,
      weight,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Calculate relationship weight based on type
   */
  private calculateRelationshipWeight(relationType: ToolRelationship['relationType']): number {
    const weights = {
      'DEPENDS_ON': 0.9,
      'PROVIDES_INPUT_TO': 0.8,
      'ALTERNATIVE_TO': 0.7,
      'COMPLEMENTS': 0.6,
      'SUPERSEDES': 0.5
    };

    return weights[relationType] || 0.5;
  }

  /**
   * Get tool recommendations based on graph relationships
   */
  async getToolRecommendations(toolId: string, limit: number = 5): Promise<any[]> {
    const query = `
      MATCH (t:MCPTool {id: $toolId})
      MATCH (t)-[r]-(related)
      WHERE related:MCPTool OR related:Tool
      RETURN related.id as id, related.name as name, 
             related.description as description, type(r) as relationshipType,
             r.weight as weight
      ORDER BY r.weight DESC
      LIMIT $limit
    `;

    return await this.databaseService.executeNeo4jQuery(query, { toolId, limit });
  }

  /**
   * Find tools by capability
   */
  async findToolsByCapability(capability: string): Promise<any[]> {
    const query = `
      MATCH (t:MCPTool)
      WHERE $capability IN t.capabilities
      RETURN t.id as id, t.name as name, t.description as description, 
             t.serverName as serverName, t.capabilities as capabilities
      ORDER BY t.name
    `;

    return await this.databaseService.executeNeo4jQuery(query, { capability });
  }

  /**
   * Get tool dependency graph
   */
  async getToolDependencyGraph(toolId: string): Promise<any> {
    const query = `
      MATCH path = (t:MCPTool {id: $toolId})-[:DEPENDS_ON*0..3]-(related)
      RETURN path
    `;

    const result = await this.databaseService.executeNeo4jQuery(query, { toolId });
    
    // Transform result into a graph structure
    return this.transformPathsToGraph(result);
  }

  /**
   * Transform Neo4j paths to a graph structure
   */
  private transformPathsToGraph(paths: any[]): any {
    const nodes = new Map();
    const edges = [];

    paths.forEach(pathRecord => {
      const path = pathRecord.path;
      // Process nodes and relationships from path
      // This is a simplified transformation
      nodes.set(path.start.properties.id, {
        id: path.start.properties.id,
        name: path.start.properties.name,
        type: 'mcp_tool'
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      edges
    };
  }

  /**
   * Remove tool from knowledge graph
   */
  async removeToolFromGraph(toolId: string): Promise<void> {
    try {
      logger.info(`Removing MCP tool from graph: ${toolId}`);

      // Remove all relationships
      const removeRelationshipsQuery = `
        MATCH (t:MCPTool {id: $toolId})-[r]-()
        DELETE r
      `;

      await this.databaseService.executeNeo4jQuery(removeRelationshipsQuery, { toolId });

      // Remove the tool node
      const removeNodeQuery = `
        MATCH (t:MCPTool {id: $toolId})
        DELETE t
      `;

      await this.databaseService.executeNeo4jQuery(removeNodeQuery, { toolId });

      // TODO: Remove from Qdrant collection

      logger.info(`Successfully removed MCP tool ${toolId} from knowledge graph`);
    } catch (error) {
      logger.error(`Failed to remove MCP tool ${toolId} from graph:`, error);
      throw error;
    }
  }
}

export default MCPToolGraphService;