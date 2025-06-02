import { DatabaseService } from './databaseService';
import { logger, ApiError } from '@uaip/utils';
import { 
  Capability, 
  CapabilitySearchQuery, 
  CapabilitySearchResult 
} from '@uaip/types';

export class CapabilityDiscoveryService {
  private databaseService: DatabaseService;
  private neo4jService: any; // Neo4j service for graph queries

  constructor(databaseService?: DatabaseService) {
    this.databaseService = databaseService || new DatabaseService();
    // this.neo4jService = new Neo4jService(); // Will implement when needed
  }

  public async searchCapabilities(query: CapabilitySearchQuery): Promise<Capability[]> {
    try {
      logger.info('Searching capabilities', { query: query.query, type: query.type });

      const startTime = Date.now();

      // Build SQL query for PostgreSQL capabilities table
      let sqlQuery = `
        SELECT 
          id, name, description, type, status, metadata, 
          tool_config, artifact_config, dependencies, 
          security_requirements, resource_requirements,
          created_at, updated_at
        FROM capabilities 
        WHERE status = 'active'
      `;
      
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Add text search
      if (query.query) {
        sqlQuery += ` AND (
          name ILIKE $${paramIndex} OR 
          description ILIKE $${paramIndex} OR 
          metadata->>'tags' ILIKE $${paramIndex}
        )`;
        queryParams.push(`%${query.query}%`);
        paramIndex++;
      }

      // Filter by type
      if (query.type) {
        sqlQuery += ` AND type = $${paramIndex}`;
        queryParams.push(query.type);
        paramIndex++;
      }

      // Apply security context filtering
      if (query.securityContext) {
        const securityLevel = query.securityContext.securityLevel || 'medium';
        sqlQuery += ` AND security_requirements->>'maxLevel' >= $${paramIndex}`;
        queryParams.push(securityLevel);
        paramIndex++;
      }

      // Limit results
      const limit = Math.min(query.limit || 20, 100);
      sqlQuery += ` ORDER BY 
        CASE 
          WHEN name ILIKE $${paramIndex} THEN 1
          WHEN description ILIKE $${paramIndex} THEN 2
          ELSE 3
        END,
        created_at DESC
        LIMIT $${paramIndex + 1}`;
      queryParams.push(`%${query.query}%`, limit);

      const result = await this.databaseService.query(sqlQuery, queryParams);
      
      const capabilities = result.rows.map(row => this.mapCapabilityFromDB(row));

      // If we have agent context, rank capabilities by relevance
      if (query.agentContext) {
        return this.rankCapabilitiesByRelevance(capabilities, query);
      }

      const searchTime = Date.now() - startTime;
      logger.info('Capability search completed', { 
        resultCount: capabilities.length, 
        searchTime,
        query: query.query 
      });

      return capabilities;
    } catch (error: any) {
      logger.error('Error searching capabilities', { query, error: error.message });
      throw new ApiError(500, 'Failed to search capabilities', 'SEARCH_ERROR');
    }
  }

  public async getAgentCapabilities(agentId: string): Promise<Capability[]> {
    try {
      logger.info('Getting agent capabilities', { agentId });

      // Get agent's configured capabilities from PostgreSQL
      const agentQuery = `
        SELECT intelligence_config, security_context 
        FROM agents 
        WHERE id = $1 AND is_active = true
      `;
      
      const agentResult = await this.databaseService.query(agentQuery, [agentId]);
      
      if (agentResult.rows.length === 0) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      const agent = agentResult.rows[0];
      const configuredCapabilities = agent.intelligence_config?.capabilities || {};
      
      // Get capabilities from database
      const capabilityIds = [
        ...(configuredCapabilities.tools || []),
        ...(configuredCapabilities.artifacts || []),
        ...(configuredCapabilities.hybrid || [])
      ];

      if (capabilityIds.length === 0) {
        return [];
      }

      const capabilityQuery = `
        SELECT 
          id, name, description, type, status, metadata, 
          tool_config, artifact_config, dependencies, 
          security_requirements, resource_requirements,
          created_at, updated_at
        FROM capabilities 
        WHERE id = ANY($1) AND status = 'active'
        ORDER BY type, name
      `;

      const capabilityResult = await this.databaseService.query(capabilityQuery, [capabilityIds]);
      
      return capabilityResult.rows.map(row => this.mapCapabilityFromDB(row));
    } catch (error: any) {
      logger.error('Error getting agent capabilities', { agentId, error: error.message });
      throw error;
    }
  }

