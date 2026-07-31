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
    CalendarToolService: { getInstance: () => ({ execute: mockExecute }) },
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
const { CalendarToolError } = await import('@uaip/shared-services');

const USER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  mockExecute.mockReset();
  mockExecute.mockResolvedValue({ calendars: [], count: 0 });
});

describe('BaseToolExecutor calendar dispatch', () => {
  it('routes every calendar tool id to the calendar service', async () => {
    const executor = new BaseToolExecutor();

    for (const toolId of [
      'calendar-list',
      'calendar-events-list',
      'calendar-event-get',
      'calendar-event-create',
      'calendar-event-update',
      'calendar-event-delete',
      'calendar-freebusy',
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
    mockExecute.mockResolvedValue({ count: 3 });
    const executor = new BaseToolExecutor();

    const result = await executor.execute('calendar-list', { userId: USER_ID });

    expect(result).toMatchObject({
      toolId: 'calendar-list',
      success: true,
      result: { count: 3 },
    });
  });

  it('refuses to execute without a userId rather than running unscoped', async () => {
    const executor = new BaseToolExecutor();

    await expect(executor.execute('calendar-list', {})).rejects.toThrow(/requires a userId/);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('surfaces invalid-parameter errors as validation failures', async () => {
    mockExecute.mockRejectedValue(
      new CalendarToolError('Parameter "eventId" is required', 'INVALID_PARAMS')
    );
    const executor = new BaseToolExecutor();

    await expect(
      executor.execute('calendar-event-get', { userId: USER_ID })
    ).rejects.toThrow(/Parameter "eventId" is required/);
  });

  it('surfaces a missing connection instead of returning a success envelope', async () => {
    mockExecute.mockRejectedValue(
      new CalendarToolError('No Google account is connected.', 'NOT_CONNECTED')
    );
    const executor = new BaseToolExecutor();

    await expect(executor.execute('calendar-list', { userId: USER_ID })).rejects.toThrow(
      /No Google account is connected/
    );
  });

  it('surfaces provider failures', async () => {
    mockExecute.mockRejectedValue(
      new CalendarToolError('Google Calendar request failed: 403 Forbidden', 'PROVIDER_ERROR')
    );
    const executor = new BaseToolExecutor();

    await expect(executor.execute('calendar-list', { userId: USER_ID })).rejects.toThrow(
      /403 Forbidden/
    );
  });

  it('still rejects a genuinely unknown tool id', async () => {
    const executor = new BaseToolExecutor();

    await expect(executor.execute('calendar-nonsense', {})).rejects.toThrow(/Unknown tool/);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
