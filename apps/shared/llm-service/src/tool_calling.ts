import type {
  AvailableTool,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  ToolExecutionResult,
  ToolSuggestion,
} from '@uaip/types';
import { logger } from '@uaip/utils';

export interface AssignedToolRef {
  toolId: string;
  toolName: string;
  serverName: string;
  enabled?: boolean;
}

export interface ResolvedToolSchema {
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolSchemaResolver = (assigned: AssignedToolRef) => ResolvedToolSchema | null;

export type ToolCallExecutor = (call: LLMToolCall) => Promise<ToolExecutionResult>;

export interface ToolCallingLoopOptions {
  request: LLMRequest;
  callProvider: (request: LLMRequest) => Promise<LLMResponse>;
  executeTool: ToolCallExecutor;
  requiresApproval?: (call: LLMToolCall) => boolean;
  maxIterations?: number;
}

const DEFAULT_MAX_ITERATIONS = 5;

/**
 * Turns an agent's stored tool assignments into the tool definitions a model can
 * be offered. A tool whose schema cannot be resolved is dropped rather than
 * failing the whole turn — a stale assignment must not break chat.
 */
export function buildAvailableTools(
  assignedTools: AssignedToolRef[],
  resolveSchema: ToolSchemaResolver
): AvailableTool[] {
  const available: AvailableTool[] = [];

  for (const assigned of assignedTools) {
    if (assigned.enabled === false) continue;

    const schema = resolveSchema(assigned);
    if (!schema) {
      logger.warn('Skipping agent tool with unresolvable schema', {
        toolId: assigned.toolId,
        toolName: assigned.toolName,
        serverName: assigned.serverName,
      });
      continue;
    }

    available.push({
      name: assigned.toolName,
      description: schema.description,
      parameters: schema.parameters,
    });
  }

  return available;
}

function renderToolOutcome(result: ToolExecutionResult): string {
  const payload = result.success ? JSON.stringify(result.result) : `ERROR: ${result.error}`;
  return `Tool ${result.toolName} returned: ${payload}`;
}

function toSuggestion(call: LLMToolCall): ToolSuggestion {
  let parameters: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(call.function.arguments || '{}');
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      parameters = parsed as Record<string, unknown>;
    }
  } catch {
    parameters = { raw: call.function.arguments };
  }

  return {
    toolId: call.id,
    toolName: call.function.name,
    parameters,
    confidence: 1,
    reasoning: 'Requires approval before execution',
  };
}

/**
 * Drives the model → tool_calls → execute → feed result back → model cycle.
 *
 * The loop is hard-bounded: a model that keeps requesting tools must terminate,
 * so `maxIterations` provider calls is the ceiling regardless of what it asks
 * for. Tools gated behind approval are reported as suggestions and never run.
 */
export async function runToolCallingLoop(options: ToolCallingLoopOptions): Promise<LLMResponse> {
  const { request, callProvider, executeTool, requiresApproval } = options;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const executed: ToolExecutionResult[] = [];
  const pendingApproval: ToolSuggestion[] = [];
  let currentRequest: LLMRequest = request;
  let response: LLMResponse = await callProvider(currentRequest);
  let iterations = 1;

  while (
    response.finishReason === 'tool_calls' &&
    response.toolCalls !== undefined &&
    response.toolCalls.length > 0
  ) {
    const transcript: string[] = [];

    for (const call of response.toolCalls) {
      if (requiresApproval?.(call) === true) {
        pendingApproval.push(toSuggestion(call));
        transcript.push(
          `Tool ${call.function.name} requires human approval and was not executed.`
        );
        continue;
      }

      try {
        const result = await executeTool(call);
        executed.push(result);
        transcript.push(renderToolOutcome(result));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failure: ToolExecutionResult = {
          toolId: call.id,
          toolName: call.function.name,
          success: false,
          error: message,
          timestamp: new Date().toISOString(),
        };
        executed.push(failure);
        transcript.push(renderToolOutcome(failure));
        logger.warn('Agent tool execution failed', { tool: call.function.name, error: message });
      }
    }

    if (iterations >= maxIterations) {
      logger.warn('Tool calling loop hit its iteration ceiling', { maxIterations });
      break;
    }

    currentRequest = {
      ...currentRequest,
      prompt: `${currentRequest.prompt}\n\n${transcript.join('\n')}`,
    };

    response = await callProvider(currentRequest);
    iterations += 1;
  }

  if (executed.length === 0 && pendingApproval.length === 0) {
    return response;
  }

  return {
    ...response,
    ...(executed.length > 0 ? { toolsExecuted: executed } : {}),
    ...(pendingApproval.length > 0 ? { suggestedTools: pendingApproval } : {}),
  };
}
