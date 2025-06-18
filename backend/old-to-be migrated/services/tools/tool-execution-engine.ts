// Tool Execution Engine for Council of Nycea
// Handles tool execution, monitoring, retries, and result management

import { 
  ToolCall, 
  ToolExecution, 
  ToolExecutionEngine, 
  ToolExecutionError,
  ToolEvent,
  ToolEventHandler
} from '../../types/tool';
import { toolRegistry } from './tool-registry';
import { BaseToolExecutor } from './base-tools';
import { mcpToolBridge } from '../mcp/mcp-tool-bridge';

export class InMemoryToolExecutionEngine implements ToolExecutionEngine {
  private executions: Map<string, ToolExecution> = new Map();
  private eventHandlers: Set<ToolEventHandler> = new Set();
  private activeExecutions: Set<string> = new Set();
  private maxConcurrentExecutions = 10;

  async execute(toolCall: ToolCall, agentId: string): Promise<ToolExecution> {
    // Check concurrent execution limits
    if (this.activeExecutions.size >= this.maxConcurrentExecutions) {
      throw new Error('Maximum concurrent executions reached');
    }

    // Get tool definition
    const tool = await toolRegistry.get(toolCall.toolId);
    if (!tool) {
      throw new Error(`Tool ${toolCall.toolId} not found`);
    }

    if (!tool.isEnabled) {
      throw new Error(`Tool ${toolCall.toolId} is disabled`);
    }

    // Create execution record
    const execution: ToolExecution = {
      id: crypto.randomUUID(),
      toolId: toolCall.toolId,
      agentId,
      parameters: toolCall.parameters,
      status: tool.requiresApproval ? 'approval-required' : 'pending',
      startTime: new Date(),
      approvalRequired: tool.requiresApproval,
      retryCount: 0,
      maxRetries: 3,
      metadata: {
        reasoning: toolCall.reasoning,
        confidence: toolCall.confidence,
        alternatives: toolCall.alternatives || [],
        isMCPTool: mcpToolBridge.isMCPTool(toolCall.toolId)
      }
    };

    // Store execution
    this.executions.set(execution.id, execution);

    // Emit start event
    await this.emitEvent({
      type: 'execution-started',
      payload: {
        executionId: execution.id,
        toolId: toolCall.toolId,
        agentId
      }
    });

    // If approval required, emit approval request
    if (tool.requiresApproval) {
      await this.emitEvent({
        type: 'approval-requested',
        payload: {
          executionId: execution.id,
          toolId: toolCall.toolId,
          agentId
        }
      });
    } else {
      // Execute immediately
      this.executeInBackground(execution);
    }

    return execution;
  }

  private async executeInBackground(execution: ToolExecution): Promise<void> {
    this.activeExecutions.add(execution.id);
    
    try {
      // Update status
      execution.status = 'running';
      
      // Get tool definition
      const tool = await toolRegistry.get(execution.toolId);
      if (!tool) {
        throw new Error(`Tool ${execution.toolId} not found during execution`);
      }

      // Execute the tool
      const startTime = Date.now();
      const result = await this.executeToolLogic(execution.toolId, execution.parameters);
      const executionTime = Date.now() - startTime;

      // Update execution with result
      execution.status = 'completed';
      execution.endTime = new Date();
      execution.result = result;
      execution.executionTimeMs = executionTime;
      execution.cost = tool.costEstimate || 0;

      // Emit completion event
      await this.emitEvent({
        type: 'execution-completed',
        payload: {
          executionId: execution.id,
          success: true,
          duration: executionTime
        }
      });

    } catch (error) {
      // Handle execution error
      const toolError: ToolExecutionError = error instanceof Error 
        ? {
            type: 'execution',
            message: error.message,
            recoverable: true,
            suggestedAction: 'Retry with different parameters or contact support'
          }
        : error as ToolExecutionError;

      execution.status = 'failed';
      execution.endTime = new Date();
      execution.error = toolError;

      // Emit failure event
      await this.emitEvent({
        type: 'execution-failed',
        payload: {
          executionId: execution.id,
          error: toolError
        }
      });

      // Attempt retry if recoverable
      if (toolError.recoverable && execution.retryCount < execution.maxRetries) {
        console.log(`Retrying execution ${execution.id}, attempt ${execution.retryCount + 1}`);
        setTimeout(() => {
          this.retryExecution(execution.id);
        }, Math.pow(2, execution.retryCount) * 1000); // Exponential backoff
      }
    } finally {
      this.activeExecutions.delete(execution.id);
    }
  }

  private async executeToolLogic(toolId: string, parameters: any): Promise<any> {
    // Check if this is an MCP tool
    if (mcpToolBridge.isMCPTool(toolId)) {
      console.log(`Executing MCP tool: ${toolId}`);
      return mcpToolBridge.executeMCPTool(toolId, parameters);
    }

    // Route to appropriate base tool executor
    switch (toolId) {
      case 'math-calculator':
        return BaseToolExecutor.executeMathCalculator(parameters);
      
      case 'text-analysis':
        return BaseToolExecutor.executeTextAnalysis(parameters);
      
      case 'time-utility':
        return BaseToolExecutor.executeTimeUtility(parameters);
      
      case 'uuid-generator':
        return BaseToolExecutor.executeUuidGenerator(parameters);
      
      default:
        throw new Error(`No executor found for tool: ${toolId}`);
    }
  }

  async getExecution(executionId: string): Promise<ToolExecution | null> {
    return this.executions.get(executionId) || null;
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return false;
    }

