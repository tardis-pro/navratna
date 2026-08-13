import { describe, it, expect, vi, beforeEach } from 'vitest';

const AUTH_USER_ID = '99999999-9999-4999-8999-999999999999';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';

const operationRows: Record<string, unknown>[] = [];
const groupedRows: Record<string, unknown>[] = [];
const predicates: { column: unknown; value: unknown }[] = [];

vi.mock('@uaip/middleware', () => ({
  withRequiredAuth: (group: { derive: (fn: () => unknown) => unknown }) =>
    group.derive(() => ({
      user: { id: AUTH_USER_ID, email: 'auth@test.dev', role: 'user' },
    })),
}));

function createChain(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  const step = () => chain;
  chain.from = step;
  chain.where = step;
  chain.orderBy = step;
  chain.groupBy = step;
  chain.limit = step;
  chain.offset = () => Promise.resolve(rows);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock('@uaip/shared-services', () => ({
  getControlDb: () => ({
    select: (projection?: unknown) => createChain(projection ? groupedRows : operationRows),
  }),
}));

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  eq: (column: unknown, value: unknown) => {
    predicates.push({ column, value });
    return { op: 'eq', column, value };
  },
  and: (...parts: unknown[]) => ({ op: 'and', parts }),
  desc: (column: unknown) => ({ op: 'desc', column }),
  asc: (column: unknown) => ({ op: 'asc', column }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (value: string) => ({ raw: value }) }
  ),
}));

vi.mock('@uaip/shared-services/drizzle/control', () => ({
  operations: {
    id: 'operations.id',
    createdAt: 'operations.created_at',
    userId: 'operations.user_id',
    status: 'operations.status',
    type: 'operations.type',
    actualDuration: 'operations.actual_duration',
  },
  operationStates: { id: 'operation_states.id', operationId: 'operation_states.operation_id' },
  operationCheckpoints: {
    id: 'operation_checkpoints.id',
    operationId: 'operation_checkpoints.operation_id',
  },
  stepResults: {
    id: 'step_results.id',
    operationId: 'step_results.operation_id',
    stepIndex: 'step_results.step_index',
  },
}));

import { registerOperationRoutes } from '../../routes/operation_routes.js';

interface EngineStub {
  executeOperation: ReturnType<typeof vi.fn>;
  getOperationStatus: ReturnType<typeof vi.fn>;
  pauseOperation: ReturnType<typeof vi.fn>;
  resumeOperation: ReturnType<typeof vi.fn>;
  cancelOperation: ReturnType<typeof vi.fn>;
}

function createEngine(): EngineStub {
  return {
    executeOperation: vi.fn().mockResolvedValue('wf-instance-1'),
    getOperationStatus: vi.fn().mockResolvedValue({ status: 'running' }),
    pauseOperation: vi.fn().mockResolvedValue(undefined),
    resumeOperation: vi.fn().mockResolvedValue(undefined),
    cancelOperation: vi.fn().mockResolvedValue(undefined),
  };
}

describe('operation routes', () => {
  beforeEach(() => {
    operationRows.length = 0;
    groupedRows.length = 0;
    predicates.length = 0;
  });

  const OWNERSHIP_ROUTES: { path: string; method: string }[] = [
    { path: '/api/v1/operations', method: 'GET' },
    { path: `/api/v1/operations/${OPERATION_ID}`, method: 'GET' },
    { path: `/api/v1/operations/${OPERATION_ID}/history`, method: 'GET' },
    { path: `/api/v1/operations/${OPERATION_ID}/logs`, method: 'GET' },
    { path: `/api/v1/operations/${OPERATION_ID}/pause`, method: 'POST' },
    { path: `/api/v1/operations/${OPERATION_ID}/cancel`, method: 'POST' },
  ];

  it.each(OWNERSHIP_ROUTES)(
    'scopes $method $path to the authenticated owner (IDOR guard)',
    async ({ path, method }) => {
      const app = registerOperationRoutes(createEngine() as never);
      predicates.length = 0;

      await app.handle(new Request(`http://localhost${path}`, { method }));

      const ownerPredicate = predicates.find(
        (p) => p.column === 'operations.user_id' && p.value === AUTH_USER_ID
      );
      expect(ownerPredicate).toBeDefined();
    }
  );

  it('does not leak another user\'s operation through GET /:id', async () => {
    operationRows.push({ id: OPERATION_ID, userId: 'someone-else' });
    const app = registerOperationRoutes(createEngine() as never);

    const response = await app.handle(
      new Request(`http://localhost/api/v1/operations/${OPERATION_ID}`)
    );

    const ownerPredicate = predicates.find(
      (p) => p.column === 'operations.user_id' && p.value === AUTH_USER_ID
    );
    expect(ownerPredicate).toBeDefined();
    expect(response.status).not.toBe(500);
  });

  it('routes GET /stats to the stats handler instead of matching it as an :id', async () => {
    const app = registerOperationRoutes(createEngine() as never);

    const response = await app.handle(
      new Request('http://localhost/api/v1/operations/stats?days=30')
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: Record<string, unknown> };
    expect(body.data).toHaveProperty('totalOperations');
  });

  it.each([
    { path: '/api/v1/operations/not-a-uuid', method: 'GET' },
    { path: '/api/v1/operations/not-a-uuid/status', method: 'GET' },
    { path: '/api/v1/operations/not-a-uuid/history', method: 'GET' },
    { path: '/api/v1/operations/not-a-uuid/logs', method: 'GET' },
    { path: '/api/v1/operations/not-a-uuid/pause', method: 'POST' },
    { path: '/api/v1/operations/not-a-uuid/resume', method: 'POST' },
    { path: '/api/v1/operations/not-a-uuid/cancel', method: 'POST' },
  ])('returns 400 for malformed operation ids on $method $path', async ({ path, method }) => {
    const app = registerOperationRoutes(createEngine() as never);

    const response = await app.handle(new Request(`http://localhost${path}`, { method }));

    expect(response.status).toBe(400);
  });

  it('cancels with a non-empty reason even when the request carries no body', async () => {
    const engine = createEngine();
    // The ownership guard resolves the operation first; without an owned row the
    // request correctly 404s before cancelOperation is ever reached.
    operationRows.push({ id: OPERATION_ID, userId: AUTH_USER_ID });
    const app = registerOperationRoutes(engine as never);

    const response = await app.handle(
      new Request(`http://localhost/api/v1/operations/${OPERATION_ID}/cancel`, { method: 'POST' })
    );

    expect(response.status).toBe(200);
    const [, reason] = engine.cancelOperation.mock.calls[0] as [string, string, boolean, boolean];
    expect(typeof reason).toBe('string');
    expect(reason.length).toBeGreaterThan(0);
  });

  it('ignores a body-supplied userId and executes as the authenticated caller', async () => {
    const engine = createEngine();
    const app = registerOperationRoutes(engine as never);

    await app.handle(
      new Request('http://localhost/api/v1/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'attacker',
          agentId: '22222222-2222-4222-8222-222222222222',
          operationPlan: {
            type: 'tool_execution',
            description: 'demo',
            steps: [
              { id: 'step-1', name: 'noop', type: 'tool-execution', toolId: 'noop', input: {} },
            ],
          },
        }),
      })
    );

    expect(engine.executeOperation).toHaveBeenCalled();
    const [operation] = engine.executeOperation.mock.calls[0] as [{ userId?: string }];
    expect(operation.userId).toBe(AUTH_USER_ID);
    expect(operation.userId).not.toBe('attacker');
  });
});
