import { beforeEach, describe, expect, it, vi } from 'vitest';

const toolServiceMocks = vi.hoisted(() => ({
  createToolExecution: vi.fn().mockResolvedValue(undefined),
  getToolExecution: vi.fn(),
  updateToolExecution: vi.fn().mockResolvedValue(undefined),
  trackUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@uaip/shared-services', () => ({
  ToolService: {
    getInstance: () => toolServiceMocks,
  },
}));

// Removed: vi.mock('../services/execution_mesh/tool_runtime_resolver.js').
// It was dead twice over — vi.mock resolves relative to this file, so
// '../services/…' meant src/__tests__/services/…, and the module it named was
// renamed to execution_mesh/descriptor.js besides. It never applied, so these
// cases have always run against the real resolveToolDescriptor; leaving the
// line in only advertised a stub that does not exist.

import { ToolExecutor } from '../../services/tool_executor.js';

describe('ToolExecutor successful completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a completed native execution successful', async () => {
    const toolRegistry = {
      getTool: vi.fn().mockResolvedValue({
        id: 'tool-id',
        name: 'http-client',
        isEnabled: true,
        requiresApproval: false,
        costEstimate: 0,
        executionTimeEstimate: 1000,
      }),
      recordToolUsage: vi.fn().mockResolvedValue(undefined),
    };
    const baseExecutor = {
      execute: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    };
    const executor = new ToolExecutor(
      {} as never,
      toolRegistry as never,
      baseExecutor as never
    );

    const execution = await executor.executeTool('tool-id', 'agent-id', {});

    expect(execution.status).toBe('completed');
    expect(execution.success).toBe(true);
    expect(toolServiceMocks.updateToolExecution).toHaveBeenCalledWith(
      execution.id,
      expect.objectContaining({
        status: 'completed',
        metadata: expect.objectContaining({ success: true }),
      })
    );
  });

  it('restores success and data when a completed execution is reloaded', async () => {
    toolServiceMocks.getToolExecution.mockResolvedValueOnce({
      id: 'execution-id',
      toolId: 'tool-id',
      agentId: 'agent-id',
      parameters: {},
      status: 'completed',
      result: { ok: true },
      metadata: { success: true },
      createdAt: new Date(),
    });
    const executor = new ToolExecutor({} as never, {} as never, {} as never);

    const execution = await executor.getExecution('execution-id');

    expect(execution?.success).toBe(true);
    expect(execution?.data).toEqual({ ok: true });
  });
});
