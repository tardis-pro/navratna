import { describe, it, expect, vi, beforeEach } from 'vitest';

const operationRows: Record<string, unknown>[] = [];
const workflowRows: Record<string, unknown>[] = [];
const insertedValues: Record<string, unknown>[] = [];

const callerRole = { value: 'user' };

interface GuardableGroup {
  guard: (options: { beforeHandle: (ctx: unknown) => unknown }) => unknown;
}

vi.mock('@uaip/middleware', () => ({
  withRequiredAuth: (group: unknown) => group,
  // Mirrors requireOperator: admin/operator/security_admin pass, everyone else 403.
  withOperatorGuard: (group: unknown) =>
    (group as GuardableGroup).guard({
      beforeHandle(ctx: unknown) {
        const allowed = ['admin', 'operator', 'security_admin', 'security-admin'];
        if (!allowed.includes(callerRole.value)) {
          (ctx as { set: { status?: number } }).set.status = 403;
          return { error: 'Operator access required', code: 'OPERATOR_REQUIRED' };
        }
      },
    }),
}));

function createSelectChain(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  const step = () => chain;
  chain.from = step;
  chain.where = step;
  chain.orderBy = step;
  chain.limit = step;
  chain.offset = () => Promise.resolve(rows);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock('@uaip/shared-services', () => ({
  getControlDb: () => ({
    select: (projection?: unknown) => {
      const isCount = projection !== undefined;
      return createSelectChain(isCount ? [{ value: operationRows.length }] : operationRows);
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValues.push(values);
        return { returning: () => Promise.resolve(workflowRows) };
      },
    }),
    update: () => ({
      set: () => ({ where: () => ({ returning: () => Promise.resolve(workflowRows) }) }),
    }),
    delete: () => ({ where: () => ({ returning: () => Promise.resolve(workflowRows) }) }),
  }),
}));

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  eq: (column: unknown, value: unknown) => ({ op: 'eq', column, value }),
  and: (...parts: unknown[]) => ({ op: 'and', parts }),
  desc: (column: unknown) => ({ op: 'desc', column }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (value: string) => ({ raw: value }) }
  ),
}));

vi.mock('@uaip/shared-services/drizzle/control', () => ({
  workflowDefinitions: {
    id: 'workflow_definitions.id',
    createdAt: 'workflow_definitions.created_at',
  },
  operations: {
    id: 'operations.id',
    context: 'operations.context',
    startedAt: 'operations.started_at',
  },
}));

import { registerWorkflowRoutes } from '../../routes/workflow_routes.js';

interface WorkflowEngineStub {
  registerOrUpdate: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
}

interface WorkflowExecutorStub {
  runDefinition: ReturnType<typeof vi.fn>;
}

function createEngine(): WorkflowEngineStub {
  return {
    registerOrUpdate: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(undefined),
  };
}

function createExecutor(): WorkflowExecutorStub {
  return {
    runDefinition: vi.fn().mockResolvedValue({
      operationId: 'op-1',
      workflowDefinitionId: 'wf-1',
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 12,
      outcomes: [],
    }),
  };
}

function buildApp(engine: WorkflowEngineStub, executor: WorkflowExecutorStub) {
  return registerWorkflowRoutes(engine as never, executor as never);
}

describe('workflow routes contract', () => {
  beforeEach(() => {
    operationRows.length = 0;
    workflowRows.length = 0;
    insertedValues.length = 0;
    callerRole.value = 'admin';
  });

  const PRIVILEGED_ROUTES: { method: string; path: string; body?: unknown }[] = [
    {
      method: 'POST',
      path: '/api/v1/workflows',
      body: {
        name: 'pwn',
        trigger: { kind: 'cron', expr: '0 9 * * *' },
        steps: [{ type: 'bash', command: 'id' }],
      },
    },
    { method: 'PUT', path: '/api/v1/workflows/wf-1', body: { enabled: true } },
    { method: 'DELETE', path: '/api/v1/workflows/wf-1' },
    { method: 'POST', path: '/api/v1/workflows/wf-1/execute' },
  ];

  it.each(PRIVILEGED_ROUTES)(
    'refuses $method $path for a non-operator caller (bash/httpCall steps run as SYSTEM)',
    async ({ method, path, body }) => {
      callerRole.value = 'user';
      workflowRows.push({ id: 'wf-1', name: 'w', enabled: false, steps: [], trigger: {} });
      const executor = createExecutor();
      const app = buildApp(createEngine(), executor);

      const response = await app.handle(
        new Request(`http://localhost${path}`, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
      );

      expect(response.status).toBe(403);
      expect(insertedValues).toHaveLength(0);
      expect(executor.runDefinition).not.toHaveBeenCalled();
    }
  );

  it('still allows a non-operator caller to READ workflows', async () => {
    callerRole.value = 'user';
    const app = buildApp(createEngine(), createExecutor());

    const response = await app.handle(new Request('http://localhost/api/v1/workflows'));

    expect(response.status).toBe(200);
  });

  it('accepts a whatsapp delivery channel that the executor already supports', async () => {
    workflowRows.push({ id: 'wf-1', name: 'w', enabled: false });
    const app = buildApp(createEngine(), createExecutor());

    const response = await app.handle(
      new Request('http://localhost/api/v1/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'notify me',
          trigger: { kind: 'cron', expr: '0 9 * * *' },
          steps: [{ type: 'bash', command: 'echo hi' }],
          delivery: { type: 'whatsapp', target: '+10000000000' },
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(insertedValues[0]?.delivery).toEqual({
      type: 'whatsapp',
      target: '+10000000000',
    });
  });

  it('exposes POST /:id/execute so the Studio run button reaches the executor', async () => {
    const executor = createExecutor();
    const app = buildApp(createEngine(), executor);

    const response = await app.handle(
      new Request('http://localhost/api/v1/workflows/wf-1/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(200);
    expect(executor.runDefinition).toHaveBeenCalledWith('wf-1');
  });

  it('exposes GET /:id/executions so run history is readable', async () => {
    const app = buildApp(createEngine(), createExecutor());

    const response = await app.handle(
      new Request('http://localhost/api/v1/workflows/wf-1/executions')
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns 404 rather than another workflow run when the execution id belongs elsewhere', async () => {
    const app = buildApp(createEngine(), createExecutor());

    const response = await app.handle(
      new Request('http://localhost/api/v1/workflows/wf-1/executions/op-of-another-workflow')
    );

    expect(response.status).toBe(404);
  });
});
