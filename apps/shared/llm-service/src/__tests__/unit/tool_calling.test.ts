import { describe, expect, it, vi } from 'vitest';
import type { LLMRequest, LLMResponse, LLMToolCall, AvailableTool } from '@uaip/types';
import { buildAvailableTools, runToolCallingLoop } from '../../tool_calling';

const searchTool: AvailableTool = {
  name: 'web-search',
  description: 'Search the web',
  parameters: { type: 'object', properties: { query: { type: 'string' } } },
};

function toolCall(name: string, args: string, id = 'call-1'): LLMToolCall {
  return { id, type: 'function', function: { name, arguments: args } };
}

describe('buildAvailableTools', () => {
  it('maps enabled assigned tools onto their resolved schema', () => {
    const tools = buildAvailableTools(
      [
        { toolId: 't1', toolName: 'web-search', serverName: 'ddg-search', enabled: true },
        { toolId: 't2', toolName: 'disabled-tool', serverName: '', enabled: false },
      ],
      (assigned) =>
        assigned.toolId === 't1'
          ? { description: 'Search the web', parameters: searchTool.parameters }
          : null
    );

    expect(tools).toEqual([searchTool]);
  });

  it('skips tools whose schema cannot be resolved instead of failing the turn', () => {
    const tools = buildAvailableTools(
      [{ toolId: 'gone', toolName: 'ghost', serverName: '', enabled: true }],
      () => null
    );

    expect(tools).toEqual([]);
  });
});

describe('runToolCallingLoop', () => {
  const baseRequest: LLMRequest = { prompt: 'find the docs', tools: [searchTool] };

  it('executes returned tool calls and feeds the result back for a final answer', async () => {
    const callProvider = vi
      .fn<(request: LLMRequest) => Promise<LLMResponse>>()
      .mockResolvedValueOnce({
        content: '',
        model: 'm',
        finishReason: 'tool_calls',
        toolCalls: [toolCall('web-search', '{"query":"navratna docs"}')],
      })
      .mockResolvedValueOnce({ content: 'The docs are at example.com', model: 'm', finishReason: 'stop' });

    const executeTool = vi.fn().mockResolvedValue({
      toolId: 't1',
      toolName: 'web-search',
      success: true,
      result: { hits: ['example.com'] },
      timestamp: new Date().toISOString(),
    });

    const result = await runToolCallingLoop({
      request: baseRequest,
      callProvider,
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls[0][0].function.name).toBe('web-search');

    expect(callProvider).toHaveBeenCalledTimes(2);
    const followUpPrompt = callProvider.mock.calls[1][0].prompt;
    expect(followUpPrompt, 'the tool result must be visible to the model').toContain('example.com');

    expect(result.content).toBe('The docs are at example.com');
    expect(result.toolsExecuted).toHaveLength(1);
    expect(result.toolsExecuted?.[0].toolName).toBe('web-search');
  });

  it('stops after the iteration limit instead of looping forever', async () => {
    const callProvider = vi.fn<(request: LLMRequest) => Promise<LLMResponse>>().mockResolvedValue({
      content: '',
      model: 'm',
      finishReason: 'tool_calls',
      toolCalls: [toolCall('web-search', '{}')],
    });

    const executeTool = vi.fn().mockResolvedValue({
      toolId: 't1',
      toolName: 'web-search',
      success: true,
      result: 'ok',
      timestamp: new Date().toISOString(),
    });

    const result = await runToolCallingLoop({
      request: baseRequest,
      callProvider,
      executeTool,
      maxIterations: 3,
    });

    expect(callProvider).toHaveBeenCalledTimes(3);
    expect(result.toolsExecuted).toHaveLength(3);
  });

  it('surfaces an approval-gated tool as a suggestion without executing it', async () => {
    const callProvider = vi
      .fn<(request: LLMRequest) => Promise<LLMResponse>>()
      .mockResolvedValueOnce({
        content: '',
        model: 'm',
        finishReason: 'tool_calls',
        toolCalls: [toolCall('shell-exec', '{"cmd":"rm -rf /"}')],
      })
      .mockResolvedValueOnce({ content: 'I need approval first', model: 'm', finishReason: 'stop' });

    const executeTool = vi.fn();

    const result = await runToolCallingLoop({
      request: baseRequest,
      callProvider,
      executeTool,
      requiresApproval: (call) => call.function.name === 'shell-exec',
    });

    expect(executeTool, 'approval-gated tools must never auto-execute').not.toHaveBeenCalled();
    expect(result.suggestedTools?.[0]?.toolName).toBe('shell-exec');
  });

  it('leaves a turn without tool calls completely unchanged', async () => {
    const plain: LLMResponse = { content: 'plain answer', model: 'm', finishReason: 'stop' };
    const callProvider = vi.fn<(request: LLMRequest) => Promise<LLMResponse>>().mockResolvedValue(plain);
    const executeTool = vi.fn();

    const result = await runToolCallingLoop({
      request: { prompt: 'hello' },
      callProvider,
      executeTool,
    });

    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
    expect(result).toEqual(plain);
  });

  it('feeds a failed tool execution back to the model rather than throwing', async () => {
    const callProvider = vi
      .fn<(request: LLMRequest) => Promise<LLMResponse>>()
      .mockResolvedValueOnce({
        content: '',
        model: 'm',
        finishReason: 'tool_calls',
        toolCalls: [toolCall('web-search', '{"query":"x"}')],
      })
      .mockResolvedValueOnce({ content: 'That search failed', model: 'm', finishReason: 'stop' });

    const executeTool = vi.fn().mockRejectedValue(new Error('executor offline'));

    const result = await runToolCallingLoop({
      request: baseRequest,
      callProvider,
      executeTool,
    });

    expect(result.content).toBe('That search failed');
    expect(result.toolsExecuted?.[0].success).toBe(false);
    expect(callProvider.mock.calls[1][0].prompt).toContain('executor offline');
  });
});
