import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodingSession, ConflictError, AbortError } from '../../session/coding_session.js';
import type { PiAgentSession } from '../../session/pi_loader.js';
import type { AgentSessionEvent, AgentSessionEventListener } from '@mariozechner/pi-coding-agent';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}));

const TMP_DIR = '/tmp/exec-node-coding-test';

function makeSession(id = 'test-session-1', opts?: { completedKeyTtlMs?: number; credentialSecrets?: string[] }): CodingSession {
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
    completedKeyTtlMs: opts?.completedKeyTtlMs,
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

function asAgentEvent(raw: Record<string, unknown>): AgentSessionEvent {
  return raw as unknown as AgentSessionEvent;
}

describe('CodingSession — state machine', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('starts in CREATING state', () => {
    expect(makeSession().state).toBe('CREATING');
  });

  it('transitions CREATING → READY', () => {
    const s = makeSession();
    s.transition('READY');
    expect(s.state).toBe('READY');
  });

  it('throws on invalid transition', () => {
    expect(() => makeSession().transition('STREAMING')).toThrow('Invalid state transition');
  });

  it('PROMPTING state is set immediately after sendPrompt', async () => {
    const s = makeSession();
    s.transition('READY');
    s.attachPiSession(makeFakePiSession());
    const p = s.sendPrompt('hello', 'idem-1');
    expect(s.state).toBe('PROMPTING');
    await p;
  });

  it('rejects prompt when not READY', async () => {
    await expect(makeSession().sendPrompt('hello', 'key-1')).rejects.toThrow('not READY');
  });

  it('abort sets state ABORTING → READY when both succeed', async () => {
    const s = makeSession();
    s.transition('READY');
    s.transition('PROMPTING');
    const pi = makeFakePiSession();
    s.attachPiSession(pi);
    await s.abort();
    expect(pi.abortBash).toHaveBeenCalled();
    expect(pi.abort).toHaveBeenCalled();
    expect(s.state).toBe('READY');
  });

  it('abort still calls abort() even when abortBash() throws', async () => {
    const s = makeSession();
    s.transition('READY');
    s.transition('PROMPTING');
    const pi = makeFakePiSession({
      abortBash: vi.fn().mockImplementation(() => { throw new Error('bash abort exploded'); }),
    });
    s.attachPiSession(pi);
    await expect(s.abort()).rejects.toBeInstanceOf(AbortError);
    expect(pi.abort).toHaveBeenCalled();
    expect(s.state).toBe('ERROR');
  });

  it('abort transitions to ERROR when piSession.abort() throws', async () => {
    const s = makeSession();
    s.transition('READY');
    s.transition('PROMPTING');
    const pi = makeFakePiSession({
      abort: vi.fn().mockRejectedValue(new Error('abort exploded')),
    });
    s.attachPiSession(pi);
    await expect(s.abort()).rejects.toBeInstanceOf(AbortError);
    expect(s.state).toBe('ERROR');
  });

  it('abort transitions to ERROR when isBashRunning is true after abort', async () => {
    const s = makeSession();
    s.transition('READY');
    s.transition('PROMPTING');
    const pi = makeFakePiSession({ isBashRunning: true });
    s.attachPiSession(pi);
    await expect(s.abort()).rejects.toBeInstanceOf(AbortError);
    expect(s.state).toBe('ERROR');
  });

  it('abort is no-op on CLOSED session', async () => {
    const s = makeSession();
    s.transition('READY');
    s.attachPiSession(makeFakePiSession());
    await s.close('test');
    await s.abort();
    expect(s.state).toBe('CLOSED');
  });

  it('wasInterrupted returns true for PROMPTING/STREAMING/ABORTING', () => {
    const s = makeSession();
    s.transition('READY');
    s.transition('PROMPTING');
    expect(s.wasInterrupted()).toBe(true);
  });

  it('wasInterrupted returns false for READY', () => {
    const s = makeSession();
    s.transition('READY');
    expect(s.wasInterrupted()).toBe(false);
  });
});

describe('CodingSession — idempotency', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rejects duplicate pending key with ConflictError', async () => {
    const s = makeSession();
    s.transition('READY');
    s.attachPiSession(makeFakePiSession());
    (s as unknown as { _activeIdempotencyKey: string })._activeIdempotencyKey = 'key-A';
    await expect(s.sendPrompt('second', 'key-A')).rejects.toBeInstanceOf(ConflictError);
  });

  it('returns alreadyCompleted for completed key within TTL', async () => {
    const s = makeSession();
    s.transition('READY');
    s.attachPiSession(makeFakePiSession());
    s._markKeyCompleted('key-done');
    const result = await s.sendPrompt('retry', 'key-done');
    expect(result.alreadyCompleted).toBe(true);
  });

  it('treats expired completed key as new after TTL', async () => {
    vi.useFakeTimers();
    const s = makeSession('t1', { completedKeyTtlMs: 1000 });
    s.transition('READY');
    s.attachPiSession(makeFakePiSession());
    s._markKeyCompleted('key-exp');
    vi.advanceTimersByTime(2000);
    const result = await s.sendPrompt('retry', 'key-exp');
    expect(result.alreadyCompleted).toBe(false);
    vi.useRealTimers();
  });
});

