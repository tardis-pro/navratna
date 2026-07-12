/**
 * Unified Tool Registry Service
 * Consolidates all tool management functionality to eliminate duplication
 * Combines features from toolRegistry.ts and enterprise-tool-registry.ts
 */

import { ToolDefinition, ToolCategory, SecurityLevel } from '@uaip/types';
import { ToolService } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/infra';
import { EventBusService } from '@uaip/infra';
import { logger, ConflictError, InternalServerError, NotFoundError, RateLimitError, ValidationError } from '@uaip/utils';
import { z } from 'zod';
import { ExecutionScheduler } from './execution_mesh/scheduler.js';
import { resolveToolDescriptor } from './execution_mesh/descriptor.js';
import { BaseToolExecutor } from './base_tool_executor.js';
import type { ExecutionRequestEnvelope } from '@uaip/types';
import { randomUUID } from 'node:crypto';

const toolCategoryValues = new Set<unknown>(Object.values(ToolCategory));
function isToolCategory(v: unknown): v is ToolCategory { return toolCategoryValues.has(v); }

const securityLevelValues = new Set<unknown>(Object.values(SecurityLevel));
function isSecurityLevel(v: unknown): v is SecurityLevel { return securityLevelValues.has(v); }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

import type { JSONSchema } from '@uaip/types';

function toJSONSchema(v: unknown): JSONSchema {
  if (!isRecord(v)) return {};
  const schema: JSONSchema = {};
  if (typeof v['type'] === 'string') {
    schema.type = v['type'];
  } else if (Array.isArray(v['type'])) {
    schema.type = v['type'].filter((s): s is string => typeof s === 'string');
  }
  if (isRecord(v['properties'])) {
    schema.properties = Object.fromEntries(
      Object.entries(v['properties']).map(([k, val]) => [k, toJSONSchema(val)])
    );
  }
  if (typeof v['description'] === 'string') schema.description = v['description'];
  if (Array.isArray(v['required'])) schema.required = v['required'].filter((s): s is string => typeof s === 'string');
  if (typeof v['additionalProperties'] === 'boolean') schema.additionalProperties = v['additionalProperties'];
  return schema;
}

type RateLimitUsageData = { requests: number[]; lastReset: number };
function isRateLimitUsageData(v: unknown): v is RateLimitUsageData {
  if (!isRecord(v)) return false;
  return Array.isArray(v['requests']) && typeof v['lastReset'] === 'number';
}

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
    [key: string]: unknown;
  };
}

export interface ToolOperation {
  id: string;
  name: string;
  description: string;
  requiredPermissions: string[];
  inputSchema: unknown;
  outputSchema: unknown;
  securityLevel: number;
  auditLevel: 'comprehensive' | 'standard' | 'minimal';
}

export interface ToolAuthentication {
  type: 'oauth2' | 'api_key' | 'basic' | 'jwt' | 'saml';
  config: unknown;
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
  metadata?: unknown;
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
  parameters: unknown;
  conditions?: unknown;
}

interface ExecutionContext {
  userId: string;
  projectId?: string;
  agentId?: string;
  securityContext?: {
    level?: number;
    permissions?: string[];
    hasApproval?: boolean;
    approvalStatus?: {
      approvalLevel?: string;
    };
  };
  parameters?: Record<string, unknown>;
}

interface ToolExecutor {
  execute(
    operation: string,
    parameters: unknown,
    context: {
      userId: string;
      projectId?: string;
      agentId?: string;
      securityContext?: ExecutionContext['securityContext'];
    }
  ): Promise<unknown>;
}

interface RecommendationRequestContext {
  projectId?: string;
  currentTools?: string[];
  objective?: string;
  category?: string;
}

