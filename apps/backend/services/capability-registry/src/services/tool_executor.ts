// Tool Executor Service - Enhanced with Usage Tracking
// Handles tool execution with PostgreSQL logging and Neo4j usage pattern tracking
// Part of capability-registry microservice

import { ToolDefinition, ToolExecution, ToolExecutionStatus } from '@uaip/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const executionStatusValues = new Set<unknown>(Object.values(ToolExecutionStatus));
function isToolExecutionStatus(v: unknown): v is ToolExecutionStatus {
  return executionStatusValues.has(v);
}
import { ToolService } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/infra/database';
import { logger, InternalServerError, NotFoundError } from '@uaip/utils';
import { ToolRegistry } from './tool_registry.js';
import { BaseToolExecutor } from './base_tool_executor.js';
import { config } from '../config/config.js';
import { ExecutionScheduler } from './execution_mesh/scheduler.js';
import { resolveToolDescriptor } from './execution_mesh/descriptor.js';
import type { ExecutionRequestEnvelope } from '@uaip/types';
import { randomUUID } from 'node:crypto';

import { z } from 'zod';

// Validation schemas
const ExecutionParametersSchema = z.object({
  toolId: z.string().min(1),
  agentId: z.string().min(1),
  parameters: z.record(z.any()),
  timeout: z.number().positive().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

export interface ExecutionOptions {
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
  retryOnFailure?: boolean;
  maxRetries?: number;
}

export class ToolExecutor {
  private toolService: ToolService;

  private asRecord(value: unknown): Record<string, unknown> {
    if (isRecord(value)) return value;
    return {};
  }

  private mapRecordToExecution(record: Record<string, unknown>): ToolExecution {
    const status = isToolExecutionStatus(record.status)
      ? record.status
      : ToolExecutionStatus.PENDING;
    return {
      id: typeof record.id === 'string' ? record.id : '',
      toolId: typeof record.toolId === 'string' ? record.toolId : '',
      agentId: typeof record.agentId === 'string' ? record.agentId : '',
      parameters: this.asRecord(record.parameters),
      status,
      startTime: record.startTime instanceof Date ? record.startTime : new Date(String(record.startTime ?? '')),
      endTime: record.endTime instanceof Date ? record.endTime : (record.endTime ? new Date(String(record.endTime)) : undefined),
      result: record.result,
      error: undefined,
      approvalRequired: Boolean(record.approvalRequired),
      approvedBy: typeof record.approvedBy === 'string' ? record.approvedBy : undefined,
      approvedAt: record.approvedAt instanceof Date ? record.approvedAt : undefined,
      cost: typeof record.cost === 'number' ? record.cost : undefined,
      executionTimeMs: typeof record.executionTimeMs === 'number' ? record.executionTimeMs : undefined,
      retryCount: typeof record.retryCount === 'number' ? record.retryCount : 0,
      maxRetries: typeof record.maxRetries === 'number' ? record.maxRetries : 3,
      metadata: this.asRecord(record.metadata),
      success: Boolean(record.success),
      data: record.data,
    };
  }

  constructor(
    private postgresql: DatabaseService,
    private toolRegistry: ToolRegistry,
    private baseExecutor: BaseToolExecutor
  ) {
    this.toolService = ToolService.getInstance();
  }

  async executeTool(
    toolId: string,
    agentId: string,
    parameters: Record<string, unknown>,
    options: ExecutionOptions = {}
  ): Promise<ToolExecution> {
    // Validate input parameters
    const validatedInput = ExecutionParametersSchema.parse({
      toolId,
      agentId,
      parameters,
      timeout: options.timeout,
      priority: options.priority,
    });

    // Get tool definition
    const tool = await this.toolRegistry.getTool(toolId);
    if (!tool) {
      throw new NotFoundError(`Tool ${toolId} not found`);
    }

    if (!tool.isEnabled) {
      throw new InternalServerError(`Tool ${toolId} is disabled`);
    }

    // Create execution record
    const execution: ToolExecution = {
      id: `execution_${Date.now()}_${toolId}_${agentId}`,
      toolId,
      agentId,
      parameters: validatedInput.parameters,
      status: ToolExecutionStatus.PENDING,
      startTime: new Date(),
      approvalRequired: tool.requiresApproval,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      success: false,
      data: null,
      metadata: {
        priority: options.priority || 'normal',
        timeout: options.timeout || 30000,
        retryOnFailure: options.retryOnFailure || false,
      },
    };

    try {
      // Store initial execution record
      await this.toolService.createToolExecution({
        toolId: execution.toolId,
        agentId: execution.agentId,
        parameters: execution.parameters,
        status: execution.status,
        startTime: execution.startTime,
        approvalRequired: execution.approvalRequired,
        retryCount: execution.retryCount,
        maxRetries: execution.maxRetries,
      });

      // Check if approval is required
      if (tool.requiresApproval) {
        execution.status = ToolExecutionStatus.APPROVAL_REQUIRED;
        await this.toolService.updateToolExecution(execution.id, {
          status: ToolExecutionStatus.APPROVAL_REQUIRED,
        });
        logger.info(`Tool execution requires approval: ${execution.id}`);
        return execution;
      }

      // Execute the tool
      return await this.performExecution(execution, tool);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(`Failed to initiate tool execution ${execution.id}:`, error);
      execution.status = ToolExecutionStatus.FAILED;
      execution.error = {
        type: 'execution',
        message: errorMessage,
        details: { stack: errorStack },
        recoverable: false,
      };
      execution.endTime = new Date();

      await this.toolService.updateToolExecution(execution.id, {
        status: execution.status,
        error:
          typeof execution.error === 'string' ? execution.error : JSON.stringify(execution.error),
        metadata: {
          ...this.asRecord(execution.metadata),
          endTime: execution.endTime?.toISOString(),
        },
      });
      await this.recordUsage(execution, false);

      throw error;
    }
  }

  private async performExecution(
    execution: ToolExecution,
    tool: ToolDefinition
  ): Promise<ToolExecution> {
    const startTime = Date.now();

    try {
      // Update status to running
      execution.status = ToolExecutionStatus.RUNNING;
      await this.toolService.updateToolExecution(execution.id, {
        status: ToolExecutionStatus.RUNNING,
      });

      // Execute the tool logic
      const timeout =
        typeof execution.metadata?.timeout === 'number' ? execution.metadata.timeout : 30000;
      const result = await this.executeToolLogic(execution.toolId, execution.parameters, timeout);

      const executionTime = Date.now() - startTime;

      // Update execution with success
      execution.status = ToolExecutionStatus.COMPLETED;
      const resultRecord = this.asRecord(result);
      execution.result = resultRecord;
      execution.endTime = new Date();
      execution.executionTimeMs = executionTime;
      execution.cost = this.calculateCost(tool, executionTime);

      await this.toolService.updateToolExecution(execution.id, {
        status: ToolExecutionStatus.COMPLETED,
        result: resultRecord,
        duration: executionTime,
        cost: String(execution.cost),
        metadata: {
          ...this.asRecord(execution.metadata),
          endTime: execution.endTime?.toISOString(),
          executionTimeMs: executionTime,
        },
      });

      // Record successful usage
      await this.recordUsage(execution, true);
      await this.recordToolUsage(execution, true, executionTime);
      // Usage pattern tracking handled by knowledge graph service

      logger.info(`Tool execution completed: ${execution.id} (${executionTime}ms)`);
      return execution;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const executionTime = Date.now() - startTime;

      // Update execution with failure
      execution.status = ToolExecutionStatus.FAILED;
      execution.error = {
        type: this.categorizeError(error),
        message: errorMessage,
        details: { stack: errorStack },
        recoverable: this.isRecoverableError(error),
      };
      execution.endTime = new Date();
      execution.executionTimeMs = executionTime;

      await this.toolService.updateToolExecution(execution.id, {
        status: ToolExecutionStatus.FAILED,
        error:
          typeof execution.error === 'string' ? execution.error : JSON.stringify(execution.error),
        duration: executionTime,
        metadata: {
          ...this.asRecord(execution.metadata),
          endTime: execution.endTime?.toISOString(),
          executionTimeMs: executionTime,
        },
      });

      // Record failed usage
      await this.recordUsage(execution, false);
      await this.recordToolUsage(execution, false, executionTime);
      // Usage pattern tracking handled by knowledge graph service

      logger.error(`Tool execution failed: ${execution.id} (${executionTime}ms)`, error);

      // Retry if configured and error is recoverable
      if (
        execution.metadata?.retryOnFailure &&
        execution.error.recoverable &&
        execution.retryCount < execution.maxRetries
      ) {
        return await this.retryExecution(execution.id);
      }

      throw error;
    }
  }

  // Usage recording
  private async recordToolUsage(
    execution: ToolExecution,
    success: boolean,
    executionTime: number
  ): Promise<void> {
    try {
      await this.toolRegistry.recordToolUsage(
        execution.toolId,
        execution.agentId,
        executionTime,
        success,
        execution.cost,
        {
          executionId: execution.id,
          priority: execution.metadata?.priority,
          retryCount: execution.retryCount,
          error: execution.error,
        }
      );
    } catch (error) {
      logger.error(`Failed to record tool usage:`, error);
      // Don't throw - usage tracking shouldn't break execution
    }
  }

  async retryExecution(executionId: string): Promise<ToolExecution> {
    const executionRecord = await this.toolService.getToolExecution(executionId);
    if (!executionRecord) {
      throw new NotFoundError(`Execution ${executionId} not found`);
    }

    const execution = this.mapRecordToExecution(executionRecord);

    if (execution.retryCount >= execution.maxRetries) {
      throw new InternalServerError(`Maximum retries exceeded for execution ${executionId}`);
    }

    // Increment retry count
    execution.retryCount++;
    execution.status = ToolExecutionStatus.PENDING;
    execution.startTime = new Date();
    execution.endTime = undefined;
    execution.error = undefined;

    await this.toolService.updateToolExecution(executionId, {
      status: ToolExecutionStatus.PENDING,
      error: null,
      metadata: {
        ...this.asRecord(execution.metadata),
        retryCount: execution.retryCount,
        startTime: execution.startTime.toISOString(),
        endTime: null,
      },
    });

    logger.info(`Retrying tool execution: ${executionId} (attempt ${execution.retryCount})`);

    const tool = await this.toolRegistry.getTool(execution.toolId);
    if (!tool) {
      throw new NotFoundError(`Tool ${execution.toolId} not found`);
    }
    return await this.performExecution(execution, tool);
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    try {
      const execution = await this.toolService.getToolExecution(executionId);
      if (!execution) {
        return false;
      }

      if (
        execution.status === ToolExecutionStatus.COMPLETED ||
        execution.status === ToolExecutionStatus.FAILED ||
        execution.status === ToolExecutionStatus.CANCELLED
      ) {
        return false; // Cannot cancel already finished executions
      }

      await this.toolService.updateToolExecution(executionId, {
        status: ToolExecutionStatus.CANCELLED,
        metadata: {
          ...this.asRecord(execution.metadata),
          endTime: new Date().toISOString(),
          cancelledAt: new Date().toISOString(),
        },
      });

      logger.info(`Tool execution cancelled: ${executionId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to cancel execution ${executionId}:`, error);
      return false;
    }
  }

  async approveExecution(executionId: string, approvedBy: string): Promise<ToolExecution> {
    const executionRecord = await this.toolService.getToolExecution(executionId);
    if (!executionRecord) {
      throw new NotFoundError(`Execution ${executionId} not found`);
    }

    const execution = this.mapRecordToExecution(executionRecord);

    if (execution.status !== ToolExecutionStatus.APPROVAL_REQUIRED) {
      throw new InternalServerError(`Execution ${executionId} does not require approval`);
    }

    // Update approval status
    await this.toolService.updateToolExecution(executionId, {
      status: ToolExecutionStatus.PENDING,
      metadata: {
        ...this.asRecord(execution.metadata),
        approvedBy,
        approvedAt: new Date().toISOString(),
      },
    });

    execution.approvedBy = approvedBy;
    execution.approvedAt = new Date();
    execution.status = ToolExecutionStatus.PENDING;

    logger.info(`Tool execution approved: ${executionId} by ${approvedBy}`);

    // Now execute the tool
    const tool = await this.toolRegistry.getTool(execution.toolId);
    if (!tool) {
      throw new NotFoundError(`Tool ${execution.toolId} not found`);
    }
    return await this.performExecution(execution, tool);
  }

  // Execution Management
  async getExecution(executionId: string): Promise<ToolExecution | null> {
    const record = await this.toolService.getToolExecution(executionId);
    if (!record) return null;
    return this.mapRecordToExecution(record);
  }

  async getExecutions(
    toolId?: string,
    agentId?: string,
    status?: string,
    limit = 100
  ): Promise<ToolExecution[]> {
    const filters: { toolId?: string; agentId?: string; status?: string; limit: number } = {
      limit,
    };
    if (toolId) filters.toolId = toolId;
    if (agentId) filters.agentId = agentId;
    if (status) filters.status = status;
    const records = await this.toolService.findExecutionsByTool(
      filters.toolId || '',
      filters.limit
    );
    return records.map((r) => this.mapRecordToExecution(r));
  }

  async getActiveExecutions(agentId?: string): Promise<ToolExecution[]> {
    const filters: {
      toolId?: string;
      agentId?: string;
      status: ToolExecutionStatus;
      limit?: number;
    } = {
      status: ToolExecutionStatus.RUNNING,
    };
    if (agentId) filters.agentId = agentId;
    const records = await this.toolService.findExecutionsByTool(
      filters.toolId || '',
      filters.limit
    );
    return records.map((r) => this.mapRecordToExecution(r));
  }

  // Private Helper Methods
  private async executeToolLogic(
    toolId: string,
    parameters: Record<string, unknown>,
    timeout: number
  ): Promise<unknown> {
    // Hybrid Execution Mesh (spec 11) — only when explicitly enabled. When the
    // flag is OFF this branch is skipped entirely and the legacy in-process path
    // below runs byte-for-byte unchanged.
    if (config.execMesh.enabled) {
      return this.executeViaMesh(toolId, parameters, timeout);
    }

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tool execution timeout')), timeout);
    });

    // Execute the tool with timeout
    const executionPromise = this.baseExecutor.execute(toolId, parameters);

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Route a tool execution through the Execution Mesh scheduler. The native node
   * wraps this same BaseToolExecutor, so with nothing deployed every call resolves
   * to `native` and behaves like the legacy path — just via the scheduler.
   */
  private async executeViaMesh(
    toolId: string,
    parameters: Record<string, unknown>,
    timeout: number
  ): Promise<unknown> {
    const scheduler = ExecutionScheduler.getInstance();
    // Register the native node (idempotent) wrapping the legacy executor.
    scheduler.ensureNativeNode((tid, params) => this.baseExecutor.execute(tid, params));

    // Phase 1b: source a real descriptor from the tool's registry / MCP config.
    // stdio MCP tools now route to `docker-mcp`; the scheduler still falls back to
    // native when no docker-mcp node is registered, so behaviour is preserved until
    // the node-agent is deployed on EC2. Unknown/native tools resolve to `native`.
    const descriptor = await resolveToolDescriptor(toolId);
    const runtime = scheduler.resolveRuntime(descriptor);

    const envelope: ExecutionRequestEnvelope = {
      correlationId: `corr_${Date.now()}_${randomUUID().slice(0, 8)}`,
      toolId,
      params: parameters,
      // Phase 2+ STUB: scoped, short-lived per-call token minting (spec §4, §7).
      // Plumbed end-to-end now (node injects ctx.scopedToken into the container
      // env); real minting via the JWKS/ENCRYPTION_KEY machinery lands later.
      ctx: { userId: 'system', scopedToken: 'system' },
      runtime,
      sandbox: descriptor.sandbox,
      deadlineMs: timeout,
      idempotencyKey: `${toolId}_${Date.now()}`,
    };

    const result = await scheduler.schedule(envelope);
    if (!result.ok) {
      throw new InternalServerError(result.error || 'Execution mesh execution failed');
    }
    return result.output;
  }

  private async recordUsage(execution: ToolExecution, success: boolean): Promise<void> {
    try {
      const usage = {
        toolId: execution.toolId,
        agentId: execution.agentId,
        executionId: execution.id,
        executionTime: execution.executionTimeMs,
        success,
        error: execution.error?.message,
      };

      await this.toolService.trackUsage(usage);
    } catch (error) {
      logger.error('Failed to record usage:', error);
    }
  }

  private calculateCost(tool: ToolDefinition, executionTime: number): number {
    // Simple cost calculation based on tool's cost estimate and execution time
    const baseCost = tool.costEstimate ?? 0;
    const timeFactor = executionTime / (tool.executionTimeEstimate || 1000);
    return baseCost * timeFactor;
  }

  private categorizeError(
    error: unknown
  ): 'validation' | 'execution' | 'timeout' | 'permission' | 'quota' | 'dependency' | 'unknown' {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('timeout')) return 'timeout';
    if (errorMessage.includes('permission')) return 'permission';
    if (errorMessage.includes('validation')) return 'validation';
    if (errorMessage.includes('quota')) return 'quota';
    if (errorMessage.includes('dependency')) return 'dependency';
    if (errorMessage.includes('execution')) return 'execution';
    return 'unknown';
  }

  private isRecoverableError(error: unknown): boolean {
    const recoverableTypes = ['timeout', 'quota', 'dependency'];
    const errorType = this.categorizeError(error);
    return recoverableTypes.includes(errorType);
  }

  // Analytics
  async getExecutionStats(toolId?: string, agentId?: string, days = 30): Promise<unknown> {
    const filters: { toolId?: string; agentId?: string; days: number } = { days };
    if (toolId) filters.toolId = toolId;
    if (agentId) filters.agentId = agentId;
    const stats = await this.toolService.getToolUsageStats(
      filters.toolId || '',
      filters.days || 30
    );

    const statsRows = Array.isArray(stats) ? stats.map((stat) => this.asRecord(stat)) : [];

    return {
      totalExecutions: statsRows.reduce(
        (sum: number, stat) => sum + parseInt(String(stat.total_uses ?? '0'), 10),
        0
      ),
      successfulExecutions: statsRows.reduce(
        (sum: number, stat) => sum + parseInt(String(stat.successful_uses ?? '0'), 10),
        0
      ),
      averageExecutionTime:
        statsRows.reduce(
          (sum: number, stat) => sum + parseFloat(String(stat.avg_execution_time ?? '0')),
          0
        ) / (statsRows.length || 1),
      totalCost: statsRows.reduce(
        (sum: number, stat) => sum + parseFloat(String(stat.total_cost ?? '0')),
        0
      ),
      successRate:
        statsRows.length > 0
          ? statsRows.reduce(
              (sum: number, stat) => sum + parseInt(String(stat.successful_uses ?? '0'), 10),
              0
            ) /
            statsRows.reduce(
              (sum: number, stat) => sum + parseInt(String(stat.total_uses ?? '0'), 10),
              0
            )
          : 0,
    };
  }

  // Health Check
  async healthCheck(): Promise<{ status: string; activeExecutions: number }> {
    try {
      const activeExecutions = await this.getActiveExecutions();
      return {
        status: 'healthy',
        activeExecutions: activeExecutions.length,
      };
    } catch (error) {
      logger.error('Tool executor health check failed:', error);
      return {
        status: 'unhealthy',
        activeExecutions: -1,
      };
    }
  }
}