describe('CodingSession — SSE subscriptions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('delivers events to subscribers', () => {
    const s = makeSession();
    const received: unknown[] = [];
    s.subscribe((e) => received.push(e));
    s.transition('READY');
    expect(received.length).toBeGreaterThan(0);
  });

  it('unsubscribes correctly', () => {
    const s = makeSession();
    const received: unknown[] = [];
    const unsub = s.subscribe((e) => received.push(e));
    s.transition('READY');
    const countBefore = received.length;
    unsub();
    s.transition('PROMPTING');
    expect(received.length).toBe(countBefore);
  });

  it('replays buffered events', () => {
    const s = makeSession();
    s.transition('READY');
    const received: unknown[] = [];
    s.replayAll((e) => received.push(e));
    expect(received.length).toBeGreaterThan(0);
  });

  it('replaySince returns only events after given seq', () => {
    const s = makeSession();
    s.transition('READY');
    s.transition('PROMPTING');
    const received: Array<{ seq: number }> = [];
    s.replaySince(1, (e) => received.push(e as { seq: number }));
    expect(received.every((e) => e.seq > 1)).toBe(true);
  });
});

describe('CodingSession — pi event handling', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('emits agent events to subscribers via attachPiSession', () => {
    const s = makeSession();
    s.transition('READY');
    const events: unknown[] = [];
    s.subscribe((e) => events.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    s.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((listener: AgentSessionEventListener) => {
        capturedListener = listener;
        return () => {};
      }),
    }));

    capturedListener?.(asAgentEvent({ type: 'agent_start', cwd: '/workspace' }));
    const agentStartEvents = (events as Array<{ type: string }>).filter((e) => e.type === 'agent_start');
    expect(agentStartEvents.length).toBeGreaterThan(0);
  });

  it('transitions PROMPTING → STREAMING on agent_start', () => {
    const s = makeSession();
    s.transition('READY');

    let capturedListener: AgentSessionEventListener | undefined;
    s.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((listener: AgentSessionEventListener) => {
        capturedListener = listener;
        return () => {};
      }),
    }));

    s.transition('PROMPTING');
    capturedListener?.(asAgentEvent({ type: 'agent_start' }));
    expect(s.state).toBe('STREAMING');
  });

  it('transitions STREAMING → READY on agent_end', () => {
    const s = makeSession();
    s.transition('READY');

    let capturedListener: AgentSessionEventListener | undefined;
    s.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((listener: AgentSessionEventListener) => {
        capturedListener = listener;
        return () => {};
      }),
    }));

    s.transition('PROMPTING');
    capturedListener?.(asAgentEvent({ type: 'agent_start' }));
    expect(s.state).toBe('STREAMING');
    capturedListener?.(asAgentEvent({ type: 'agent_end' }));
    expect(s.state).toBe('READY');
  });

  it('marks idempotency key completed on agent_end', () => {
    const s = makeSession();
    s.transition('READY');

    let capturedListener: AgentSessionEventListener | undefined;
    s.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((listener: AgentSessionEventListener) => {
        capturedListener = listener;
        return () => {};
      }),
    }));

    s.transition('PROMPTING');
    (s as unknown as { _activeIdempotencyKey: string })._activeIdempotencyKey = 'my-key';
    capturedListener?.(asAgentEvent({ type: 'agent_start' }));
    capturedListener?.(asAgentEvent({ type: 'agent_end' }));

    expect(s.checkIdempotency('my-key')).toBe('completed');
  });
});

describe('CodingSession — SSE event id format', () => {
  it('assigns sequential ids in format ${sessionId}-${seq}', () => {
    const s = makeSession('sess-xyz');
    const received: Array<{ id: string; seq: number }> = [];
    s.subscribe((e) => received.push(e as { id: string; seq: number }));
    s.transition('READY');
    expect(received[0]?.id).toBe('sess-xyz-1');
    expect(received[0]?.seq).toBe(1);
  });
});