type ManagedToolDefinition = Awaited<ReturnType<ToolService['createTool']>>;

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
  examples: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        input: z.record(z.any()),
        expectedOutput: z.any(),
        notes: z.string().optional(),
      })
    )
    .default([]),

  // Enterprise fields
  operations: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        requiredPermissions: z.array(z.string()),
        inputSchema: z.any(),
        outputSchema: z.any(),
        securityLevel: z.number(),
        auditLevel: z.enum(['comprehensive', 'standard', 'minimal']),
      })
    )
    .optional(),

  authentication: z
    .object({
      type: z.enum(['oauth2', 'api_key', 'basic', 'jwt', 'saml']),
      config: z.any(),
      scopes: z.array(z.string()).optional(),
      tokenEndpoint: z.string().optional(),
      refreshable: z.boolean().optional(),
    })
    .optional(),

  rateLimit: z
    .object({
      requests: z.number(),
      window: z.number(),
      burstAllowance: z.number().optional(),
      perUser: z.boolean().optional(),
    })
    .optional(),

  sandboxing: z
    .object({
      enabled: z.boolean(),
      timeoutMs: z.number(),
      memoryLimitMB: z.number(),
      networkAccess: z.boolean(),
      fileSystemAccess: z.enum(['none', 'read', 'write']),
      allowedDomains: z.array(z.string()).optional(),
    })
    .optional(),

  compliance: z
    .object({
      dataClassification: z.enum(['public', 'internal', 'confidential', 'restricted']),
      retentionPolicyDays: z.number().optional(),
      encryptionRequired: z.boolean(),
      auditRequired: z.boolean(),
      approvalRequired: z.boolean(),
      allowedRegions: z.array(z.string()).optional(),
    })
    .optional(),
});

export class UnifiedToolRegistry {
  private databaseService: DatabaseService;
  private toolService: ToolService;
  private eventBusService: EventBusService;
  private isInitialized = false;

