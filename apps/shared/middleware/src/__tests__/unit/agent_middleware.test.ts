import { describe, expect, it, vi } from 'vitest';
import { logger } from '@uaip/utils';
import { recordAgentOperationResult } from '../../agent_middleware';

vi.mock('@uaip/utils', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('trackAgentOperation', () => {
  it('records operation results for valid execution state', async () => {
    const agentExecution = {
      startTime: 100,
      operations: ['test-operation'],
      results: [],
    };

    expect(recordAgentOperationResult(agentExecution, 'test-operation', 201, 175)).toBe(true);
    expect(agentExecution.results).toEqual([
      {
        operation: 'test-operation',
        duration: 75,
        status: 201,
      },
    ]);
    expect(logger.debug).toHaveBeenCalledWith(
      'Agent operation completed',
      {
        operation: 'test-operation',
        duration: 75,
        status: 201,
      }
    );
  });

  it('rejects malformed injected execution state without recording results', async () => {
    const agentExecution = {
      startTime: 'not-a-number',
      operations: ['bad-operation'],
      results: [],
    };

    expect(recordAgentOperationResult(agentExecution, 'guarded-operation', 200, 175)).toBe(false);
    expect(agentExecution.results).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid agent execution state ignored',
      { operation: 'guarded-operation' }
    );
  });
});
