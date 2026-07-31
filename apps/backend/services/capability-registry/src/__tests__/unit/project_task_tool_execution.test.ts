import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => {
  // config.ts throws at module scope when these are absent, which aborts the
  // whole suite at import time. capability-registry has no vitest setupFile.
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
  return { mockExecute: vi.fn() };
});

vi.mock('@uaip/shared-services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/shared-services')>();
  return {
    ...actual,
    ProjectTaskToolService: {
      getInstance: () => ({ execute: mockExecute }),
    },
  };
});

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

const { BaseToolExecutor } = await import('../../services/base_tool_executor');
const { ProjectTaskToolError } = await import('@uaip/shared-services');

const USER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  mockExecute.mockReset();
  mockExecute.mockResolvedValue({ tasks: [], count: 0 });
});

describe('BaseToolExecutor project/task dispatch', () => {
  it('routes every project/task tool id to the tool service', async () => {
    const executor = new BaseToolExecutor();

    for (const toolId of [
      'project-list',
      'project-get',
      'task-list',
      'task-get',
      'task-create',
      'task-update',
      'task-stats',
    ]) {
      mockExecute.mockClear();
      // oxlint-disable-next-line no-await-in-loop -- assertions must run per tool id, not batched
      await executor.execute(toolId, { userId: USER_ID });
      expect(mockExecute, `${toolId} should dispatch`).toHaveBeenCalledWith(
        toolId,
        USER_ID,
        expect.objectContaining({ userId: USER_ID })
      );
    }
  });

  it('wraps the service result in the standard tool envelope', async () => {
    mockExecute.mockResolvedValue({ count: 2 });
    const executor = new BaseToolExecutor();

    const result = await executor.execute('task-list', { userId: USER_ID });

    expect(result).toMatchObject({ toolId: 'task-list', success: true, result: { count: 2 } });
  });

  it('refuses to execute without a userId rather than running unscoped', async () => {
    const executor = new BaseToolExecutor();

    await expect(executor.execute('task-list', {})).rejects.toThrow(/requires a userId/);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('surfaces invalid-parameter errors as validation failures', async () => {
    mockExecute.mockRejectedValue(
      new ProjectTaskToolError('Parameter "title" is required', 'INVALID_PARAMS')
    );
    const executor = new BaseToolExecutor();

    await expect(executor.execute('task-create', { userId: USER_ID })).rejects.toThrow(
      /Parameter "title" is required/
    );
  });

  it('surfaces access failures rather than returning a success envelope', async () => {
    mockExecute.mockRejectedValue(
      new ProjectTaskToolError('Project not found or not accessible', 'FORBIDDEN')
    );
    const executor = new BaseToolExecutor();

    await expect(
      executor.execute('task-list', { userId: USER_ID, projectId: 'other' })
    ).rejects.toThrow(/not accessible/);
  });

  it('still rejects a genuinely unknown tool id', async () => {
    const executor = new BaseToolExecutor();

    await expect(executor.execute('not-a-real-tool', {})).rejects.toThrow(/Unknown tool/);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