describe('CodingSession — credential redaction', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('redacts API key from pi event payload before fan-out', () => {
    const SECRET = 'sk-supersecretapikey';
    const s = makeSession('redact-test', { credentialSecrets: [SECRET] });
    s.transition('READY');

    const received: unknown[] = [];
    s.subscribe((e) => received.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    s.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((listener: AgentSessionEventListener) => {
        capturedListener = listener;
        return () => {};
      }),
    }));

    capturedListener?.(asAgentEvent({
      type: 'message_update',
      content: `Using token ${SECRET} to authenticate`,
    }));

    const raw = JSON.stringify(received);
    expect(raw).not.toContain(SECRET);
    expect(raw).toContain('[REDACTED]');
  });

  it('redacts access token from nested object', () => {
    const TOKEN = 'oauth-token-xyz-123';
    const s = makeSession('redact-nested', { credentialSecrets: [TOKEN] });
    s.transition('READY');

    const received: unknown[] = [];
    s.subscribe((e) => received.push(e));

    let capturedListener: AgentSessionEventListener | undefined;
    s.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((listener: AgentSessionEventListener) => {
        capturedListener = listener;
        return () => {};
      }),
    }));

    capturedListener?.(asAgentEvent({
      type: 'tool_execution_start',
      tool: { name: 'bash', input: { cmd: `curl -H "Authorization: Bearer ${TOKEN}" https://api.example.com` } },
    }));

    const raw = JSON.stringify(received);
    expect(raw).not.toContain(TOKEN);
    expect(raw).toContain('[REDACTED]');
  });

  it('does not mutate the original pi event object', () => {
    const SECRET = 'dont-mutate-me';
    const s = makeSession('no-mutate', { credentialSecrets: [SECRET] });
    s.transition('READY');
    s.subscribe(() => {});

    let capturedListener: AgentSessionEventListener | undefined;
    s.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((listener: AgentSessionEventListener) => {
        capturedListener = listener;
        return () => {};
      }),
    }));

    const original = { type: 'message_update', content: `Secret: ${SECRET}` };
    capturedListener?.(asAgentEvent(original));

    expect(original.content).toContain(SECRET);
  });

  it('handles circular references without throwing', () => {
    const SECRET = 'circ-secret';
    const s = makeSession('circ-test', { credentialSecrets: [SECRET] });
    s.transition('READY');
    s.subscribe(() => {});

    let capturedListener: AgentSessionEventListener | undefined;
    s.attachPiSession(makeFakePiSession({
      subscribe: vi.fn().mockImplementation((listener: AgentSessionEventListener) => {
        capturedListener = listener;
        return () => {};
      }),
    }));

    const obj: Record<string, unknown> = { type: 'message_update', secret: SECRET };
    obj['self'] = obj;
    expect(() => capturedListener?.(asAgentEvent(obj))).not.toThrow();
  });
});

describe('CodingSession — restoreFromManifest', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws on corrupt manifest', () => {
    const s = makeSession();
    expect(() => s.restoreFromManifest({ not: 'valid' })).toThrow('Corrupt manifest');
  });

  it('throws on session ID mismatch', () => {
    const s = makeSession('my-session');
    expect(() => s.restoreFromManifest({
      sessionId: 'other-session',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      repositoryId: '12345678',
      state: 'READY',
      sessionFile: '/tmp/other.jsonl',
      lastEventSeq: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })).toThrow('session mismatch');
  });

  it('throws on tenant identity mismatch', () => {
    const s = makeSession('tenant-session');
    expect(() => s.restoreFromManifest({
      sessionId: 'tenant-session',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      userId: 'user-1',
      tenantId: 'other-tenant',
      repositoryId: '12345678',
      state: 'READY',
      sessionFile: `${TMP_DIR}/tenant-session.jsonl`,
      lastEventSeq: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })).toThrow('Manifest identity mismatch');
  });

  it('throws when the manifest points at another session file', () => {
    const s = makeSession('file-session');
    expect(() => s.restoreFromManifest({
      sessionId: 'file-session',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      repositoryId: '12345678',
      state: 'READY',
      sessionFile: `${TMP_DIR}/another-session.jsonl`,
      lastEventSeq: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })).toThrow('Manifest session file mismatch');
  });

  it('restores createdAt, updatedAt, sessionFile, lastEventSeq', () => {
    const s = makeSession('my-session');
    const oldCreatedAt = Date.now() - 100_000;
    s.restoreFromManifest({
      sessionId: 'my-session',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      repositoryId: '12345678',
      state: 'READY',
      sessionFile: `${TMP_DIR}/my-session.jsonl`,
      lastEventSeq: 42,
      createdAt: oldCreatedAt,
      updatedAt: oldCreatedAt + 1000,
    });
    expect(s.sessionFile).toBe(`${TMP_DIR}/my-session.jsonl`);
    expect(s.lastEventSeq).toBe(42);
    expect(s.manifest().createdAt).toBe(oldCreatedAt);
  });
});
