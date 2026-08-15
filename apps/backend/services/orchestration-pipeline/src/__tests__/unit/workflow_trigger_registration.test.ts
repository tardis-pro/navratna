import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
});

vi.mock('@uaip/shared-services', () => ({
  EventBusService: class {},
  getControlDb: () => ({}),
}));

const { WorkflowEngineService } = await import('../../services/workflow_engine_service');
const { verifyHookSignature } = await import('../../routes/workflow_hook_routes');

type Definition = Parameters<InstanceType<typeof WorkflowEngineService>['registerOrUpdate']>[0];

/**
 * The bug these cover: buildRepeatOptions() returned null for trigger.kind
 * 'webhook' and 'event'. registerOrUpdate() logged "skipping queue registration"
 * and returned, so the API accepted and persisted those definitions and they
 * never fired. Only a malformed 'every' expression ever failed loudly.
 */
describe('workflow trigger registration', () => {
  let queue: {
    upsertJobScheduler: ReturnType<typeof vi.fn>;
    removeJobScheduler: ReturnType<typeof vi.fn>;
  };
  let bus: {
    getOrCreateQueue: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  let engine: InstanceType<typeof WorkflowEngineService>;

  const definition = (overrides: Partial<Definition> = {}): Definition =>
    ({
      id: 'def-1',
      name: 'nightly',
      enabled: true,
      trigger: { kind: 'cron', expr: '0 3 * * *' },
      steps: [],
      ...overrides,
    }) as Definition;

  beforeEach(() => {
    queue = {
      upsertJobScheduler: vi.fn(async () => ({})),
      removeJobScheduler: vi.fn(async () => false),
    };
    bus = {
      getOrCreateQueue: vi.fn(() => queue),
      subscribe: vi.fn(async () => undefined),
      unsubscribe: vi.fn(async () => undefined),
      publish: vi.fn(async () => undefined),
    };
    engine = new WorkflowEngineService(bus as never);
  });

  describe('schedule triggers', () => {
    it('registers a cron trigger as a job scheduler', async () => {
      await engine.registerOrUpdate(definition());

      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
      const [schedulerId, repeat] = queue.upsertJobScheduler.mock.calls[0];
      expect(schedulerId).toContain('def-1');
      expect(repeat).toEqual({ pattern: '0 3 * * *' });
    });

    it('carries the timezone through', async () => {
      await engine.registerOrUpdate(
        definition({ trigger: { kind: 'cron', expr: '0 3 * * *', tz: 'Asia/Kolkata' } } as never)
      );
      expect(queue.upsertJobScheduler.mock.calls[0][1]).toEqual({
        pattern: '0 3 * * *',
        tz: 'Asia/Kolkata',
      });
    });

    it('rejects an empty cron expression instead of registering it', async () => {
      await expect(
        engine.registerOrUpdate(definition({ trigger: { kind: 'cron', expr: '  ' } } as never))
      ).rejects.toThrow(/empty expression/);
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('rejects a malformed every expression', async () => {
      await expect(
        engine.registerOrUpdate(definition({ trigger: { kind: 'every', expr: 'nonsense' } } as never))
      ).rejects.toThrow(/Invalid 'every' expression/);
    });
  });

  describe('event triggers', () => {
    it('subscribes to the topic rather than skipping registration', async () => {
      await engine.registerOrUpdate(
        definition({ trigger: { kind: 'event', expr: 'rdlo.ci.failed' } } as never)
      );

      expect(bus.subscribe).toHaveBeenCalledTimes(1);
      expect(bus.subscribe.mock.calls[0][0]).toBe('rdlo.ci.failed');
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('enqueues the definition when the subscribed topic fires', async () => {
      await engine.registerOrUpdate(
        definition({ trigger: { kind: 'event', expr: 'rdlo.ci.failed' } } as never)
      );

      const handler = bus.subscribe.mock.calls[0][1];
      await handler({ data: { prUrl: 'https://example.invalid/pr/1' } });

      expect(bus.publish).toHaveBeenCalledTimes(1);
      const [topic, payload] = bus.publish.mock.calls[0];
      expect(topic).toBe('workflow.definition.trigger');
      expect(payload.workflowDefinitionId).toBe('def-1');
      expect(payload.triggeredBy).toMatchObject({ kind: 'event', topic: 'rdlo.ci.failed' });
    });

    it('rejects an event trigger with no topic', async () => {
      await expect(
        engine.registerOrUpdate(definition({ trigger: { kind: 'event', expr: '' } } as never))
      ).rejects.toThrow(/no topic/);
    });

    it("rejects a topic containing ':' before it reaches the bus", async () => {
      await expect(
        engine.registerOrUpdate(definition({ trigger: { kind: 'event', expr: 'a:b' } } as never))
      ).rejects.toThrow(/cannot contain ':'/);
      expect(bus.subscribe).not.toHaveBeenCalled();
    });

    it('refuses to trigger on the workflow trigger topic itself', async () => {
      await expect(
        engine.registerOrUpdate(
          definition({ trigger: { kind: 'event', expr: 'workflow.definition.trigger' } } as never)
        )
      ).rejects.toThrow(/re-trigger itself/);
    });

    it('detaches the subscription on unregister', async () => {
      await engine.registerOrUpdate(
        definition({ trigger: { kind: 'event', expr: 'rdlo.ci.failed' } } as never)
      );
      await engine.unregister('def-1');
      expect(bus.unsubscribe).toHaveBeenCalledWith('rdlo.ci.failed', expect.any(Function));
    });
  });

  describe('webhook triggers', () => {
    it('registers a resolvable routing key', async () => {
      await engine.registerOrUpdate(
        definition({ trigger: { kind: 'webhook', expr: 'deploy-hook' } } as never)
      );
      expect(engine.resolveWebhookRoute('deploy-hook')).toBe('def-1');
    });

    it('rejects a webhook trigger with no routing key', async () => {
      await expect(
        engine.registerOrUpdate(definition({ trigger: { kind: 'webhook', expr: '' } } as never))
      ).rejects.toThrow(/no routing key/);
    });

    it('rejects a routing key that is not URL-path safe', async () => {
      await expect(
        engine.registerOrUpdate(
          definition({ trigger: { kind: 'webhook', expr: 'bad key/../x' } } as never)
        )
      ).rejects.toThrow(/only letters, digits/);
    });

    it('rejects a duplicate routing key claimed by another definition', async () => {
      await engine.registerOrUpdate(
        definition({ trigger: { kind: 'webhook', expr: 'shared' } } as never)
      );
      await expect(
        engine.registerOrUpdate(
          definition({ id: 'def-2', trigger: { kind: 'webhook', expr: 'shared' } } as never)
        )
      ).rejects.toThrow(/already registered/);
    });

    it('drops the route on unregister', async () => {
      await engine.registerOrUpdate(
        definition({ trigger: { kind: 'webhook', expr: 'deploy-hook' } } as never)
      );
      await engine.unregister('def-1');
      expect(engine.resolveWebhookRoute('deploy-hook')).toBeNull();
    });
  });

  it('does not register a disabled definition', async () => {
    await engine.registerOrUpdate(definition({ enabled: false }));
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(bus.subscribe).not.toHaveBeenCalled();
  });
});

describe('workflow hook signature verification', () => {
  const body = '{"ref":"main"}';
  const secret = 'hook-secret';
  const sign = (payload: string, key: string) =>
    `sha256=${createHmac('sha256', key).update(payload).digest('hex')}`;

  it('accepts a correct signature', () => {
    expect(verifyHookSignature(body, sign(body, secret), secret).valid).toBe(true);
  });

  it('rejects a signature over different bytes', () => {
    expect(verifyHookSignature(body, sign('{"ref":"other"}', secret), secret).valid).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyHookSignature(body, sign(body, 'wrong-secret'), secret).valid).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const result = verifyHookSignature(body, null, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Missing/);
  });

  it('fails closed when no secret is configured', () => {
    const result = verifyHookSignature(body, sign(body, secret), undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not configured/);
  });

  it('does not throw on a length-mismatched signature', () => {
    expect(() => verifyHookSignature(body, 'sha256=short', secret)).not.toThrow();
    expect(verifyHookSignature(body, 'sha256=short', secret).valid).toBe(false);
  });
});
