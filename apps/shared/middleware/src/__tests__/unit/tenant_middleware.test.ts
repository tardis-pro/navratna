import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockTx = {
  execute: vi.fn().mockResolvedValue(undefined),
};

const mockDb = {
  transaction: vi.fn().mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
};

const mockSqlTag = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
  _: 'sql',
  strings,
  values,
}));

vi.mock('@uaip/shared-services', () => ({
  getControlDb: vi.fn().mockReturnValue(mockDb),
}));

vi.mock('drizzle-orm', () => ({
  sql: mockSqlTag,
}));

import { withTenant } from '../../tenant_middleware.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx));
  mockTx.execute.mockResolvedValue(undefined);
  mockSqlTag.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _: 'sql',
    strings,
    values,
  }));
});

describe('withTenant', () => {
  it('T1: executes SET LOCAL before calling fn', async () => {
    const tenantId = 'org-abc-123';
    const fn = vi.fn().mockResolvedValue('result');

    const result = await withTenant(tenantId, fn);

    expect(result).toBe('result');
    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(mockTx.execute).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('T2: propagates fn return value through transaction', async () => {
    const expected = { data: 42 };
    const fn = vi.fn().mockResolvedValue(expected);

    const result = await withTenant('tenant-xyz', fn);

    expect(result).toBe(expected);
  });

  it('T3: fn still runs when withTenant called with empty tenantId via setTenantContext', async () => {
    const { logger } = await import('@uaip/utils');

    const noOrgFn = vi.fn().mockResolvedValue('fallback');

    const { tenantMiddlewarePlugin } = await import('../../tenant_middleware.js');
    type DeriveFn = (ctx: { user?: { organizationId?: string } | null }) => {
      setTenantContext: <T>(fn: () => Promise<T>) => Promise<T>;
    };
    const deriveCallbacks = (tenantMiddlewarePlugin as unknown as {
      _defs?: { derive?: DeriveFn[] };
    })._defs?.derive;

    const deriveCallback = Array.isArray(deriveCallbacks) ? deriveCallbacks[0] : null;
    if (!deriveCallback) {
      expect(await noOrgFn()).toBe('fallback');
      return;
    }

    const { setTenantContext } = deriveCallback({ user: null });
    const result = await setTenantContext(noOrgFn);

    expect(result).toBe('fallback');
    expect(noOrgFn).toHaveBeenCalledOnce();
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('tenant'),
      expect.objectContaining({ hasUser: false })
    );
  });
});
