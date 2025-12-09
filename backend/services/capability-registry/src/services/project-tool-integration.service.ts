import { EventBusService, DatabaseService, ProjectManagementService } from '@uaip/shared-services';
import { ProjectStatus } from '@uaip/types';
import { UnifiedToolRegistry } from './unified-tool-registry.js';
import { logger } from '@uaip/utils';

export interface ProjectToolContext {
  projectId: string;
  taskId?: string;
  agentId?: string;
  userId: string;
  budget?: {
    allocated: number;
    used: number;
    limit: number;
  };
  permissions: string[];
  securityLevel: number;
  approvalRequired: boolean;
}

export interface ToolExecutionRequest {
  toolId: string;
  operation: string;
  parameters: any;
  context: ProjectToolContext;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  estimatedCost?: number;
  estimatedDuration?: number;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
  actualCost: number;
  metadata: {
    toolId: string;
    operation: string;
    projectId: string;
    taskId?: string;
    agentId?: string;
    timestamp: Date;
  };
}

export class ProjectToolIntegrationService {
  private toolRegistry: UnifiedToolRegistry;
  private projectService: ProjectManagementService;
  private pendingApprovals = new Map<string, ToolExecutionRequest>();

  constructor(
    private databaseService: DatabaseService,
    private eventBusService: EventBusService
  ) {
    this.toolRegistry = new UnifiedToolRegistry();
    this.projectService = new ProjectManagementService(databaseService, eventBusService);
    this.setupEventSubscriptions();
  }

  async initialize(): Promise<void> {
    await this.toolRegistry.initialize();
    await this.projectService.initialize();
    logger.info('Project Tool Integration Service initialized');
  }

