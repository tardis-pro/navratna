import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodingSession } from '../../session/coding_session.js';
import type { PiAgentSession } from '../../session/pi_loader.js';
import type { AgentSessionEventListener } from '@mariozechner/pi-coding-agent';
import type { CodingSessionEvent } from '@uaip/types';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}));

const TMP_DIR = '/tmp/exec-node-coding-wave3-test';

function makeSession(
  id = 'wave3-session',
  opts?: { clock?: () => number; credentialSecrets?: string[] },
): CodingSession {
  return new CodingSession({
    id,
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    repositoryId: '12345678',
    sessionFile: `${TMP_DIR}/${id}.jsonl`,
    manifestPath: `${TMP_DIR}/${id}.manifest.json`,
    eventTailPath: `${TMP_DIR}/${id}.events.jsonl`,
    replayBufferSize: 200,
    clock: opts?.clock,
    credentialSecrets: opts?.credentialSecrets,
  });
}

function makeFakePiSession(overrides?: Partial<PiAgentSession>): PiAgentSession {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    abortBash: vi.fn(),
    isBashRunning: false,
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

function asAgentEvent(raw: Record<string, unknown>): Parameters<AgentSessionEventListener>[0] {
  return raw as unknown as Parameters<AgentSessionEventListener>[0];
}

function captureListener(session: CodingSession): { listener: ReturnType<typeof getCapturedListener> } {
  let capturedListener: AgentSessionEventListener | undefined;
  session.attachPiSession(makeFakePiSession({
    subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
      capturedListener = l;
      return () => {};
    }),
  }));
  return {
    get listener() { return capturedListener; },
  } as { listener: ReturnType<typeof getCapturedListener> };
}

function getCapturedListener(): AgentSessionEventListener | undefined {
  return undefined;
}

describe('CodingSession — Wave C timing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tracks turn start and computes turnDurationMs on agent_end', () => {
    let now = 1000;
    const session = makeSession('timing-1', { clock: () => now });
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    session.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      }),
    }));

    session.transition('PROMPTING');
    now = 1000;
    capturedListener?.(asAgentEvent({ type: 'turn_start' }));
    now = 1200;
    capturedListener?.(asAgentEvent({ type: 'agent_start' }));
    now = 1500;
    capturedListener?.(asAgentEvent({ type: 'agent_end' }));

    const agentEnd = events.find((e) => e.type === 'agent_end') as Extract<CodingSessionEvent, { type: 'agent_end' }> | undefined;
    expect(agentEnd).toBeDefined();
    if (!agentEnd) return;
    expect(agentEnd.payload.turnDurationMs).toBe(500);
  });

  it('emits timeToFirstTokenMs when first non-empty assistant delta arrives', () => {
    let now = 2000;
    const session = makeSession('ttft-1', { clock: () => now });
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    session.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      }),
    }));

    session.transition('PROMPTING');
    capturedListener?.(asAgentEvent({ type: 'turn_start' }));
    now = 2100;
    capturedListener?.(asAgentEvent({ type: 'message_update', delta: '  ' }));
    now = 2200;
    capturedListener?.(asAgentEvent({ type: 'message_update', delta: 'Hello' }));
    now = 2500;
    capturedListener?.(asAgentEvent({ type: 'agent_end' }));

    const agentEnd = events.find((e) => e.type === 'agent_end') as Extract<CodingSessionEvent, { type: 'agent_end' }> | undefined;
    if (!agentEnd) return;
    expect(agentEnd.payload.timeToFirstTokenMs).toBe(200);
  });

  it('emits timeToFirstTokenMs only once', () => {
    let now = 3000;
    const session = makeSession('ttft-once', { clock: () => now });
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    session.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      }),
    }));

    session.transition('PROMPTING');
    capturedListener?.(asAgentEvent({ type: 'turn_start' }));
    now = 3100;
    capturedListener?.(asAgentEvent({ type: 'message_update', delta: 'first' }));
    now = 3200;
    capturedListener?.(asAgentEvent({ type: 'message_update', delta: 'second' }));
    now = 3500;
    capturedListener?.(asAgentEvent({ type: 'agent_end' }));

    const agentEnd = events.find((e) => e.type === 'agent_end') as Extract<CodingSessionEvent, { type: 'agent_end' }> | undefined;
    if (!agentEnd) return;
    expect(agentEnd.payload.timeToFirstTokenMs).toBe(100);
  });

  it('turnDurationMs is 0 when turn_start was not received', () => {
    const now = 5000;
    const session = makeSession('no-turn-start', { clock: () => now });
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    session.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      }),
    }));

    session.transition('PROMPTING');
    capturedListener?.(asAgentEvent({ type: 'agent_start' }));
    capturedListener?.(asAgentEvent({ type: 'agent_end' }));

    const agentEnd = events.find((e) => e.type === 'agent_end') as Extract<CodingSessionEvent, { type: 'agent_end' }> | undefined;
    if (!agentEnd) return;
    expect(agentEnd.payload.turnDurationMs).toBe(0);
  });
});

