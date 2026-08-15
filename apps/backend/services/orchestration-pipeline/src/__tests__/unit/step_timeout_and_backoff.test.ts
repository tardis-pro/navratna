import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
});

vi.mock('@uaip/shared-services', () => ({
  StepExecutorService: class {},
  ResourceManagerService: class {},
}));

const { StepExecutionManager } = await import('../../engine/step_execution_manager');

/**
 * The bugs these cover:
 *  - setStepTimeout emitted 'step:timeout' and dropped the activeSteps entry but
 *    never touched the in-flight promise, so a hung step was reported timed out
 *    while still running, then reported COMPLETED when it finally resolved.
 *  - Every executor was handed `new AbortController().signal` — a fresh
 *    controller nothing could ever abort.
 *  - calculateBackoff hardcoded baseDelay = 1000 and always used an exponential
 *    curve, ignoring retryDelay and backoffStrategy.
 */
describe('step timeout', () => {
  let executor: { executeTool: ReturnType<typeof vi.fn> };
  let resources: {
    checkAvailability: ReturnType<typeof vi.fn>;
    getUsage: ReturnType<typeof vi.fn>;
  };
  let manager: InstanceType<typeof StepExecutionManager>;

  const step = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'step-1',
      name: 'slow step',
      type: 'tool-execution',
      toolId: 'time-utility',
      ...overrides,
    }) as never;

  const context = () =>
    ({
      operationId: 'op-1',
      workflowInstanceId: 'wf-1',
      previousResults: new Map(),
      globalContext: {},
    }) as never;

  beforeEach(() => {
    executor = { executeTool: vi.fn() };
    resources = {
      checkAvailability: vi.fn(async () => ({ available: true })),
      getUsage: vi.fn(async () => ({ cpu: 0, memory: 0, network: 0 })),
    };
    manager = new StepExecutionManager(executor as never, resources as never);
  });

  it('rejects when the step outruns its timeout instead of reporting COMPLETED', async () => {
    executor.executeTool.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 5_000))
    );

    await expect(manager.executeStep(step({ timeout: 40 }), context())).rejects.toThrow(
      /exceeded its 40ms timeout/
    );
  });

  it('emits step:timeout on expiry', async () => {
    executor.executeTool.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 5_000))
    );
    const onTimeout = vi.fn();
    manager.on('step:timeout', onTimeout);

    await expect(manager.executeStep(step({ timeout: 40 }), context())).rejects.toThrow();
    expect(onTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'step-1', operationId: 'op-1', timeout: 40 })
    );
  });

  it('aborts the signal handed to the executor', async () => {
    let observed: AbortSignal | undefined;
    executor.executeTool.mockImplementation(
      (_step: unknown, _input: unknown, signal: AbortSignal) => {
        observed = signal;
        return new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 5_000));
      }
    );

    await expect(manager.executeStep(step({ timeout: 40 }), context())).rejects.toThrow();
    expect(observed).toBeInstanceOf(AbortSignal);
    expect(observed?.aborted).toBe(true);
  });

  it('does not abort a step that finishes inside its timeout', async () => {
    let observed: AbortSignal | undefined;
    executor.executeTool.mockImplementation(
      (_step: unknown, _input: unknown, signal: AbortSignal) => {
        observed = signal;
        return Promise.resolve({ ok: true });
      }
    );

    const result = await manager.executeStep(step({ timeout: 2_000 }), context());
    expect(result.status).toBe('completed');
    expect(observed?.aborted).toBe(false);
  });

  it('runs without a timeout when none is set', async () => {
    executor.executeTool.mockResolvedValue({ ok: true });
    const result = await manager.executeStep(step(), context());
    expect(result.status).toBe('completed');
  });
});

describe('retry backoff', () => {
  const manager = new StepExecutionManager({} as never, {} as never);
  // calculateBackoff is private; the policy it implements is the thing under test.
  const backoff = (policy: unknown, retryCount: number): number =>
    (
      manager as unknown as { calculateBackoff: (s: unknown) => number }
    ).calculateBackoff({ retryPolicy: policy, retryCount });

  it('honours a fixed strategy at the configured delay', () => {
    const policy = { backoffStrategy: 'fixed', retryDelay: 5_000 };
    expect(backoff(policy, 1)).toBe(5_000);
    expect(backoff(policy, 2)).toBe(5_000);
    expect(backoff(policy, 3)).toBe(5_000);
  });

  it('scales linearly for a linear strategy', () => {
    const policy = { backoffStrategy: 'linear', retryDelay: 2_000 };
    expect(backoff(policy, 1)).toBe(2_000);
    expect(backoff(policy, 2)).toBe(4_000);
    expect(backoff(policy, 3)).toBe(6_000);
  });

  it('uses retryDelay as the base of the exponential curve, not a hardcoded 1000', () => {
    const policy = { backoffStrategy: 'exponential', retryDelay: 500, backoffMultiplier: 3 };
    expect(backoff(policy, 1)).toBe(500);
    expect(backoff(policy, 2)).toBe(1_500);
    expect(backoff(policy, 3)).toBe(4_500);
  });

  it('falls back to exponential from 1000ms when no policy is given', () => {
    expect(backoff(undefined, 1)).toBe(1_000);
    expect(backoff(undefined, 2)).toBe(2_000);
  });
});
