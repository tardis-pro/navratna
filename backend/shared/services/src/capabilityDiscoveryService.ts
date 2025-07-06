import { DatabaseService } from './databaseService.js';
import { logger, ApiError } from '@uaip/utils';
import {
  Capability,
  CapabilitySearchQuery,
  CapabilitySearchResult
} from '@uaip/types';

export class CapabilityDiscoveryService {
  private databaseService: DatabaseService;
  private neo4jService: any; // Neo4j service for graph queries
  private isInitialized: boolean = false;

  constructor(databaseService?: DatabaseService) {
    this.databaseService = databaseService || new DatabaseService();
    // this.neo4jService = new Neo4jService(); // Will implement when needed
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.databaseService.initialize();
      this.isInitialized = true;
    }
  }

  public async searchCapabilities(query: CapabilitySearchQuery): Promise<Capability[]> {
    await this.ensureInitialized();

    try {
      logger.info('Searching capabilities', { query: query.query, type: query.type });

      const startTime = Date.now();

      // Use DatabaseService searchCapabilities method instead of raw SQL
      const searchFilters = {
        query: query.query,
        type: query.type,
        securityLevel: query.securityContext?.securityLevel,
        limit: query.limit
      };

      const repo = this.databaseService.agents.getCapabilityRepository();
      const result = await repo.searchCapabilities(searchFilters);
      const capabilities = result.map(row => this.mapCapabilityFromDB(row));

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
    await this.ensureInitialized();

    try {
      logger.info('Getting agent capabilities', { agentId });

      // Get agent configuration through domain service
      const agentConfig = await this.databaseService.agents.findAgentById(agentId);

      if (!agentConfig) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      const configuredCapabilities = (agentConfig.metadata?.intelligenceConfig as any)?.capabilities || (agentConfig.intelligenceConfig as any)?.capabilities || {};

      // Get capabilities from database
      const capabilityIds = [
        ...(configuredCapabilities.tools || []),
        ...(configuredCapabilities.artifacts || []),
        ...(configuredCapabilities.hybrid || [])
      ];

      if (capabilityIds.length === 0) {
        return [];
      }

      // Get capabilities through domain service
      const repo = this.databaseService.agents.getCapabilityRepository();
      const capabilityResult = await repo.getCapabilitiesByIds(capabilityIds);

      return capabilityResult.map(row => this.mapCapabilityFromDB(row));
    } catch (error: any) {
      logger.error('Error getting agent capabilities', { agentId, error: error.message });
      throw error;
    }
  }

  public async getCapabilityById(capabilityId: string): Promise<Capability | null> {
    await this.ensureInitialized();

    try {
      // Get capability through domain service
      const repo = this.databaseService.agents.getCapabilityRepository();
      const result = await repo.getCapabilityById(capabilityId);

      if (!result) {
        return null;
      }

      return this.mapCapabilityFromDB(result);
    } catch (error: any) {
      logger.error('Error getting capability by ID', { capabilityId, error: error.message });
      throw new ApiError(500, 'Failed to retrieve capability', 'DATABASE_ERROR');
    }
  }

  public async getCapabilityDependencies(capabilityId: string): Promise<{
    dependencies: Capability[];
    dependents: Capability[];
  }> {
    await this.ensureInitialized();

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
        // Get dependencies through domain service
        const repo = this.databaseService.agents.getCapabilityRepository();
        const depResult = await repo.getCapabilityDependencies(capability.dependencies);
        dependencies.push(...depResult.map(row => this.mapCapabilityFromDB(row)));
      }

      // Get dependents (capabilities that depend on this one)
      const repo2 = this.databaseService.agents.getCapabilityRepository();
      const dependentsResult = await repo2.getCapabilityDependents(capabilityId);
      const dependents = dependentsResult.map(row => this.mapCapabilityFromDB(row));

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
    await this.ensureInitialized();

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

  public async assignCapabilityToAgent(
    agentId: string,
    capabilityId: string,
    options?: {
      permissions?: string[];
      category?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      logger.info('Assigning capability to agent', { agentId, capabilityId, options });

      // Assign capability through domain service
      await this.databaseService.agents.assignCapabilityToAgent(agentId, capabilityId);

      logger.info('Capability assigned to agent successfully', { agentId, capabilityId });
    } catch (error: any) {
      logger.error('Failed to assign capability to agent', { agentId, capabilityId, error: error.message });
      throw new ApiError(500, 'Failed to assign capability', 'ASSIGNMENT_ERROR');
    }
  }

  public async executeTool(
    toolId: string,
    parameters: any,
    context?: {
      agentId?: string;
      userId?: string;
      context?: string;
      timestamp?: string;
    }
  ): Promise<any> {
    await this.ensureInitialized();

    try {
      logger.info('Executing tool', { toolId, context });

      // Get the tool/capability
      const capability = await this.getCapabilityById(toolId);
      if (!capability) {
        throw new ApiError(404, 'Tool not found', 'TOOL_NOT_FOUND');
      }

      // Execute through tool service
      const result = await this.databaseService.tools.createExecution({
        toolId,
        input: parameters,
        context,
        agentId: context?.agentId,
        userId: context?.userId
      });

      logger.info('Tool executed successfully', { toolId, result });
      return result;
    } catch (error: any) {
      logger.error('Failed to execute tool', { toolId, error: error.message });
      throw new ApiError(500, 'Tool execution failed', 'EXECUTION_ERROR');
    }
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

      // Use capability repository for advanced search
      const repo = this.databaseService.agents.getCapabilityRepository();
      const result = await repo.searchCapabilitiesAdvanced(searchParams);
      const capabilities = result.capabilities.map(row => this.mapCapabilityFromDB(row));

      const searchTime = Date.now() - startTime;

      return {
        capabilities,
        totalCount: result.totalCount,
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