  public async getCapabilityById(capabilityId: string): Promise<Capability | null> {
    try {
      const query = `
        SELECT 
          id, name, description, type, status, metadata, 
          tool_config, artifact_config, dependencies, 
          security_requirements, resource_requirements,
          created_at, updated_at
        FROM capabilities 
        WHERE id = $1
      `;

      const result = await this.databaseService.query(query, [capabilityId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapCapabilityFromDB(result.rows[0]);
    } catch (error: any) {
      logger.error('Error getting capability by ID', { capabilityId, error: error.message });
      throw new ApiError(500, 'Failed to retrieve capability', 'DATABASE_ERROR');
    }
  }

  public async getCapabilityDependencies(capabilityId: string): Promise<{
    dependencies: Capability[];
    dependents: Capability[];
  }> {
    try {
      logger.info('Getting capability dependencies', { capabilityId });

      // Get the capability first
      const capability = await this.getCapabilityById(capabilityId);
      if (!capability) {
        throw new ApiError(404, 'Capability not found', 'CAPABILITY_NOT_FOUND');
      }

      // Get direct dependencies
      const dependencies: Capability[] = [];
      if (capability.dependencies && capability.dependencies.length > 0) {
        const depQuery = `
          SELECT 
            id, name, description, type, status, metadata, 
            security_requirements, dependencies
          FROM capabilities 
          WHERE id = ANY($1) AND status = 'active'
        `;
        
        const depResult = await this.databaseService.query(depQuery, [capability.dependencies]);
        dependencies.push(...depResult.rows.map(row => this.mapCapabilityFromDB(row)));
      }

      // Get dependents (capabilities that depend on this one)
      const dependentsQuery = `
        SELECT 
          id, name, description, type, status, metadata, 
          security_requirements, dependencies
        FROM capabilities 
        WHERE $1 = ANY(dependencies) AND status = 'active'
      `;
      
      const dependentsResult = await this.databaseService.query(dependentsQuery, [capabilityId]);
      const dependents = dependentsResult.rows.map(row => this.mapCapabilityFromDB(row));

      return { dependencies, dependents };
    } catch (error: any) {
      logger.error('Error getting capability dependencies', { capabilityId, error: error.message });
      throw error;
    }
  }

  public async discoverCapabilitiesByIntent(
    intent: string, 
    context: any,
    securityContext: any
  ): Promise<Capability[]> {
    try {
      logger.info('Discovering capabilities by intent', { intent });

      // Map intents to capability types
      const intentMapping: Record<string, string[]> = {
        'create': ['artifact', 'hybrid'],
        'analyze': ['tool', 'hybrid'],
        'modify': ['hybrid', 'tool'],
        'deploy': ['tool'],
        'monitor': ['tool'],
        'generate': ['artifact'],
        'query': ['tool']
      };

      const relevantTypes = intentMapping[intent] || ['tool', 'artifact', 'hybrid'];
      
      // Search for capabilities matching the intent
      const searchResults = await this.searchCapabilities({
        query: intent,
        type: undefined, // Search all types first
        agentContext: context,
        securityContext,
        limit: 50
      });

      // Filter by relevant types and rank by intent relevance
      return searchResults
        .filter(cap => cap.type && relevantTypes.includes(cap.type))
        .sort((a, b) => this.calculateIntentRelevance(b, intent) - this.calculateIntentRelevance(a, intent))
        .slice(0, 10);
        
    } catch (error: any) {
      logger.error('Error discovering capabilities by intent', { intent, error: error.message });
      throw new ApiError(500, 'Failed to discover capabilities', 'DISCOVERY_ERROR');
    }
  }

  // Private helper methods

  private mapCapabilityFromDB(row: any): Capability {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      status: row.status,
      metadata: row.metadata || {},
      toolConfig: row.tool_config || undefined,
      artifactConfig: row.artifact_config || undefined,
      dependencies: row.dependencies || [],
      securityRequirements: this.parseSecurityRequirements(row.security_requirements),
      resourceRequirements: row.resource_requirements || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private parseSecurityRequirements(requirements: any): {
    minimumSecurityLevel: 'low' | 'medium' | 'high' | 'critical';
    requiredPermissions: string[];
    sensitiveData: boolean;
    auditRequired: boolean;
  } {
    if (!requirements) {
      return {
        minimumSecurityLevel: 'medium',
        requiredPermissions: [],
        sensitiveData: false,
        auditRequired: false
      };
    }
    
    if (typeof requirements === 'string') {
      try {
        const parsed = JSON.parse(requirements);
        return {
          minimumSecurityLevel: parsed.minimumSecurityLevel || 'medium',
          requiredPermissions: Array.isArray(parsed.requiredPermissions) ? parsed.requiredPermissions : [],
          sensitiveData: Boolean(parsed.sensitiveData),
          auditRequired: Boolean(parsed.auditRequired)
        };
      } catch {
        return {
          minimumSecurityLevel: 'medium',
          requiredPermissions: [],
          sensitiveData: false,
          auditRequired: false
        };
      }
    }
    
    if (typeof requirements === 'object') {
      return {
        minimumSecurityLevel: requirements.minimumSecurityLevel || 'medium',
        requiredPermissions: Array.isArray(requirements.requiredPermissions) ? requirements.requiredPermissions : [],
        sensitiveData: Boolean(requirements.sensitiveData),
        auditRequired: Boolean(requirements.auditRequired)
      };
    }
    
    return {
      minimumSecurityLevel: 'medium',
      requiredPermissions: [],
      sensitiveData: false,
      auditRequired: false
    };
  }

  private rankCapabilitiesByRelevance(
    capabilities: Capability[], 
    query: CapabilitySearchQuery
  ): Capability[] {
    return capabilities
      .map(cap => ({
        capability: cap,
        score: this.calculateRelevanceScore(cap, query)
      }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.capability);
  }

  private calculateRelevanceScore(capability: Capability, query: CapabilitySearchQuery): number {
    let score = 0;

    // Exact name match
    if (capability.name && query.query && capability.name.toLowerCase().includes(query.query.toLowerCase())) {
      score += 10;
    }

    // Description match
    if (capability.description && query.query && capability.description.toLowerCase().includes(query.query.toLowerCase())) {
      score += 5;
    }

    // Type preference
    if (query.type && capability.type === query.type) {
      score += 7;
    }

    // Agent context relevance
    if (query.agentContext) {
      const agentSpecializations = query.agentContext.specializations || [];
      const capabilityTags = capability.metadata?.tags || [];
      
      const commonTags = agentSpecializations.filter((spec: string) => 
        capabilityTags.some((tag: string) => tag.toLowerCase().includes(spec.toLowerCase()))
      );
      
      score += commonTags.length * 3;
    }

    // Status preference (active capabilities get higher scores)
    if (capability.status === 'active') {
      score += 2;
    }

    return score;
  }

  private calculateIntentRelevance(capability: Capability, intent: string): number {
    let score = 0;

    // Direct name/description matching
    const name = capability.name || '';
    const description = capability.description || '';
    const text = `${name} ${description}`.toLowerCase();
    if (text.includes(intent.toLowerCase())) {
      score += 10;
    }

    // Tag matching
    const tags = capability.metadata?.tags || [];
    if (tags.some((tag: string) => tag.toLowerCase().includes(intent.toLowerCase()))) {
      score += 7;
    }

    // Type-based scoring
    const typeScores: Record<string, Record<string, number>> = {
      'create': { 'artifact': 8, 'hybrid': 6, 'tool': 2 },
      'analyze': { 'tool': 8, 'hybrid': 6, 'artifact': 2 },
      'modify': { 'hybrid': 8, 'tool': 5, 'artifact': 3 },
      'generate': { 'artifact': 10, 'hybrid': 4, 'tool': 1 }
    };

    if (capability.type && typeScores[intent] && typeScores[intent][capability.type]) {
      score += typeScores[intent][capability.type];
    }

    return score;
  }

  public async searchCapabilitiesAdvanced(searchParams: {
    query?: string;
    types?: string[];
    tags?: string[];
    securityLevel?: string;
    agentId?: string;
    includeExperimental?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<CapabilitySearchResult> {
    try {
      const startTime = Date.now();
      
      let sqlQuery = `
        SELECT 
          id, name, description, type, status, metadata, 
          tool_config, artifact_config, dependencies, 
          security_requirements, resource_requirements,
          created_at, updated_at
        FROM capabilities 
        WHERE 1=1
      `;
      
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Status filter
      if (!searchParams.includeExperimental) {
        sqlQuery += ` AND status IN ('active', 'deprecated')`;
      } else {
        sqlQuery += ` AND status != 'disabled'`;
      }

      // Text search
      if (searchParams.query) {
        sqlQuery += ` AND (
          name ILIKE $${paramIndex} OR 
          description ILIKE $${paramIndex} OR 
          metadata->>'tags' ILIKE $${paramIndex}
        )`;
        queryParams.push(`%${searchParams.query}%`);
        paramIndex++;
      }

      // Type filter
      if (searchParams.types && searchParams.types.length > 0) {
        sqlQuery += ` AND type = ANY($${paramIndex})`;
        queryParams.push(searchParams.types);
        paramIndex++;
      }

      // Security level filter
      if (searchParams.securityLevel) {
        sqlQuery += ` AND security_requirements->>'maxLevel' >= $${paramIndex}`;
        queryParams.push(searchParams.securityLevel);
        paramIndex++;
      }

      // Tag filter
      if (searchParams.tags && searchParams.tags.length > 0) {
        const tagConditions = searchParams.tags.map(() => {
          const condition = `metadata->'tags' ? $${paramIndex}`;
          paramIndex++;
          return condition;
        }).join(' OR ');
        
        sqlQuery += ` AND (${tagConditions})`;
        queryParams.push(...searchParams.tags);
      }

      // Count total results
      const countQuery = sqlQuery.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
      const countResult = await this.databaseService.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Add ordering and pagination
      sqlQuery += ` ORDER BY 
        CASE 
          WHEN status = 'active' THEN 1
          WHEN status = 'experimental' THEN 2
          ELSE 3
        END,
        created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      
      const limit = Math.min(searchParams.limit || 20, 100);
      const offset = searchParams.offset || 0;
      queryParams.push(limit, offset);

      const result = await this.databaseService.query(sqlQuery, queryParams);
      const capabilities = result.rows.map(row => this.mapCapabilityFromDB(row));

      const searchTime = Date.now() - startTime;

      return {
        capabilities,
        totalCount,
        recommendations: this.generateRecommendations(capabilities, searchParams),
        searchTime
      };
    } catch (error: any) {
      logger.error('Error in advanced capability search', { searchParams, error: error.message });
      throw new ApiError(500, 'Failed to search capabilities', 'SEARCH_ERROR');
    }
  }

  private generateRecommendations(capabilities: Capability[], searchParams: any): string[] {
    const recommendations: string[] = [];

    if (capabilities.length === 0) {
      recommendations.push('No capabilities found. Try broadening your search criteria.');
      if (searchParams.securityLevel) {
        recommendations.push('Consider lowering the security level requirement.');
      }
    } else if (capabilities.length < 5) {
      recommendations.push('Consider using broader search terms for more results.');
      if (searchParams.types) {
        recommendations.push('Try searching across all capability types.');
      }
    }

    // Check for related capabilities
    const types = Array.from(new Set(capabilities.map(c => c.type)));
    if (types.length === 1 && types[0] === 'tool') {
      recommendations.push('Consider hybrid capabilities for more comprehensive solutions.');
    }

    return recommendations;
  }
}