    if (execution.status === 'running') {
      execution.status = 'cancelled';
      execution.endTime = new Date();
      this.activeExecutions.delete(executionId);
      return true;
    }

    return false;
  }

  async getActiveExecutions(agentId?: string): Promise<ToolExecution[]> {
    const executions = Array.from(this.executions.values())
      .filter(exec => exec.status === 'running' || exec.status === 'pending');
    
    if (agentId) {
      return executions.filter(exec => exec.agentId === agentId);
    }
    
    return executions;
  }

  async retryExecution(executionId: string): Promise<ToolExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.retryCount >= execution.maxRetries) {
      throw new Error(`Maximum retries exceeded for execution ${executionId}`);
    }

    // Reset execution state for retry
    execution.retryCount++;
    execution.status = 'pending';
    execution.error = undefined;
    execution.endTime = undefined;
    execution.result = undefined;

    // Execute in background
    this.executeInBackground(execution);
    
    return execution;
  }

  // Approval system
  async approveExecution(executionId: string, approverId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return false;
    }

    if (execution.status !== 'approval-required') {
      return false;
    }

    execution.approvedBy = approverId;
    execution.approvedAt = new Date();

    // Emit approval event
    await this.emitEvent({
      type: 'approval-granted',
      payload: {
        executionId,
        approvedBy: approverId
      }
    });

    // Start execution
    this.executeInBackground(execution);
    
    return true;
  }

  // Event system
  addEventListener(handler: ToolEventHandler): void {
    this.eventHandlers.add(handler);
  }

  removeEventListener(handler: ToolEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  private async emitEvent(event: ToolEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Error in tool event handler:', error);
      }
    }
  }

  // Monitoring and statistics
  async getExecutionStats(): Promise<{
    totalExecutions: number;
    activeExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    successRate: number;
    mcpToolExecutions: number;
    baseToolExecutions: number;
  }> {
    const executions = Array.from(this.executions.values());
    const completed = executions.filter(e => e.status === 'completed');
    const failed = executions.filter(e => e.status === 'failed');
    const active = executions.filter(e => e.status === 'running' || e.status === 'pending');

    const totalWithTime = completed.filter(e => e.executionTimeMs !== undefined);
    const averageExecutionTime = totalWithTime.length > 0
      ? totalWithTime.reduce((sum, e) => sum + (e.executionTimeMs || 0), 0) / totalWithTime.length
      : 0;

    const successRate = executions.length > 0
      ? completed.length / (completed.length + failed.length)
      : 0;

    // Count MCP vs base tool executions
    const mcpToolExecutions = executions.filter(e => e.metadata?.isMCPTool).length;
    const baseToolExecutions = executions.length - mcpToolExecutions;

    return {
      totalExecutions: executions.length,
      activeExecutions: active.length,
      completedExecutions: completed.length,
      failedExecutions: failed.length,
      averageExecutionTime,
      successRate,
      mcpToolExecutions,
      baseToolExecutions
    };
  }

  async getExecutionHistory(agentId?: string, limit = 50): Promise<ToolExecution[]> {
    let executions = Array.from(this.executions.values());
    
    if (agentId) {
      executions = executions.filter(e => e.agentId === agentId);
    }

    return executions
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  // Clean up old executions
  async cleanupOldExecutions(olderThanDays = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [id, execution] of this.executions.entries()) {
      if (execution.endTime && execution.endTime < cutoffDate) {
        this.executions.delete(id);
        cleanedCount++;
      }
    }

    console.log(`Cleaned up ${cleanedCount} old executions`);
    return cleanedCount;
  }

  // MCP-specific methods
  async getMCPExecutionStats(): Promise<{
    totalMCPExecutions: number;
    mcpExecutionsByServer: Record<string, number>;
    averageMCPExecutionTime: number;
    mcpSuccessRate: number;
  }> {
    const mcpExecutions = Array.from(this.executions.values())
      .filter(e => e.metadata?.isMCPTool);

    const mcpExecutionsByServer: Record<string, number> = {};
    const completedMCP = mcpExecutions.filter(e => e.status === 'completed');
    const failedMCP = mcpExecutions.filter(e => e.status === 'failed');

    // Count by server
    for (const execution of mcpExecutions) {
      const serverId = mcpToolBridge.getMCPServerForTool(execution.toolId);
      if (serverId) {
        mcpExecutionsByServer[serverId] = (mcpExecutionsByServer[serverId] || 0) + 1;
      }
    }

    const mcpWithTime = completedMCP.filter(e => e.executionTimeMs !== undefined);
    const averageMCPExecutionTime = mcpWithTime.length > 0
      ? mcpWithTime.reduce((sum, e) => sum + (e.executionTimeMs || 0), 0) / mcpWithTime.length
      : 0;

    const mcpSuccessRate = mcpExecutions.length > 0
      ? completedMCP.length / (completedMCP.length + failedMCP.length)
      : 0;

    return {
      totalMCPExecutions: mcpExecutions.length,
      mcpExecutionsByServer,
      averageMCPExecutionTime,
      mcpSuccessRate
    };
  }
}

// Singleton instance
export const toolExecutionEngine = new InMemoryToolExecutionEngine();

// Helper functions
export async function executeToolCall(toolCall: ToolCall, agentId: string): Promise<ToolExecution> {
  return toolExecutionEngine.execute(toolCall, agentId);
}

export async function getToolExecutionStatus(executionId: string): Promise<ToolExecution | null> {
  return toolExecutionEngine.getExecution(executionId);
}

export async function approveToolExecution(executionId: string, approverId: string): Promise<boolean> {
  return toolExecutionEngine.approveExecution(executionId, approverId);
} 