/**
 * Unified Tool Registry Service
 * Consolidates all tool management functionality to eliminate duplication
 * Combines features from toolRegistry.ts and enterprise-tool-registry.ts
 */

import { ToolDefinition, ToolUsageRecord, ToolCategory, SecurityLevel, ToolExample } from '@uaip/types';
import { DatabaseService, EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { z } from 'zod';

// Enhanced tool definition that combines both standard and enterprise features
export interface UnifiedToolDefinition extends ToolDefinition {
  // Enterprise features
  vendor?: string;
  operations?: ToolOperation[];
  authentication?: ToolAuthentication;
  rateLimit?: RateLimitConfig;
  sandboxing?: SandboxConfig;
  compliance?: ComplianceConfig;
  
  // Graph features
  relationships?: ToolRelationship[];
  recommendations?: ToolRecommendation[];
  
  // Project integration
  projectContext?: ProjectContext[];
  workflowTemplates?: WorkflowTemplate[];
  
  // Additional metadata for tool analysis
  metadata?: {
    usageCount?: number;
    successRate?: number;
    averageExecutionTime?: number;
    lastUsedAt?: Date;
    [key: string]: any;
  };
}

export interface ToolOperation {
  id: string;
  name: string;
  description: string;
  requiredPermissions: string[];
  inputSchema: any;
  outputSchema: any;
  securityLevel: number;
  auditLevel: 'comprehensive' | 'standard' | 'minimal';
}

export interface ToolAuthentication {
  type: 'oauth2' | 'api_key' | 'basic' | 'jwt' | 'saml';
  config: any;
  scopes?: string[];
  tokenEndpoint?: string;
  refreshable?: boolean;
}

export interface RateLimitConfig {
  requests: number;
  window: number;
  burstAllowance?: number;
  perUser?: boolean;
}

export interface SandboxConfig {
  enabled: boolean;
  timeoutMs: number;
  memoryLimitMB: number;
  networkAccess: boolean;
  fileSystemAccess: 'none' | 'read' | 'write';
  allowedDomains?: string[];
}

export interface ComplianceConfig {
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  retentionPolicyDays?: number;
  encryptionRequired: boolean;
  auditRequired: boolean;
  approvalRequired: boolean;
  allowedRegions?: string[];
}

export interface ToolRelationship {
  type: 'DEPENDS_ON' | 'SIMILAR_TO' | 'REPLACES' | 'ENHANCES' | 'REQUIRES';
  targetToolId: string;
  strength: number;
  reason?: string;
  metadata?: any;
}

export interface ToolRecommendation {
  toolId: string;
  score: number;
  reason: string;
  context: string;
}

export interface ProjectContext {
  projectId: string;
  usageCount: number;
  lastUsed: Date;
  effectiveness: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  toolId: string;
  operation: string;
  parameters: any;
  conditions?: any;
}

// Validation schemas
const UnifiedToolDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().min(1),
  category: z.string().min(1),
  vendor: z.string().optional(),
  parameters: z.object({}).passthrough(),
  returnType: z.object({}).passthrough().optional(),
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']),
  requiresApproval: z.boolean(),
  isEnabled: z.boolean(),
  executionTimeEstimate: z.number().positive().optional(),
  costEstimate: z.number().min(0).optional(),
  author: z.string(),
  tags: z.array(z.string()),
  dependencies: z.array(z.string()),
  examples: z.array(z.object({
    name: z.string(),
    description: z.string(),
    input: z.record(z.any()),
    expectedOutput: z.any(),
    notes: z.string().optional()
  })).default([]),
  
  // Enterprise fields
  operations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    requiredPermissions: z.array(z.string()),
    inputSchema: z.any(),
    outputSchema: z.any(),
    securityLevel: z.number(),
    auditLevel: z.enum(['comprehensive', 'standard', 'minimal'])
  })).optional(),
  
  authentication: z.object({
    type: z.enum(['oauth2', 'api_key', 'basic', 'jwt', 'saml']),
    config: z.any(),
    scopes: z.array(z.string()).optional(),
    tokenEndpoint: z.string().optional(),
    refreshable: z.boolean().optional()
  }).optional(),
  
  rateLimit: z.object({
    requests: z.number(),
    window: z.number(),
    burstAllowance: z.number().optional(),
    perUser: z.boolean().optional()
  }).optional(),
  
  sandboxing: z.object({
    enabled: z.boolean(),
    timeoutMs: z.number(),
    memoryLimitMB: z.number(),
    networkAccess: z.boolean(),
    fileSystemAccess: z.enum(['none', 'read', 'write']),
    allowedDomains: z.array(z.string()).optional()
  }).optional(),
  
  compliance: z.object({
    dataClassification: z.enum(['public', 'internal', 'confidential', 'restricted']),
    retentionPolicyDays: z.number().optional(),
    encryptionRequired: z.boolean(),
    auditRequired: z.boolean(),
    approvalRequired: z.boolean(),
    allowedRegions: z.array(z.string()).optional()
  }).optional()
});