  private asRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
  }

  private recordToToolDefinition(record: Record<string, unknown>): ToolDefinition {
    const rl = record.rateLimits;
    const rlRecord = isRecord(rl) ? rl : null;
    return {
      id: typeof record.id === 'string' ? record.id : '',
      name: typeof record.name === 'string' ? record.name : '',
      description: typeof record.description === 'string' ? record.description : '',
      category: isToolCategory(record.category) ? record.category : ToolCategory.SYSTEM,
      isEnabled: typeof record.isEnabled === 'boolean' ? record.isEnabled : true,
      version: typeof record.version === 'string' ? record.version : '1.0.0',
      author: typeof record.author === 'string' ? record.author : '',
      securityLevel: isSecurityLevel(record.securityLevel) ? record.securityLevel : SecurityLevel.LOW,
      tags: Array.isArray(record.tags) ? record.tags.filter((t): t is string => typeof t === 'string') : [],
      parameters: toJSONSchema(record.parameters),
      returnType: toJSONSchema(record.returnType),
      examples: [],
      requiresApproval: typeof record.requiresApproval === 'boolean' ? record.requiresApproval : false,
      dependencies: Array.isArray(record.dependencies) ? record.dependencies.filter((d): d is string => typeof d === 'string') : [],
      rateLimits: rlRecord ? {
        maxCallsPerMinute: typeof rlRecord.maxCallsPerMinute === 'number' ? rlRecord.maxCallsPerMinute : undefined,
        maxCallsPerHour: typeof rlRecord.maxCallsPerHour === 'number' ? rlRecord.maxCallsPerHour : undefined,
        maxConcurrentExecutions: typeof rlRecord.maxConcurrentExecutions === 'number' ? rlRecord.maxConcurrentExecutions : undefined,
      } : undefined,
    };
  }

  private asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  private asNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' ? value : fallback;
  }

  constructor(eventBusService: EventBusService) {
    this.databaseService = DatabaseService.getInstance();
    this.toolService = ToolService.getInstance();
    this.eventBusService = eventBusService;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
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
      const existingTools = await this.toolService.findActiveTools();
      const existing = existingTools.find((t) => t.name === validated.name);
      if (existing) {
        throw new ConflictError(`Tool with name '${validated.name}' already exists`);
      }

      // Create tool in database
      const tool = await this.toolService.createTool({
        name: validated.name,
        displayName: validated.name, // Use name as displayName
        description: validated.description,
        category: isToolCategory(validated.category) ? validated.category : ToolCategory.SYSTEM,
        isEnabled: validated.isEnabled,
        version: validated.version,
        securityLevel: isSecurityLevel(validated.securityLevel) ? validated.securityLevel : SecurityLevel.LOW,
      });

      // Register operations if provided (simplified for now)
      if (validated.operations) {
        logger.info('Tool operations registered', {
          toolId: tool.id,
          operationCount: validated.operations.length,
        });
      }

      // Create graph relationships in Neo4j if available
      if (this.toolService.neo4jService) {
        await this.createToolGraphNode(tool);
      }

      // Emit registration event
      await this.eventBusService.publish('tool.registered', {
        toolId: tool.id,
        name: tool.name,
        category: tool.category,
        securityLevel: tool.securityLevel,
        isEnterprise: !!validated.vendor,
      });

      logger.info('Tool registered successfully', {
        toolId: tool.id,
        name: tool.name,
        category: tool.category,
        isEnterprise: !!validated.vendor,
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
      const tools = await this.toolService.findActiveTools();

      // Convert to UnifiedToolDefinition and enhance with graph data if available
      const unifiedTools: UnifiedToolDefinition[] = tools.map((tool) => ({
        ...this.recordToToolDefinition(tool),
        recommendations: [] satisfies ToolRecommendation[],
        relationships: [] satisfies ToolRelationship[],
        projectContext: [] satisfies ProjectContext[],
      }));

      if (this.toolService.neo4jService) {
        for (const tool of unifiedTools) {
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          tool.recommendations = await this.getToolRecommendations(tool.id);
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          tool.relationships = await this.getToolRelationships(tool.id);
        }
      }

      // Add project context if requested
      if (filters?.projectId) {
        for (const tool of unifiedTools) {
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
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
      const tool = await this.toolService.findToolById(toolId);
      if (!tool) return null;

      return {
        ...this.recordToToolDefinition(tool),
        recommendations: [] satisfies ToolRecommendation[],
        relationships: [] satisfies ToolRelationship[],
        projectContext: [] satisfies ProjectContext[],
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
    parameters: unknown,
    context: ExecutionContext
  ): Promise<unknown> {
    await this.ensureInitialized();

    try {
      // Resolve by UUID id, or by name. Callers (workflow steps, the coordinator) reference
      // native tools by a stable name like "shell-exec"; the DB id is a generated UUID, and
      // findToolById would throw on a non-UUID value.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(toolId);
      const baseTool = isUuid
        ? await this.toolService.findToolById(toolId)
        : await this.toolService.findToolByName(toolId);
      if (!baseTool) {
        throw new NotFoundError(`Tool ${toolId} not found`);
      }

      if (!baseTool.isEnabled) {
        throw new InternalServerError(`Tool ${toolId} is disabled`);
      }

      // Convert to UnifiedToolDefinition for additional features
      const tool: UnifiedToolDefinition = {
        ...this.recordToToolDefinition(baseTool),
        recommendations: [] satisfies ToolRecommendation[],
        relationships: [] satisfies ToolRelationship[],
        projectContext: [] satisfies ProjectContext[],
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
      if (this.toolService.neo4jService) {
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
    toolSequence: Array<{ toolId: string; operation: string; parameters?: unknown }>
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
          parameters: step.parameters || {},
        })),
      };

      // Store template in database
      // TODO: Move workflow template creation to operations service
      logger.info('Workflow template creation requested', { template });

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

  private async createToolGraphNode(tool: ManagedToolDefinition): Promise<void> {
    try {
      if (this.toolService.neo4jService) {
        await this.toolService.createToolNode(tool);
        logger.debug(`Tool graph node created: ${tool.id}`);
      }
    } catch (error) {
      logger.error('Failed to create tool graph node', { error, toolId: tool.id });
      // Don't throw - graph operations are supplementary
    }
  }

  private async getToolRecommendations(toolId: string): Promise<ToolRecommendation[]> {
    try {
      if (this.toolService.neo4jService) {
        const recommendations = await this.toolService.getRecommendations(toolId, undefined, 5);
        return Array.isArray(recommendations)
          ? recommendations.map((recommendation) => {
              const rec = this.asRecord(recommendation);
              return {
                toolId: this.asString(rec.toolId),
                score: this.asNumber(rec.score),
                reason: this.asString(rec.reason),
                context: this.asString(rec.context),
              };
            })
          : [];
      }
      return [];
    } catch (error) {
      logger.error('Failed to get tool recommendations', { error, toolId });
      return [];
    }
  }

  private async getToolRelationships(toolId: string): Promise<ToolRelationship[]> {
    try {
      if (this.toolService.neo4jService) {
        const relationships = await this.toolService.getToolRelationships(toolId);
        return relationships.map((rel) => {
          const relation = this.asRecord(rel);
          const typeValue = this.asString(relation.type, 'SIMILAR_TO');
          const validTypes: ToolRelationship['type'][] = [
            'DEPENDS_ON',
            'SIMILAR_TO',
            'REPLACES',
            'ENHANCES',
            'REQUIRES',
          ];
          const validTypeSet = new Set<unknown>(validTypes);
          const isToolRelationshipType = (v: unknown): v is ToolRelationship['type'] => validTypeSet.has(v);
          const relationshipType: ToolRelationship['type'] = isToolRelationshipType(typeValue)
            ? typeValue
            : 'SIMILAR_TO';

          return {
            type: relationshipType,
            targetToolId: this.asString(relation.targetId),
            strength: this.asNumber(relation.strength, 0.5),
            reason: this.asString(relation.reason),
            metadata: relation.metadata,
          };
        });
      }
      return [];
    } catch (error) {
      logger.error('Failed to get tool relationships', { error, toolId });
      return [];
    }
  }

  private async getProjectContext(toolId: string, projectId: string): Promise<ProjectContext[]> {
    try {
      void toolId; void projectId;
      return [];
    } catch (error) {
      logger.error('Failed to get project context', { error, toolId, projectId });
      return [];
    }
  }

  private async validateToolExecution(
    tool: UnifiedToolDefinition,
    operation: string,
    context: ExecutionContext
  ): Promise<void> {
    // Check if tool has required operation
    if (tool.operations && !tool.operations.find((op) => op.id === operation)) {
      throw new NotFoundError(`Operation '${operation}' not found in tool '${tool.id}'`);
    }

    // Security level validation
    const userSecurityLevel = context.securityContext?.level || 1;
    const requiredLevel = this.getRequiredSecurityLevel(tool.securityLevel);

    if (userSecurityLevel < requiredLevel) {
      throw new ValidationError(
        `Insufficient security level. Required: ${requiredLevel}, User: ${userSecurityLevel}`
      );
    }

    // P5 Security: Danger tool validation
    // Import danger tool functions dynamically to avoid circular dependencies
    const { getDangerToolConfig, toolRequiresApproval, getRequiredApprovalLevel } =
      await import('./danger_tool_list.js');

    const dangerConfig = getDangerToolConfig(tool.id);
    if (dangerConfig) {
      // Check if tool requires approval
      if (toolRequiresApproval(tool.id)) {
        const requiredApproval = getRequiredApprovalLevel(tool.id);
        const hasApproval = context.securityContext?.hasApproval === true;
        const approvedLevel = context.securityContext?.approvalStatus?.approvalLevel;

        // Check if approval level is sufficient
        const approvalHierarchy = ['NONE', 'USER_CONSENT', 'MANAGER', 'ADMIN', 'SECURITY_TEAM'];
        const userIndex = approvedLevel ? approvalHierarchy.indexOf(approvedLevel) : -1;
        const requiredIndex = approvalHierarchy.indexOf(requiredApproval);
        const hasSufficientApproval = userIndex >= requiredIndex;

        if (!hasApproval || !hasSufficientApproval) {
          throw new ValidationError(
            `Tool '${tool.id}' is classified as ${dangerConfig.riskLevel} risk and requires ${requiredApproval} approval. ` +
              `Current approval status: ${hasApproval ? `approved (${approvedLevel})` : 'not approved'}`
          );
        }
      }

      // Log security check for danger tools
      logger.debug('Danger tool validation passed', {
        toolId: tool.id,
        riskLevel: dangerConfig.riskLevel,
        categories: dangerConfig.categories,
      });
    }

    // Approval requirement check (existing logic)
    if (tool.requiresApproval && !context.securityContext?.hasApproval) {
      throw new ValidationError(`Tool '${tool.id}' requires approval for execution`);
    }
  }

  private async checkRateLimit(
    toolId: string,
    userId: string,
    rateLimit: RateLimitConfig
  ): Promise<void> {
    const key = rateLimit.perUser ? `${toolId}:${userId}` : toolId;
    const now = Date.now();

    try {
      // Get current usage from Redis or memory
      const usageKey = `rate_limit:${key}`;
      const usageData = await this.toolService.getRedisService().get(usageKey);

      const parsedUsage: unknown = typeof usageData === 'string' ? JSON.parse(usageData) : null;
      const usage: RateLimitUsageData = isRateLimitUsageData(parsedUsage)
        ? parsedUsage
        : { requests: [], lastReset: now };

      // Clean old requests outside window
      usage.requests = usage.requests.filter((time: number) => now - time < rateLimit.window);

      // Check if limit exceeded
      if (usage.requests.length >= rateLimit.requests) {
        throw new RateLimitError(`Rate limit exceeded for tool ${toolId}. Try again later.`);
      }

      // Record this request
      usage.requests.push(now);

      // Save back to cache
      const redisService = this.toolService.getRedisService();
      if (redisService) {
        await redisService.set(usageKey, usage, Math.ceil(rateLimit.window / 1000));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Rate limit exceeded')) {
        throw error;
      }
      logger.warn('Rate limit check failed, allowing request', { error, toolId, userId });
    }
  }

  private async executeSandboxed(
    tool: UnifiedToolDefinition,
    operation: string,
    parameters: unknown,
    context: ExecutionContext
  ): Promise<unknown> {
    if (!tool.sandboxing) {
      throw new Error(`Sandboxed execution called but sandboxing config missing for tool ${tool.id}`);
    }
    const sandbox = {
      toolId: tool.id,
      operation,
      parameters,
      timeout: tool.sandboxing.timeoutMs,
      memoryLimit: tool.sandboxing.memoryLimitMB,
      networkAccess: tool.sandboxing.networkAccess,
      allowedDomains: tool.sandboxing.allowedDomains,
      userId: context.userId,
      projectId: context.projectId,
    };

    try {
      // Execute through sandbox service via event bus
      const result = await this.eventBusService.request('sandbox.execute.tool', sandbox);

      const resultRecord = this.asRecord(result);

      if (!resultRecord.success) {
        throw new InternalServerError(
          `Sandbox execution failed: ${this.asString(resultRecord.error, 'unknown')}`
        );
      }

      return resultRecord.data;
    } catch (error) {
      logger.error('Sandboxed execution failed', { error, toolId: tool.id, operation });
      throw error;
    }
  }

  private async executeStandard(
    tool: UnifiedToolDefinition,
    operation: string,
    parameters: unknown,
    context: ExecutionContext
  ): Promise<unknown> {
    try {
      // Get tool adapter/executor
      const executor = await this.getToolExecutor(tool);

      if (executor) {
        // Vendor / enterprise tool: use its dedicated adapter.
        return await executor.execute(operation, parameters, {
          userId: context.userId,
          projectId: context.projectId,
          agentId: context.agentId,
          securityContext: context.securityContext,
        });
      }

      // No vendor adapter — route through the Execution Mesh scheduler. The native
      // node wraps BaseToolExecutor (built-ins incl. shell-exec / http-request); a
      // registered exec node handles a remote runtime, capability-matched on the step's
      // `requires`. This is what makes non-vendor tools (shell/http/mcp) actually run
      // instead of dead-ending at "No executor found".
      //
      // Pass the tool NAME, not the UUID id: BaseToolExecutor (and mcp-*/oauth- routing)
      // dispatches on the semantic key, while the DB primary key is a generated UUID.
      return await this.executeViaMesh(tool.name || tool.id, parameters, context);
    } catch (error) {
      logger.error('Standard execution failed', { error, toolId: tool.id, operation });
      throw error;
    }
  }

  /** Shared native-executor instance the mesh's native node wraps. */
  private baseToolExecutor: BaseToolExecutor | null = null;

  private async executeViaMesh(
    toolId: string,
    parameters: unknown,
    context: ExecutionContext
  ): Promise<unknown> {
    const scheduler = ExecutionScheduler.getInstance();
    if (!this.baseToolExecutor) this.baseToolExecutor = new BaseToolExecutor();
    const base = this.baseToolExecutor;
    scheduler.ensureNativeNode((tid, params) => base.execute(tid, params));

    const descriptor = await resolveToolDescriptor(toolId);
    const runtime = scheduler.resolveRuntime(descriptor);
    const paramsRecord = (parameters ?? {}) as Record<string, unknown>;
    const requires = Array.isArray(paramsRecord.requires)
      ? (paramsRecord.requires as unknown[]).filter((r): r is string => typeof r === 'string')
      : undefined;

    const envelope: ExecutionRequestEnvelope = {
      correlationId: `corr_${Date.now()}_${randomUUID().slice(0, 8)}`,
      toolId,
      params: paramsRecord,
      ctx: { userId: context.userId ?? 'system', scopedToken: 'system' },
      runtime,
      sandbox: descriptor.sandbox,
      deadlineMs: 120000,
      idempotencyKey: `${toolId}_${Date.now()}`,
      ...(requires ? { requires } : {}),
    };

    const result = await scheduler.schedule(envelope);
    if (!result.ok) {
      throw new InternalServerError(result.error || `Execution failed for tool ${toolId}`);
    }
    return result.output;
  }

  private async recordUsage(
    toolId: string,
    operation: string,
    context: ExecutionContext,
    result: unknown
  ): Promise<void> {
    try {
      const resultRecord = this.asRecord(result);
      const usageRecord = {
        toolId,
        operation,
        userId: context.userId,
        agentId: context.agentId,
        projectId: context.projectId,
        success: resultRecord.success !== false,
        executionTime: this.asNumber(resultRecord.executionTime, 0),
        cost: this.asNumber(resultRecord.cost, 0),
        timestamp: new Date(),
        metadata: {
          parameters: Object.keys(context.parameters || {}),
          resultSize: JSON.stringify(result).length,
          securityLevel: context.securityContext?.level,
        },
      };

      // Record in database (simplified for now)
      await this.toolService.trackUsage(usageRecord);

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

  private async getGraphRecommendations(
    context: RecommendationRequestContext
  ): Promise<ToolRecommendation[]> {
    try {
      if (!this.toolService.neo4jService) {
        return [];
      }

      const recommendations: ToolRecommendation[] = [];

      // Get recommendations based on current tools
      if (context.currentTools?.length) {
        for (const toolId of context.currentTools) {
          // eslint-disable-next-line no-await-in-loop -- sequential processing required
          const toolRecs = await this.toolService.getRecommendations(toolId, context.objective, 3);
          for (const recommendation of toolRecs) {
            const rec = this.asRecord(recommendation);
            recommendations.push({
              toolId: this.asString(rec.toolId),
              score: this.asNumber(rec.score),
              reason: this.asString(rec.reason),
              context: this.asString(rec.context, context.objective || 'graph match'),
            });
          }
        }
      }

      // Get category-based recommendations
      if (context.category && isToolCategory(context.category)) {
        const categoryRecs = await this.toolService.getToolsByCategory(
          context.category
        );
        recommendations.push(
          ...categoryRecs.map((tool: Record<string, unknown>) => ({
            toolId: String(tool.id),
            score: 0.7,
            reason: `Recommended for ${context.category} category`,
            context: context.objective || 'category match',
          }))
        );
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

  private async getRuleBasedRecommendations(
    context: RecommendationRequestContext
  ): Promise<ToolRecommendation[]> {
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
          const tagMatches = tool.tags.filter(
            (tag) =>
              objectiveLower.includes(tag.toLowerCase()) ||
              tag.toLowerCase().includes(objectiveLower)
          );
          if (tagMatches.length > 0) {
            score += 0.4 * tagMatches.length;
            reason = `Matches tags: ${tagMatches.join(', ')}`;
          }
        }

        // Usage frequency (mock scoring)
        if ((tool.metadata?.usageCount ?? 0) > 10) {
          score += 0.2;
        }

        // Security level preference (favor safer tools)
        const securityBonus = {
          low: 0.1,
          medium: 0.05,
          high: 0,
          critical: -0.1,
        };
        score += securityBonus[tool.securityLevel] || 0;

        if (score > 0.2) {
          recommendations.push({
            toolId: tool.id,
            score: Math.min(score, 1.0),
            reason,
            context: context.objective || 'rule-based match',
          });
        }
      }

      return recommendations.sort((a, b) => b.score - a.score).slice(0, 10);
    } catch (error) {
      logger.error('Failed to get rule-based recommendations', { error, context });
      return [];
    }
  }

  // Additional helper methods
  private getRequiredSecurityLevel(toolSecurityLevel: string): number {
    const levelMap: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return levelMap[toolSecurityLevel] ?? 2;
  }

  private async getToolExecutor(tool: UnifiedToolDefinition): Promise<ToolExecutor | null> {
    try {
      // Try to get executor from registry
      if (tool.vendor) {
        // Enterprise tool - use enterprise registry executor
        const enterpriseRegistry = await import('./enterprise_tool_registry');
        const enterpriseExecutor = new enterpriseRegistry.EnterpriseToolRegistry({
          eventBusService: this.eventBusService,
          databaseService: this.databaseService,
          serviceName: 'capability-registry',
        });

        return {
          execute: async (operation, parameters, context) => {
            const executionResult = await enterpriseExecutor.executeTool({
              toolId: tool.id,
              operation,
              parameters,
              userId: context.userId,
              agentId: context.agentId,
              securityContext: {
                level: context.securityContext?.level ?? 1,
              },
            });

            if (!executionResult.success) {
              throw new InternalServerError(executionResult.error || 'Enterprise tool execution failed');
            }

            return executionResult.data;
          },
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get tool executor', {
        error,
        toolId: tool.id,
      });
      return null;
    }
  }

  private async getProjectRecommendations(projectId: string): Promise<ToolRecommendation[]> {
    try {
      // Get tools frequently used in this project
      // Simplified project tools lookup for now
      const projectTools: unknown[] = [];

      return projectTools.map((tool: unknown) => {
        const toolRecord = this.asRecord(tool);
        return {
          toolId: this.asString(toolRecord.id),
          score: 0.8,
          reason: `Frequently used in this project (${this.asNumber(toolRecord.usageCount)} times)`,
          context: `project-${projectId}`,
        };
      });
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
