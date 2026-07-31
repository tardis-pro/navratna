import type { LLMToolCall, ToolExecutionResult } from '@uaip/types';
import { logger } from '@uaip/utils';

export interface ToolExecutionRpcBus {
  publishAndWaitForResponse<T = unknown>(
    eventType: string,
    data: unknown,
    timeout?: number
  ): Promise<T>;
}

export interface AgentToolBinding {
  toolId: string;
  toolName: string;
  serverName: string;
  enabled?: boolean;
  requiresApproval?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Bridges an LLM tool call to the capability-registry tool executor over the
 * event bus. It is RPC over BullMQ rather than a direct import so llm-service
 * keeps no build dependency on capability-registry.
 */
export class AgentToolExecutor {
  private readonly bindingsByName = new Map<string, AgentToolBinding>();

  constructor(
    private readonly eventBus: ToolExecutionRpcBus,
    bindings: AgentToolBinding[],
    private readonly timeoutMs: number = 30000
  ) {
    for (const binding of bindings) {
      this.bindingsByName.set(binding.toolName, binding);
    }
  }

  requiresApproval(toolName: string): boolean {
    return this.bindingsByName.get(toolName)?.requiresApproval === true;
  }

  async execute(
    call: LLMToolCall,
    agentId?: string,
    userId?: string
  ): Promise<ToolExecutionResult> {
    const binding = this.bindingsByName.get(call.function.name);
    const parameters = parseArguments(call.function.arguments);
    const timestamp = new Date().toISOString();

    if (!binding) {
      return {
        toolId: call.id,
        toolName: call.function.name,
        success: false,
        error: `Tool ${call.function.name} is not bound to this agent`,
        timestamp,
        parameters,
      };
    }

    const response = await this.eventBus.publishAndWaitForResponse<unknown>(
      'tool.execute.request',
      {
        requestId: call.id,
        toolId: binding.toolId,
        agentId: agentId ?? '',
        userId,
        parameters,
      },
      this.timeoutMs
    );

    const envelope = isRecord(response) ? response : {};
    const status = typeof envelope.status === 'string' ? envelope.status : 'FAILED';
    const success = status === 'SUCCESS';

    if (!success) {
      logger.warn('Agent tool execution reported failure', {
        toolName: binding.toolName,
        status,
      });
    }

    return {
      toolId: binding.toolId,
      toolName: binding.toolName,
      success,
      result: envelope.result,
      error: success
        ? undefined
        : typeof envelope.error === 'string'
          ? envelope.error
          : `Tool execution ${status}`,
      timestamp,
      parameters,
    };
  }
}