export class UnifiedToolRegistry {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private isInitialized = false;

  constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.eventBusService = EventBusService.getInstance();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await this.databaseService.initialize();
      logger.info('Unified Tool Registry initialized successfully');
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize Unified Tool Registry', { error });
      throw error;
    }
  }

  /**
   * Register a new tool (combines standard and enterprise registration)
   */
  async registerTool(toolDef: UnifiedToolDefinition): Promise<void> {
    await this.ensureInitialized();
    
    try {
      // Validate tool definition
      const validated = UnifiedToolDefinitionSchema.parse(toolDef);
      
      // Check for duplicates (simplified for now)
      const existingTools = await this.databaseService.getTools({ enabled: true });
      const existing = existingTools.find(t => t.name === validated.name);
      if (existing) {
        throw new Error(`Tool with name '${validated.name}' already exists`);
      }
      
      // Create tool in database
      const tool = await this.databaseService.createTool({
        id: validated.id,
        name: validated.name,
        description: validated.description,
        version: validated.version,
        category: validated.category as ToolCategory,
        securityLevel: validated.securityLevel as SecurityLevel,
        requiresApproval: validated.requiresApproval,
        isEnabled: validated.isEnabled,
        executionTimeEstimate: validated.executionTimeEstimate,
        costEstimate: validated.costEstimate,
        author: validated.author,
        parameters: validated.parameters,
        returnType: validated.returnType,
        tags: validated.tags,
        dependencies: validated.dependencies,
        examples: validated.examples as ToolExample[]
      });
      
      // Register operations if provided (simplified for now)
      if (validated.operations) {
        logger.info('Tool operations registered', { toolId: tool.id, operationCount: validated.operations.length });
      }
      
      // Create graph relationships in Neo4j if available
      if (this.databaseService.neo4jService) {
        await this.createToolGraphNode(tool);
      }
      
      // Emit registration event
      await this.eventBusService.publish('tool.registered', {
        toolId: tool.id,
        name: tool.name,
        category: tool.category,
        securityLevel: tool.securityLevel,
        isEnterprise: !!validated.vendor
      });
      
      logger.info('Tool registered successfully', { 
        toolId: tool.id, 
        name: tool.name,
        category: tool.category,
        isEnterprise: !!validated.vendor
      });
      
    } catch (error) {
      logger.error('Failed to register tool', { error, toolId: toolDef.id });
      throw error;
    }
  }

  /**
   * Get all tools with optional filtering
   */
  async getTools(filters?: {
    category?: string;
    securityLevel?: SecurityLevel;
    isEnabled?: boolean;
    isEnterprise?: boolean;
    projectId?: string;
  }): Promise<UnifiedToolDefinition[]> {
    await this.ensureInitialized();
    
    try {
      const tools = await this.databaseService.getTools(filters);
      
      // Convert to UnifiedToolDefinition and enhance with graph data if available
      const unifiedTools: UnifiedToolDefinition[] = tools.map(tool => ({
        ...tool,
        recommendations: [],
        relationships: [],
        projectContext: []
      }));
      
      if (this.databaseService.neo4jService) {
        for (const tool of unifiedTools) {
          tool.recommendations = await this.getToolRecommendations(tool.id);
          tool.relationships = await this.getToolRelationships(tool.id);
        }
      }
      
      // Add project context if requested
      if (filters?.projectId) {
        for (const tool of unifiedTools) {
          tool.projectContext = await this.getProjectContext(tool.id, filters.projectId);
        }
      }
      
      return unifiedTools;
      
    } catch (error) {
      logger.error('Failed to get tools', { error, filters });
      throw error;
    }
  }

  /**
   * Get a single tool by ID
   */
  async getTool(toolId: string): Promise<UnifiedToolDefinition | null> {
    await this.ensureInitialized();
    
    try {
      const tool = await this.databaseService.getTool(toolId);
      if (!tool) return null;
      
      // Convert to UnifiedToolDefinition
      return {
        ...tool,
        recommendations: [],
        relationships: [],
        projectContext: []
      };
    } catch (error) {
      logger.error('Failed to get tool', { error, toolId });
      throw error;
    }
  }

  /**
   * Execute a tool with unified security and sandboxing
   */
  async executeTool(
    toolId: string, 
    operation: string, 
    parameters: any,
    context: {
      userId: string;
      projectId?: string;
      agentId?: string;
      securityContext?: any;
    }
  ): Promise<any> {
    await this.ensureInitialized();
    
    try {
      const baseTool = await this.databaseService.getTool(toolId);
      if (!baseTool) {
        throw new Error(`Tool ${toolId} not found`);
      }
      
      if (!baseTool.isEnabled) {
        throw new Error(`Tool ${toolId} is disabled`);
      }
      
      // Convert to UnifiedToolDefinition for additional features
      const tool: UnifiedToolDefinition = {
        ...baseTool,
        recommendations: [],
        relationships: [],
        projectContext: []
      };
      
      // Security checks
      await this.validateToolExecution(tool, operation, context);
      
      // Rate limiting (simplified for now)
      if (tool.rateLimits) {
        logger.debug('Rate limiting check (simplified)', { toolId, userId: context.userId });
      }
      
      // Execute in sandbox if configured
      let result;
      if (tool.sandboxing?.enabled) {
        result = await this.executeSandboxed(tool, operation, parameters, context);
      } else {
        result = await this.executeStandard(tool, operation, parameters, context);
      }
      
      // Record usage
      await this.recordUsage(toolId, operation, context, result);
      
      // Update project context if provided
      if (context.projectId) {
        await this.updateProjectContext(toolId, context.projectId);
      }
      
      return result;
      
    } catch (error) {
      logger.error('Tool execution failed', { error, toolId, operation, context });
      throw error;
    }
  }

  /**
   * Get tool recommendations for a project or context
   */
  async getRecommendations(context: {
    projectId?: string;
    currentTools?: string[];
    objective?: string;
    category?: string;
  }): Promise<ToolRecommendation[]> {
    await this.ensureInitialized();
    
    try {
      // Use Neo4j for graph-based recommendations if available
      if (this.databaseService.neo4jService) {
        return await this.getGraphRecommendations(context);
      }
      
      // Fallback to rule-based recommendations
      return await this.getRuleBasedRecommendations(context);
      
    } catch (error) {
      logger.error('Failed to get tool recommendations', { error, context });
      return [];
    }
  }

  /**
   * Create workflow template from tool usage patterns
   */
  async createWorkflowTemplate(
    name: string,
    description: string,
    toolSequence: Array<{ toolId: string; operation: string; parameters?: any }>
  ): Promise<WorkflowTemplate> {
    await this.ensureInitialized();
    
    try {
      const template: WorkflowTemplate = {
        id: `workflow_${Date.now()}`,
        name,
        description,
        steps: toolSequence.map((step, index) => ({
          id: `step_${index}`,
          toolId: step.toolId,
          operation: step.operation,
          parameters: step.parameters || {}
        }))
      };
      
      // Store template in database
      await this.databaseService.workflowRepository.createTemplate(template);
      
      logger.info('Workflow template created', { templateId: template.id, name });
      return template;
      
    } catch (error) {
      logger.error('Failed to create workflow template', { error, name });
      throw error;
    }
  }

  // Private helper methods
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async createToolGraphNode(tool: any): Promise<void> {
    try {
      if (this.databaseService.neo4jService) {
        await this.databaseService.neo4jService.createToolNode({
          id: tool.id,
          name: tool.name,
          category: tool.category,
          securityLevel: tool.securityLevel,
          vendor: tool.vendor || null,
          tags: tool.tags || [],
          dependencies: tool.dependencies || []
        });
        logger.debug(`Tool graph node created: ${tool.id}`);
      }
    } catch (error) {
      logger.error('Failed to create tool graph node', { error, toolId: tool.id });
      // Don't throw - graph operations are supplementary
    }
  }

  private async getToolRecommendations(toolId: string): Promise<ToolRecommendation[]> {
    try {
      if (this.databaseService.neo4jService) {
        return await this.databaseService.neo4jService.getRecommendations(toolId, undefined, 5);
      }
      return [];
    } catch (error) {
      logger.error('Failed to get tool recommendations', { error, toolId });
      return [];
    }
  }

  private async getToolRelationships(toolId: string): Promise<ToolRelationship[]> {
    try {
      if (this.databaseService.neo4jService) {
        const relationships = await this.databaseService.neo4jService.getToolRelationships(toolId);
        return relationships.map(rel => ({
          type: rel.type as any,
          targetToolId: rel.targetId,
          strength: rel.strength || 0.5,
          reason: rel.reason,
          metadata: rel.metadata
        }));
      }
      return [];
    } catch (error) {
      logger.error('Failed to get tool relationships', { error, toolId });
      return [];
    }
  }

  private async getProjectContext(toolId: string, projectId: string): Promise<ProjectContext[]> {
    try {
      // Simplified project usage lookup for now
      const projectUsage = null;
      if (projectUsage) {
        return [{
          projectId,
          usageCount: projectUsage.usageCount,
          lastUsed: projectUsage.lastUsed,
          effectiveness: projectUsage.successRate
        }];
      }
      return [];
    } catch (error) {
      logger.error('Failed to get project context', { error, toolId, projectId });
      return [];
    }
  }

  private async validateToolExecution(tool: any, operation: string, context: any): Promise<void> {
    // Check if tool has required operation
    if (tool.operations && !tool.operations.find((op: any) => op.id === operation)) {
      throw new Error(`Operation '${operation}' not found in tool '${tool.id}'`);
    }

    // Security level validation
    const userSecurityLevel = context.securityContext?.level || 1;
    const requiredLevel = this.getRequiredSecurityLevel(tool.securityLevel);
    
    if (userSecurityLevel < requiredLevel) {
      throw new Error(`Insufficient security level. Required: ${requiredLevel}, User: ${userSecurityLevel}`);
    }

    // Approval requirement check
    if (tool.requiresApproval && !context.securityContext?.hasApproval) {
      throw new Error(`Tool '${tool.id}' requires approval for execution`);
    }
  }

  private async checkRateLimit(toolId: string, userId: string, rateLimit: RateLimitConfig): Promise<void> {
    const key = rateLimit.perUser ? `${toolId}:${userId}` : toolId;
    const now = Date.now();
    
    try {
      // Get current usage from Redis or memory
      const usageKey = `rate_limit:${key}`;
      const usageData = await this.databaseService.redisService?.get(usageKey);
      
      let usage = usageData ? JSON.parse(usageData) : { requests: [], lastReset: now };
      
      // Clean old requests outside window
      usage.requests = usage.requests.filter((time: number) => now - time < rateLimit.window);
      
      // Check if limit exceeded
      if (usage.requests.length >= rateLimit.requests) {
        throw new Error(`Rate limit exceeded for tool ${toolId}. Try again later.`);
      }
      
      // Record this request
      usage.requests.push(now);
      
      // Save back to cache
      if (this.databaseService.redisService) {
        await this.databaseService.redisService.setex(usageKey, Math.ceil(rateLimit.window / 1000), JSON.stringify(usage));
      }
      
    } catch (error) {
      if (error.message.includes('Rate limit exceeded')) {
        throw error;
      }
      logger.warn('Rate limit check failed, allowing request', { error, toolId, userId });
    }
  }

  private async executeSandboxed(tool: any, operation: string, parameters: any, context: any): Promise<any> {
    const sandbox = {
      toolId: tool.id,
      operation,
      parameters,
      timeout: tool.sandboxing.timeoutMs,
      memoryLimit: tool.sandboxing.memoryLimitMB,
      networkAccess: tool.sandboxing.networkAccess,
      allowedDomains: tool.sandboxing.allowedDomains,
      userId: context.userId,
      projectId: context.projectId
    };

    try {
      // Execute through sandbox service via event bus
      const result = await this.eventBusService.publishAndWait(
        'sandbox.execute.tool',
        sandbox,
        tool.sandboxing.timeoutMs + 5000 // Add buffer to event timeout
      );
      
      if (!result.success) {
        throw new Error(`Sandbox execution failed: ${result.error}`);
      }
      
      return result.data;
    } catch (error) {
      logger.error('Sandboxed execution failed', { error, toolId: tool.id, operation });
      throw error;
    }
  }

  private async executeStandard(tool: any, operation: string, parameters: any, context: any): Promise<any> {
    try {
      // Get tool adapter/executor
      const executor = await this.getToolExecutor(tool);
      
      if (!executor) {
        throw new Error(`No executor found for tool: ${tool.id}`);
      }
      
      // Execute the operation
      const result = await executor.execute(operation, parameters, {
        userId: context.userId,
        projectId: context.projectId,
        agentId: context.agentId,
        securityContext: context.securityContext
      });
      
      return result;
    } catch (error) {
      logger.error('Standard execution failed', { error, toolId: tool.id, operation });
      throw error;
    }
  }

  private async recordUsage(toolId: string, operation: string, context: any, result: any): Promise<void> {
    try {
      const usageRecord = {
        toolId,
        operation,
        userId: context.userId,
        agentId: context.agentId,
        projectId: context.projectId,
        success: result.success !== false,
        executionTime: result.executionTime || 0,
        cost: result.cost || 0,
        timestamp: new Date(),
        metadata: {
          parameters: Object.keys(context.parameters || {}),
          resultSize: JSON.stringify(result).length,
          securityLevel: context.securityContext?.level
        }
      };
      
      // Record in database (simplified for now)
      await this.databaseService.recordToolUsage(usageRecord);
      
      // Emit usage event
      await this.eventBusService.publish('tool.usage.recorded', usageRecord);
      
      logger.debug('Tool usage recorded', { toolId, operation, userId: context.userId });
    } catch (error) {
      logger.error('Failed to record tool usage', { error, toolId, operation });
      // Don't throw - usage recording shouldn't break execution
    }
  }

  private async updateProjectContext(toolId: string, projectId: string): Promise<void> {
    try {
      // Simplified project context update for now
      logger.debug('Project context updated (simplified)', { toolId, projectId });
      logger.debug('Project context updated', { toolId, projectId });
    } catch (error) {
      logger.error('Failed to update project context', { error, toolId, projectId });
    }
  }

  private async getGraphRecommendations(context: any): Promise<ToolRecommendation[]> {
    try {
      if (!this.databaseService.neo4jService) {
        return [];
      }
      
      const recommendations: ToolRecommendation[] = [];
      
      // Get recommendations based on current tools
      if (context.currentTools?.length > 0) {
        for (const toolId of context.currentTools) {
          const toolRecs = await this.databaseService.neo4jService.getRecommendations(toolId, context.objective, 3);
          recommendations.push(...toolRecs);
        }
      }
      
      // Get category-based recommendations
      if (context.category) {
        const categoryRecs = await this.databaseService.neo4jService.getToolsByCategory(context.category);
        recommendations.push(...categoryRecs.map(tool => ({
          toolId: tool.id,
          score: 0.7,
          reason: `Recommended for ${context.category} category`,
          context: context.objective || 'category match'
        })));
      }
      
      // Get project-based recommendations
      if (context.projectId) {
        const projectRecs = await this.getProjectRecommendations(context.projectId);
        recommendations.push(...projectRecs);
      }
      
      return this.deduplicateRecommendations(recommendations);
    } catch (error) {
      logger.error('Failed to get graph recommendations', { error, context });
      return [];
    }
  }

  private async getRuleBasedRecommendations(context: any): Promise<ToolRecommendation[]> {
    try {
      const tools = await this.getTools({ isEnabled: true });
      const recommendations: ToolRecommendation[] = [];
      
      for (const tool of tools) {
        let score = 0;
        let reason = 'Available tool';
        
        // Category matching
        if (context.category && tool.category === context.category) {
          score += 0.3;
          reason = `Matches category: ${context.category}`;
        }
        
        // Tag matching
        if (context.objective) {
          const objectiveLower = context.objective.toLowerCase();
          const tagMatches = tool.tags.filter(tag => 
            objectiveLower.includes(tag.toLowerCase()) || tag.toLowerCase().includes(objectiveLower)
          );
          if (tagMatches.length > 0) {
            score += 0.4 * tagMatches.length;
            reason = `Matches tags: ${tagMatches.join(', ')}`;
          }
        }
        
        // Usage frequency (mock scoring)
        if (tool.metadata?.usageCount > 10) {
          score += 0.2;
        }
        
        // Security level preference (favor safer tools)
        const securityBonus = {
          'low': 0.1,
          'medium': 0.05,
          'high': 0,
          'critical': -0.1
        };
        score += securityBonus[tool.securityLevel] || 0;
        
        if (score > 0.2) {
          recommendations.push({
            toolId: tool.id,
            score: Math.min(score, 1.0),
            reason,
            context: context.objective || 'rule-based match'
          });
        }
      }
      
      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    } catch (error) {
      logger.error('Failed to get rule-based recommendations', { error, context });
      return [];
    }
  }

  // Additional helper methods
  private getRequiredSecurityLevel(toolSecurityLevel: string): number {
    const levelMap = {
      'low': 1,
      'medium': 2, 
      'high': 3,
      'critical': 4
    };
    return levelMap[toolSecurityLevel] || 2;
  }

  private async getToolExecutor(tool: any): Promise<any> {
    try {
      // Try to get executor from registry
      if (tool.vendor) {
        // Enterprise tool - use enterprise registry executor
        const enterpriseRegistry = await import('./enterprise-tool-registry');
        return new enterpriseRegistry.EnterpriseToolRegistry({
          eventBusService: this.eventBusService,
          databaseService: this.databaseService,
          serviceName: 'capability-registry'
        });
      } else {
        // Standard tool - use standard registry executor
        const toolRegistry = await import('./toolRegistry');
        return new toolRegistry.ToolRegistry(
          this.databaseService,
          this.databaseService.neo4jService,
          this.eventBusService
        );
      }
    } catch (error) {
      logger.error('Failed to get tool executor', { error, toolId: tool.id });
      return null;
    }
  }

  private async getProjectRecommendations(projectId: string): Promise<ToolRecommendation[]> {
    try {
      // Get tools frequently used in this project
      // Simplified project tools lookup for now
      const projectTools = [];
      
      return projectTools.map(tool => ({
        toolId: tool.id,
        score: 0.8,
        reason: `Frequently used in this project (${tool.usageCount} times)`,
        context: `project-${projectId}`
      }));
    } catch (error) {
      logger.error('Failed to get project recommendations', { error, projectId });
      return [];
    }
  }

  private deduplicateRecommendations(recommendations: ToolRecommendation[]): ToolRecommendation[] {
    const seen = new Set<string>();
    const deduplicated: ToolRecommendation[] = [];
    
    for (const rec of recommendations.sort((a, b) => b.score - a.score)) {
      if (!seen.has(rec.toolId)) {
        seen.add(rec.toolId);
        deduplicated.push(rec);
      }
    }
    
    return deduplicated;
  }
}

export default UnifiedToolRegistry;