describe('CodingSession — Wave C receipt emission', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits receipt event on tool_execution_end for file_read', () => {
    const session = makeSession('receipt-1');
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    session.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      }),
    }));

    capturedListener?.(asAgentEvent({
      type: 'tool_execution_end',
      toolName: 'file_read',
      input: { path: '/workspace/a.ts' },
      result: { lineCount: 5 },
    }));

    const receipt = events.find((e) => e.type === 'receipt') as Extract<CodingSessionEvent, { type: 'receipt' }> | undefined;
    expect(receipt).toBeDefined();
    if (!receipt) return;
    expect(receipt.payload).toEqual({ kind: 'file_read', path: '/workspace/a.ts', lineCount: 5 });
  });

  it('emits receipt event on tool_execution_end for shell_run with hashed command', () => {
    const session = makeSession('receipt-shell');
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    session.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      }),
    }));

    capturedListener?.(asAgentEvent({
      type: 'tool_execution_end',
      toolName: 'shell_run',
      input: { command: 'npm test' },
      result: { exitCode: 0, durationMs: 100 },
    }));

    const receipt = events.find((e) => e.type === 'receipt') as Extract<CodingSessionEvent, { type: 'receipt' }> | undefined;
    if (!receipt) return;
    expect(receipt.payload.kind).toBe('shell_run');
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain('npm test');
  });

  it('emits structured test events from test_run tool', () => {
    const session = makeSession('receipt-tests');
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    session.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      }),
    }));

    capturedListener?.(asAgentEvent({
      type: 'tool_execution_end',
      toolName: 'run_tests',
      input: {},
      result: {},
      testRun: {
        runner: 'vitest',
        fileCount: 2,
        cases: [
          { name: 'test A', file: 'a.test.ts', status: 'pass', durationMs: 5 },
        ],
        summary: { passed: 1, failed: 0, skipped: 0, success: true },
        durationMs: 50,
      },
    }));

    const testEvents = events.filter((e) => e.type.startsWith('test_')) as Array<Extract<CodingSessionEvent, { type: 'test_run_start' | 'test_case_result' | 'test_run_end' }>>;
    expect(testEvents).toHaveLength(3);
    expect(testEvents[0]?.type).toBe('test_run_start');
    expect(testEvents[1]?.type).toBe('test_case_result');
    expect(testEvents[2]?.type).toBe('test_run_end');
  });

  it('emits known test events from upstream pi events with test_run_start type', () => {
    const session = makeSession('test-upstream');
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    session.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      }),
    }));

    capturedListener?.(asAgentEvent({
      type: 'test_run_start',
      payload: { runner: 'vitest', fileCount: 3 },
    }));

    const testStart = events.find((e) => e.type === 'test_run_start');
    expect(testStart).toBeDefined();
  });
});

