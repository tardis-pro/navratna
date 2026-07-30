import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDouble } from '../test_double.js';
import { DiscussionEventType } from '@uaip/types';
import type { DiscussionEvent } from '@uaip/types';
import { DiscussionOrchestrationService } from '../../services/discussion_orchestration_service.js';

/**
 * emitEvent() dedupes on an idempotency key to stop the same logical event being
 * broadcast twice. Two things have to hold for that to be real rather than
 * decorative: the key must be derived from the event's identity (not a per-call
 * unique id, which would never collide), and the seen-set must be bounded (it is
 * process-lifetime state on a long-running service).
 */

type EmitEventFn = (event: DiscussionEvent) => Promise<void>;

function makeService(): {
  service: DiscussionOrchestrationService;
  publish: ReturnType<typeof vi.fn>;
  emitted: DiscussionEvent[];
} {
  const publish = vi.fn(async () => undefined);
  const eventBusService = testDouble<ConstructorParameters<typeof DiscussionOrchestrationService>[1]>(
    { publish }
  );

  const service = Object.create(
    DiscussionOrchestrationService.prototype
  ) as DiscussionOrchestrationService;

  Reflect.set(service, 'eventBusService', eventBusService);
  Reflect.set(service, 'emittedEvents', new Set<string>());
  const emitted: DiscussionEvent[] = [];
  Reflect.set(service, 'emit', (_name: string, event: DiscussionEvent) => {
    emitted.push(event);
    return true;
  });

  return { service, publish, emitted };
}

function callEmitEvent(service: DiscussionOrchestrationService, event: DiscussionEvent) {
  const fn = Reflect.get(service, 'emitEvent');
  if (typeof fn !== 'function') {
    throw new Error('emitEvent is not a function — test needs updating');
  }
  return (fn as EmitEventFn).call(service, event);
}

function seenSetSize(service: DiscussionOrchestrationService): number {
  const set = Reflect.get(service, 'emittedEvents');
  if (!(set instanceof Set)) {
    throw new Error('emittedEvents is not a Set — test needs updating');
  }
  return set.size;
}

function makeEvent(overrides: Partial<DiscussionEvent> = {}): DiscussionEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    discussionId: 'disc-1',
    type: DiscussionEventType.MESSAGE_SENT,
    participantId: 'p1',
    data: { messageId: 'msg-1' },
    timestamp: new Date('2026-07-30T00:00:00.000Z'),
    ...overrides,
  } as DiscussionEvent;
}

describe('DiscussionOrchestrationService.emitEvent dedup', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = makeService();
  });

  it('suppresses a redelivery of the same logical event', async () => {
    const first = makeEvent();
    const redelivery = makeEvent({ id: `evt_${Math.random().toString(36).slice(2)}` });

    await callEmitEvent(ctx.service, first);
    await callEmitEvent(ctx.service, redelivery);

    expect(ctx.publish).toHaveBeenCalledTimes(1);
    expect(ctx.emitted).toHaveLength(1);
  });

  it('still delivers genuinely distinct events', async () => {
    await callEmitEvent(ctx.service, makeEvent({ data: { messageId: 'msg-1' } }));
    await callEmitEvent(ctx.service, makeEvent({ data: { messageId: 'msg-2' } }));

    expect(ctx.publish).toHaveBeenCalledTimes(2);
  });

  it('honours an explicit idempotencyKey when the caller supplies one', async () => {
    const key = 'caller-supplied-key';
    await callEmitEvent(ctx.service, makeEvent({ metadata: { idempotencyKey: key } }));
    await callEmitEvent(ctx.service, makeEvent({ metadata: { idempotencyKey: key } }));

    expect(ctx.publish).toHaveBeenCalledTimes(1);
  });

  it('does not collide two participants reacting to the same message', async () => {
    const base = {
      type: DiscussionEventType.REACTION_ADDED,
      timestamp: new Date('2026-07-30T00:00:00.000Z'),
    };
    await callEmitEvent(
      ctx.service,
      makeEvent({ ...base, data: { messageId: 'm1', participantId: 'p1', emoji: '👍' } })
    );
    await callEmitEvent(
      ctx.service,
      makeEvent({ ...base, data: { messageId: 'm1', participantId: 'p2', emoji: '👍' } })
    );

    expect(ctx.publish).toHaveBeenCalledTimes(2);
  });

  it('does not collide one participant using two emoji on the same message', async () => {
    const base = {
      type: DiscussionEventType.REACTION_ADDED,
      timestamp: new Date('2026-07-30T00:00:00.000Z'),
    };
    await callEmitEvent(
      ctx.service,
      makeEvent({ ...base, data: { messageId: 'm1', participantId: 'p1', emoji: '👍' } })
    );
    await callEmitEvent(
      ctx.service,
      makeEvent({ ...base, data: { messageId: 'm1', participantId: 'p1', emoji: '🎉' } })
    );

    expect(ctx.publish).toHaveBeenCalledTimes(2);
  });

  it('does not collide two messages emitted in the same millisecond', async () => {
    const timestamp = new Date('2026-07-30T00:00:00.000Z');
    await callEmitEvent(
      ctx.service,
      makeEvent({
        type: DiscussionEventType.MESSAGE_SENT,
        timestamp,
        data: { message: { id: 'msg-1' }, participantId: 'p1' },
      })
    );
    await callEmitEvent(
      ctx.service,
      makeEvent({
        type: DiscussionEventType.MESSAGE_SENT,
        timestamp,
        data: { message: { id: 'msg-2' }, participantId: 'p1' },
      })
    );

    expect(ctx.publish).toHaveBeenCalledTimes(2);
  });

  it('does not suppress a legitimately repeated status transition', async () => {
    const status = (value: string) =>
      makeEvent({
        type: DiscussionEventType.STATUS_CHANGED,
        data: { status: value, changedBy: 'user-1' },
        timestamp: new Date('2026-07-30T00:00:00.000Z'),
      });

    await callEmitEvent(ctx.service, status('paused'));
    await callEmitEvent(ctx.service, status('active'));
    await callEmitEvent(ctx.service, status('paused'));

    expect(ctx.publish).toHaveBeenCalledTimes(3);
  });

  it('still dedupes a status change carrying an explicit idempotency key', async () => {
    const key = 'op-42';
    const event = () =>
      makeEvent({
        type: DiscussionEventType.STATUS_CHANGED,
        data: { status: 'paused', changedBy: 'user-1' },
        metadata: { idempotencyKey: key },
      });

    await callEmitEvent(ctx.service, event());
    await callEmitEvent(ctx.service, event());

    expect(ctx.publish).toHaveBeenCalledTimes(1);
  });

  it('bounds the seen-set so a long-lived service cannot leak memory', async () => {
    for (let i = 0; i < 1200; i++) {
      await callEmitEvent(ctx.service, makeEvent({ data: { messageId: `msg-${i}` } }));
    }

    expect(seenSetSize(ctx.service)).toBeLessThanOrEqual(1000);
  });
});