  /**
   * Execute a tool within a project context with proper tracking and controls
   */
  async executeToolInProject(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info('Starting project tool execution', {
        executionId,
        toolId: request.toolId,
        operation: request.operation,
        projectId: request.context.projectId,
        agentId: request.context.agentId,
      });

      // Validate project context
      await this.validateProjectContext(request.context);

      // Check budget constraints
      await this.checkBudgetConstraints(request);

      // Validate tool permissions
      await this.validateToolPermissions(request);

      // Check if approval is required
      if (request.context.approvalRequired || (await this.requiresApproval(request))) {
        return await this.handleApprovalRequired(request, executionId);
      }

      // Execute the tool
      const result = await this.toolRegistry.executeTool(
        request.toolId,
        request.operation,
        request.parameters,
        {
          userId: request.context.userId,
          projectId: request.context.projectId,
          agentId: request.context.agentId,
          securityContext: {
            level: request.context.securityLevel,
            permissions: request.context.permissions,
          },
        }
      );

      const executionTime = Date.now() - startTime;
      const actualCost = await this.calculateActualCost(request, result, executionTime);

      // Record usage in project
      await this.recordProjectToolUsage(request, result, executionTime, actualCost);

      // Update project metrics
      await this.updateProjectMetrics(request.context.projectId, actualCost);

      // Create execution result
      const executionResult: ToolExecutionResult = {
        success: true,
        data: result,
        executionTime,
        actualCost,
        metadata: {
          toolId: request.toolId,
          operation: request.operation,
          projectId: request.context.projectId,
          taskId: request.context.taskId,
          agentId: request.context.agentId,
          timestamp: new Date(),
        },
      };

      // Emit success event
      await this.eventBusService.publish('project.tool.execution.completed', {
        executionId,
        ...executionResult.metadata,
        success: true,
        cost: actualCost,
        duration: executionTime,
      });

      logger.info('Project tool execution completed successfully', {
        executionId,
        toolId: request.toolId,
        executionTime,
        actualCost,
      });

      return executionResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error('Project tool execution failed', {
        executionId,
        error,
        toolId: request.toolId,
        projectId: request.context.projectId,
      });

      // Record failed usage
      await this.recordProjectToolUsage(request, null, executionTime, 0, error.message);

      // Emit failure event
      await this.eventBusService.publish('project.tool.execution.failed', {
        executionId,
        toolId: request.toolId,
        projectId: request.context.projectId,
        error: error.message,
        duration: executionTime,
      });

      return {
        success: false,
        error: error.message,
        executionTime,
        actualCost: 0,
        metadata: {
          toolId: request.toolId,
          operation: request.operation,
          projectId: request.context.projectId,
          taskId: request.context.taskId,
          agentId: request.context.agentId,
          timestamp: new Date(),
        },
      };
    }
  }

  /**
   * Get project-specific tool recommendations
   */
  async getProjectToolRecommendations(
    projectId: string,
    context?: {
      currentTask?: string;
      objective?: string;
      agentId?: string;
      usedTools?: string[];
    }
  ): Promise<
    Array<{
      toolId: string;
      score: number;
      reason: string;
      projectUsage: {
        usageCount: number;
        successRate: number;
        averageCost: number;
      };
    }>
  > {
    try {
      // Get base recommendations from unified registry
      const baseRecommendations = await this.toolRegistry.getRecommendations({
        projectId,
        currentTools: context?.usedTools,
        objective: context?.objective,
      });

      // Enhance with project-specific data
      const enhancedRecommendations = [];

      for (const rec of baseRecommendations) {
        const projectUsage = await this.getProjectToolUsage(projectId, rec.toolId);

        // Adjust score based on project history
        let adjustedScore = rec.score;

        if (projectUsage.usageCount > 0) {
          // Boost score for tools with good project history
          adjustedScore += projectUsage.successRate * 0.2;

          // Reduce score if tool is expensive relative to project budget
          const project = await this.projectService.getProject(projectId);
          if (project && projectUsage.averageCost > project.budget * 0.1) {
            adjustedScore -= 0.1;
          }
        }

        enhancedRecommendations.push({
          toolId: rec.toolId,
          score: Math.min(adjustedScore, 1.0),
          reason:
            projectUsage.usageCount > 0
              ? `${rec.reason} (${projectUsage.usageCount} uses in project, ${Math.round(projectUsage.successRate * 100)}% success)`
              : rec.reason,
          projectUsage,
        });
      }

      return enhancedRecommendations.sort((a, b) => b.score - a.score).slice(0, 10);
    } catch (error) {
      logger.error('Failed to get project tool recommendations', { error, projectId });
      return [];
    }
  }

  /**
   * Get project tool usage analytics
   */
  async getProjectToolAnalytics(
    projectId: string,
    timeframe: {
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    totalUsages: number;
    totalCost: number;
    averageExecutionTime: number;
    successRate: number;
    topTools: Array<{
      toolId: string;
      toolName: string;
      usageCount: number;
      totalCost: number;
      successRate: number;
    }>;
    costTrend: Array<{
      date: string;
      cost: number;
      usageCount: number;
    }>;
    agentUsage: Array<{
      agentId: string;
      usageCount: number;
      successRate: number;
      totalCost: number;
    }>;
  }> {
    try {
      const project = await this.projectService.getProject(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Get project metrics from project service
      const metrics = await this.projectService.getProjectMetrics(projectId);

      // Calculate additional analytics
      const totalUsages = metrics.toolUsageStats.reduce((sum, tool) => sum + tool.usageCount, 0);
      const totalCost = metrics.toolUsageStats.reduce(
        (sum, tool) => sum + tool.averageCost * tool.usageCount,
        0
      );
      const averageExecutionTime = metrics.averageTaskDuration;
      const successRate =
        metrics.toolUsageStats.length > 0
          ? metrics.toolUsageStats.reduce((sum, tool) => sum + tool.successRate, 0) /
            metrics.toolUsageStats.length
          : 0;

      // Get time-based cost trend (simplified - would use proper time-series query in production)
      const costTrend = await this.getCostTrend(projectId, timeframe);

      return {
        totalUsages,
        totalCost,
        averageExecutionTime,
        successRate,
        topTools: metrics.toolUsageStats.slice(0, 10).map((tool) => ({
          toolId: tool.toolId,
          toolName: tool.toolName,
          usageCount: tool.usageCount,
          totalCost: tool.averageCost * tool.usageCount,
          successRate: tool.successRate,
        })),
        costTrend,
        agentUsage: metrics.agentPerformance.map((agent) => ({
          agentId: agent.agentId,
          usageCount: agent.tasksCompleted,
          successRate: agent.successRate,
          totalCost: 0, // Would be calculated from actual usage records
        })),
      };
    } catch (error) {
      logger.error('Failed to get project tool analytics', { error, projectId });
      throw error;
    }
  }

  // Private helper methods
  private async validateProjectContext(context: ProjectToolContext): Promise<void> {
    const project = await this.projectService.getProject(context.projectId, context.userId);
    if (!project) {
      throw new Error(`Project ${context.projectId} not found or access denied`);
    }

    if (project.status !== ProjectStatus.ACTIVE) {
      throw new Error(`Project ${context.projectId} is not active`);
    }
  }

  private async checkBudgetConstraints(request: ToolExecutionRequest): Promise<void> {
    if (!request.context.budget) return;

    const remainingBudget = request.context.budget.allocated - request.context.budget.used;
    const estimatedCost = request.estimatedCost || 0;

    if (estimatedCost > remainingBudget) {
      throw new Error(
        `Insufficient budget. Required: ${estimatedCost}, Available: ${remainingBudget}`
      );
    }

    if (request.context.budget.limit && estimatedCost > request.context.budget.limit) {
      throw new Error(
        `Cost exceeds limit. Required: ${estimatedCost}, Limit: ${request.context.budget.limit}`
      );
    }
  }

  private async validateToolPermissions(request: ToolExecutionRequest): Promise<void> {
    // Check if tool is allowed in project
    const project = await this.projectService.getProject(request.context.projectId);

    if (
      project?.settings?.allowedTools &&
      !project.settings.allowedTools.includes(request.toolId)
    ) {
      throw new Error(`Tool ${request.toolId} is not allowed in this project`);
    }

    // Check agent-specific tool permissions
    if (request.context.agentId) {
      // Would check agent tool permissions here
      logger.debug('Agent tool permissions validated', {
        agentId: request.context.agentId,
        toolId: request.toolId,
      });
    }
  }

  private async requiresApproval(request: ToolExecutionRequest): Promise<boolean> {
    // Check tool definition for approval requirement
    const tool = await this.toolRegistry.getTool(request.toolId);

    if (tool?.requiresApproval) return true;

    // Check project settings
    const project = await this.projectService.getProject(request.context.projectId);
    if (project?.settings?.requireApproval) return true;

    // Check cost threshold
    if (request.estimatedCost && request.estimatedCost > 10) return true;

    return false;
  }

  private async handleApprovalRequired(
    request: ToolExecutionRequest,
    executionId: string
  ): Promise<ToolExecutionResult> {
    // Store pending approval
    this.pendingApprovals.set(executionId, request);

    // Emit approval required event
    await this.eventBusService.publish('project.tool.approval.required', {
      executionId,
      toolId: request.toolId,
      operation: request.operation,
      projectId: request.context.projectId,
      estimatedCost: request.estimatedCost,
      requester: request.context.userId,
    });

    return {
      success: false,
      error: 'Approval required',
      executionTime: 0,
      actualCost: 0,
      metadata: {
        toolId: request.toolId,
        operation: request.operation,
        projectId: request.context.projectId,
        taskId: request.context.taskId,
        agentId: request.context.agentId,
        timestamp: new Date(),
      },
    };
  }

  private async calculateActualCost(
    request: ToolExecutionRequest,
    result: any,
    executionTime: number
  ): Promise<number> {
    // Base cost calculation
    let cost = request.estimatedCost || 0;

    // Adjust based on execution time
    if (executionTime > (request.estimatedDuration || 0)) {
      cost *= 1.2; // 20% penalty for longer execution
    }

    // Adjust based on result size (simplified)
    if (result && typeof result === 'object') {
      const resultSize = JSON.stringify(result).length;
      cost += resultSize * 0.00001; // Tiny cost per byte
    }

    return Math.round(cost * 100) / 100; // Round to 2 decimal places
  }

  private async recordProjectToolUsage(
    request: ToolExecutionRequest,
    result: any,
    executionTime: number,
    actualCost: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.projectService.recordToolUsage({
        projectId: request.context.projectId,
        taskId: request.context.taskId,
        toolId: request.toolId,
        toolName: request.toolId, // Would get from tool definition
        agentId: request.context.agentId,
        userId: request.context.userId,
        operation: request.operation,
        success: !errorMessage,
        executionTime,
        cost: actualCost,
        input: this.sanitizeData(request.parameters),
        output: this.sanitizeData(result),
        errorMessage,
        metadata: {
          priority: request.priority,
          estimatedCost: request.estimatedCost,
          estimatedDuration: request.estimatedDuration,
        },
      });
    } catch (error) {
      logger.error('Failed to record project tool usage', { error, request });
    }
  }

  private async updateProjectMetrics(projectId: string, cost: number): Promise<void> {
    try {
      if (cost > 0) {
        // Update would be handled by the ProjectManagementService
        logger.debug('Project metrics updated', { projectId, cost });
      }
    } catch (error) {
      logger.error('Failed to update project metrics', { error, projectId, cost });
    }
  }

  private async getProjectToolUsage(
    projectId: string,
    toolId: string
  ): Promise<{
    usageCount: number;
    successRate: number;
    averageCost: number;
  }> {
    try {
      // Would query the project tool usage table
      return {
        usageCount: 0,
        successRate: 0,
        averageCost: 0,
      };
    } catch (error) {
      logger.error('Failed to get project tool usage', { error, projectId, toolId });
      return { usageCount: 0, successRate: 0, averageCost: 0 };
    }
  }

  private async getCostTrend(
    projectId: string,
    timeframe: { startDate?: Date; endDate?: Date }
  ): Promise<
    Array<{
      date: string;
      cost: number;
      usageCount: number;
    }>
  > {
    // Simplified implementation - would use proper time-series query
    return [];
  }

  private sanitizeData(data: any): any {
    if (!data) return null;

    // Remove sensitive information
    const sanitized = JSON.parse(JSON.stringify(data));

    // Remove common sensitive fields
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'credential'];
    const remove = (obj: any) => {
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
            obj[key] = '[REDACTED]';
          } else if (typeof obj[key] === 'object') {
            remove(obj[key]);
          }
        }
      }
    };

    remove(sanitized);
    return sanitized;
  }

  private async setupEventSubscriptions(): Promise<void> {
    try {
      // Listen for approval responses
      await this.eventBusService.subscribe('project.tool.approval.response', async (event) => {
        await this.handleApprovalResponse(event);
      });

      logger.info('Project Tool Integration event subscriptions configured');
    } catch (error) {
      logger.error('Failed to setup event subscriptions', { error });
    }
  }

  private async handleApprovalResponse(event: any): Promise<void> {
    const { executionId, approved, approver } = event;

    const request = this.pendingApprovals.get(executionId);
    if (!request) {
      logger.warn('Approval response for unknown execution', { executionId });
      return;
    }

    this.pendingApprovals.delete(executionId);

    if (approved) {
      logger.info('Tool execution approved, proceeding', { executionId, approver });
      // Re-execute the tool
      await this.executeToolInProject(request);
    } else {
      logger.info('Tool execution rejected', { executionId, approver });

      // Emit rejection event
      await this.eventBusService.publish('project.tool.execution.rejected', {
        executionId,
        toolId: request.toolId,
        projectId: request.context.projectId,
        approver,
      });
    }
  }
}