describe('CodingSession — Wave C provision events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits provision events in correct order via emitProvisionLifecycle', () => {
    const session = makeSession('provision-1');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    session.emitProvisionLifecycle(['queued', 'cloning', 'installing', 'ready']);

    const provisionEvents = events.filter((e) => e.type.startsWith('provision_'));
    expect(provisionEvents).toHaveLength(4);
    expect(provisionEvents[0]?.type).toBe('provision_queued');
    expect(provisionEvents[1]?.type).toBe('provision_cloning');
    expect(provisionEvents[2]?.type).toBe('provision_installing');
    expect(provisionEvents[3]?.type).toBe('provision_ready');
  });

  it('provision events are replayable via replayAll', () => {
    const session = makeSession('provision-replay');
    session.emitProvision('queued');
    session.emitProvision('ready');

    const replayed: CodingSessionEvent[] = [];
    session.replayAll((e) => replayed.push(e));

    const provisionTypes = replayed.filter((e) => e.type.startsWith('provision_')).map((e) => e.type);
    expect(provisionTypes).toEqual(['provision_queued', 'provision_ready']);
  });

  it('cloning stage is only emitted when credential clone occurs', () => {
    const session = makeSession('provision-no-clone');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    session.emitProvisionLifecycle(['queued', 'installing', 'ready']);
    const types = events.map((e) => e.type);
    expect(types).not.toContain('provision_cloning');
    expect(types).toContain('provision_queued');
  });

  it('provision events use monotonic seq', () => {
    const session = makeSession('provision-seq');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    session.emitProvision('queued');
    session.emitProvision('ready');

    expect(events[0]?.seq).toBe(1);
    expect(events[1]?.seq).toBe(2);
  });
});

describe('CodingSession — Wave C unknown event handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unknown pi event becomes recoverable error event, not session ERROR', () => {
    const session = makeSession('unknown-event');
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    const captured = captureListener(session);

    captured.listener?.(asAgentEvent({ type: 'some_new_pi_event_type', data: 'stuff' }));

    expect(session.state).toBe('READY');
    const errorEvent = events.find((e) => e.type === 'error') as Extract<CodingSessionEvent, { type: 'error' }> | undefined;
    expect(errorEvent).toBeDefined();
    if (!errorEvent) return;
    expect(errorEvent.payload.recoverable).toBe(true);
    expect(errorEvent.payload.code).toBe('UNKNOWN_EVENT');
  });

  it('non-object pi event is ignored with warning, not throw', () => {
    const session = makeSession('non-object');
    session.transition('READY');
    let capturedListener: AgentSessionEventListener | undefined;
    session.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((l: AgentSessionEventListener) => {
        capturedListener = l;
        return () => {};
      }),
    }));

    expect(() => capturedListener?.(null as unknown as Parameters<AgentSessionEventListener>[0])).not.toThrow();
    expect(session.state).toBe('READY');
  });
});

describe('CodingSession — Wave C backpressure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('buildBackpressureEvent creates a valid backpressure event with next monotonic seq', () => {
    const session = makeSession('backpressure-1');
    session.transition('READY');
    const events: CodingSessionEvent[] = [];
    session.subscribe((e) => events.push(e));

    const seqBefore = session.lastEventSeq;
    const event = session.buildBackpressureEvent();

    expect(event.type).toBe('backpressure');
    expect(event.seq).toBe(seqBefore + 1);
    expect((event as Extract<CodingSessionEvent, { type: 'backpressure' }>).payload.droppedAfterSeq).toBe(seqBefore);
    expect(session.lastEventSeq).toBe(seqBefore + 1);
  });

  it('backpressure event is persisted in replay buffer', () => {
    const session = makeSession('backpressure-replay');
    session.transition('READY');

    session.buildBackpressureEvent();
    session.buildBackpressureEvent();

    const replayed: CodingSessionEvent[] = [];
    session.replayAll((e) => replayed.push(e));
    const bpEvents = replayed.filter((e) => e.type === 'backpressure');
    expect(bpEvents.length).toBeGreaterThanOrEqual(2);
  });
});
