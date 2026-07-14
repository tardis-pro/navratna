import { describe, it, expect, vi } from 'vitest';
import {
  CodingSessionAuditSink,
  RedactionError,
  CODING_SESSION_EVENT,
} from '../../services/execution_mesh/coding_session_audit_sink.js';
import type {
  AuditWriter,
  SecretScanner,
  AuditEventInput,
  SecretScanResult,
  CodingSessionAuditDetails,
  CodingSessionEventType,
} from '../../services/execution_mesh/coding_session_audit_sink.js';

function makeCleanScanner(): SecretScanner {
  return { scanForRawSecrets: vi.fn().mockReturnValue({ clean: true, flaggedCount: 0 } satisfies SecretScanResult) };
}
function makeDirtyScanner(count = 1): SecretScanner {
  return { scanForRawSecrets: vi.fn().mockReturnValue({ clean: false, flaggedCount: count } satisfies SecretScanResult) };
}
function makeWriter(): { writer: AuditWriter; calls: AuditEventInput[] } {
  const calls: AuditEventInput[] = [];
  const writer: AuditWriter = { appendEvent: vi.fn(async (i: AuditEventInput) => { calls.push(i); return i; }) };
  return { writer, calls };
}
function makeFailWriter(msg = 'DB down'): AuditWriter {
  return { appendEvent: vi.fn().mockRejectedValue(new Error(msg)) };
}

const SID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const AID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeSink(writer: AuditWriter, scanner: SecretScanner): CodingSessionAuditSink {
  return new CodingSessionAuditSink({ writer, scanner });
}
function base(o: Partial<CodingSessionAuditDetails> = {}): CodingSessionAuditDetails {
  return { sessionId: SID, workspaceId: WID, ...o };
}

describe('CodingSessionAuditSink — all transition events emitted', () => {
  const cases: Array<{ eventType: CodingSessionEventType; details: CodingSessionAuditDetails }> = [
    { eventType: CODING_SESSION_EVENT.PROVISION_REQUESTED, details: base({ state: 'CREATING', outcome: 'requested' }) },
    { eventType: CODING_SESSION_EVENT.PROVISION_SUCCEEDED, details: base({ state: 'READY', outcome: 'succeeded' }) },
    { eventType: CODING_SESSION_EVENT.PROVISION_FAILED, details: base({ state: 'CREATING', outcome: 'failed' }) },
    { eventType: CODING_SESSION_EVENT.SESSION_READY, details: base({ state: 'READY', outcome: 'ready' }) },
    { eventType: CODING_SESSION_EVENT.PROMPT_REQUESTED, details: base({ state: 'PROMPTING', outcome: 'requested' }) },
    { eventType: CODING_SESSION_EVENT.PROMPT_ACCEPTED, details: base({ state: 'PROMPTING', outcome: 'accepted' }) },
    { eventType: CODING_SESSION_EVENT.PROMPT_DUPLICATE, details: base({ outcome: 'duplicate', duplicateKind: 'pending_duplicate' }) },
    { eventType: CODING_SESSION_EVENT.PROMPT_REJECTED, details: base({ outcome: 'not_found', reasonCode: 'NOT_FOUND' }) },
    { eventType: CODING_SESSION_EVENT.ABORT_REQUESTED, details: base({ state: 'PROMPTING', outcome: 'requested' }) },
    { eventType: CODING_SESSION_EVENT.ABORT_COMPLETED, details: base({ state: 'READY', outcome: 'aborted' }) },
    { eventType: CODING_SESSION_EVENT.CLOSE_REQUESTED, details: base({ state: 'READY', outcome: 'requested' }) },
    { eventType: CODING_SESSION_EVENT.CLOSE_COMPLETED, details: base({ state: 'CLOSED', outcome: 'closed' }) },
    { eventType: CODING_SESSION_EVENT.DESTROY_COMPLETED, details: base({ state: 'DESTROYED', outcome: 'destroyed' }) },
  ];

  for (const { eventType, details } of cases) {
    it(`emits "${eventType}" with entityId and entityType`, async () => {
      const { writer, calls } = makeWriter();
      const sink = makeSink(writer, makeCleanScanner());
      await sink.append({ eventType, sessionId: SID, workspaceId: WID, actorId: AID, actorType: 'user', details });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.eventType).toBe(eventType);
      expect(calls[0]!.entityId).toBe(SID);
      expect(calls[0]!.entityType).toBe('coding_session');
    });
  }
});

describe('CodingSessionAuditSink — actorType=user when userId supplied', () => {
  it('records actorType=user', async () => {
    const { writer, calls } = makeWriter();
    const sink = makeSink(writer, makeCleanScanner());
    await sink.append({ eventType: CODING_SESSION_EVENT.PROVISION_REQUESTED, sessionId: SID, workspaceId: WID, actorId: AID, actorType: 'user', details: base({ state: 'CREATING', outcome: 'requested' }) });
    expect(calls[0]!.actorType).toBe('user');
  });
});

describe('CodingSessionAuditSink — scan-before-append', () => {
  it('calls scanner before writer', async () => {
    const scanner = makeCleanScanner();
    const { writer, calls } = makeWriter();
    const sink = makeSink(writer, scanner);
    await sink.append({ eventType: CODING_SESSION_EVENT.SESSION_READY, sessionId: SID, workspaceId: WID, actorId: AID, actorType: 'user', details: base({ state: 'READY' }) });
    expect(scanner.scanForRawSecrets).toHaveBeenCalledOnce();
    const scanOrder = vi.mocked(scanner.scanForRawSecrets).mock.invocationCallOrder[0]!;
    const writeOrder = vi.mocked(writer.appendEvent).mock.invocationCallOrder[0]!;
    expect(scanOrder).toBeLessThan(writeOrder);
    expect(calls).toHaveLength(1);
  });

  it('blocks intent event and throws RedactionError when scanner flags', async () => {
    const { writer, calls } = makeWriter();
    const sink = makeSink(writer, makeDirtyScanner(2));
    await expect(sink.append({ eventType: CODING_SESSION_EVENT.PROVISION_REQUESTED, sessionId: SID, workspaceId: WID, actorId: AID, actorType: 'user', details: base({ state: 'CREATING' }) })).rejects.toThrow(RedactionError);
    expect(calls).toHaveLength(0);
  });

  it('blocks outcome event but does NOT throw when scanner flags', async () => {
    const { writer, calls } = makeWriter();
    const sink = makeSink(writer, makeDirtyScanner(1));
    await expect(sink.append({ eventType: CODING_SESSION_EVENT.PROVISION_SUCCEEDED, sessionId: SID, workspaceId: WID, actorId: AID, actorType: 'user', details: base({ state: 'READY' }) })).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

describe('CodingSessionAuditSink — Bearer-token blocked', () => {
  it('blocks intent event append when details contain a Bearer-like string', async () => {
    const realScanner: SecretScanner = {
      scanForRawSecrets(obj: object) {
        const json = JSON.stringify(obj);
        const flagged = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(json);
        return { clean: !flagged, flaggedCount: flagged ? 1 : 0 };
      },
    };
    const { writer, calls } = makeWriter();
    const sink = makeSink(writer, realScanner);
    const bad = { sessionId: SID, workspaceId: WID, outcome: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig' } as unknown as CodingSessionAuditDetails;
    await expect(sink.append({ eventType: CODING_SESSION_EVENT.PROMPT_REQUESTED, sessionId: SID, workspaceId: WID, actorId: AID, actorType: 'user', details: bad })).rejects.toThrow(RedactionError);
    expect(calls).toHaveLength(0);
  });
});

describe('CodingSessionAuditSink — raw prompt never reaches sink', () => {
  it('written details contain no prompt/message/command/output keys', async () => {
    const { writer, calls } = makeWriter();
    const sink = makeSink(writer, makeCleanScanner());
    await sink.append({ eventType: CODING_SESSION_EVENT.PROMPT_ACCEPTED, sessionId: SID, workspaceId: WID, actorId: AID, actorType: 'user', details: base({ state: 'PROMPTING', outcome: 'accepted', idempotencyKeyPresent: true }) });
    const prohibited = ['message', 'command', 'output', 'promptText', 'prompt_text', 'rawPrompt'];
    const keys = Object.keys(calls[0]!.details);
    for (const k of prohibited) expect(keys).not.toContain(k);
  });
});

describe('CodingSessionAuditSink — intent events fail-closed', () => {
  const intentEvents: CodingSessionEventType[] = [
    CODING_SESSION_EVENT.PROVISION_REQUESTED,
    CODING_SESSION_EVENT.PROMPT_REQUESTED,
    CODING_SESSION_EVENT.ABORT_REQUESTED,
    CODING_SESSION_EVENT.CLOSE_REQUESTED,
  ];
  for (const eventType of intentEvents) {
    it(`throws for intent event "${eventType}" on writer failure`, async () => {
      const sink = makeSink(makeFailWriter(), makeCleanScanner());
      await expect(sink.append({ eventType, sessionId: SID, workspaceId: WID, actorId: AID, actorType: 'user', details: base() })).rejects.toThrow('DB down');
    });
  }
});

describe('CodingSessionAuditSink — outcome events fail-observable', () => {
  const outcomeEvents: CodingSessionEventType[] = [
    CODING_SESSION_EVENT.PROVISION_SUCCEEDED, CODING_SESSION_EVENT.PROVISION_FAILED,
    CODING_SESSION_EVENT.SESSION_READY, CODING_SESSION_EVENT.PROMPT_ACCEPTED,
    CODING_SESSION_EVENT.PROMPT_DUPLICATE, CODING_SESSION_EVENT.PROMPT_REJECTED,
    CODING_SESSION_EVENT.ABORT_COMPLETED, CODING_SESSION_EVENT.CLOSE_COMPLETED,
    CODING_SESSION_EVENT.DESTROY_COMPLETED,
  ];
  for (const eventType of outcomeEvents) {
    it(`does not throw for outcome event "${eventType}" on writer failure`, async () => {
      const sink = makeSink(makeFailWriter(), makeCleanScanner());
      await expect(sink.append({ eventType, sessionId: SID, workspaceId: WID, actorId: AID, actorType: 'user', details: base() })).resolves.toBeUndefined();
    });
  }
});

describe('RedactionError — only flaggedCount exposed', () => {
  it('message contains count but not paths/values/pattern labels', async () => {
    const secretValue = 'sk_live_supersecretkey123456789';
    const scanner: SecretScanner = { scanForRawSecrets: vi.fn().mockReturnValue({ clean: false, flaggedCount: 1 } satisfies SecretScanResult) };
    const sink = makeSink(makeWriter().writer, scanner);
    let thrown: RedactionError | null = null;
    try {
      await sink.append({ eventType: CODING_SESSION_EVENT.PROVISION_REQUESTED, sessionId: secretValue, workspaceId: WID, actorId: AID, actorType: 'user', details: base() });
    } catch (e) { if (e instanceof RedactionError) thrown = e; }
    expect(thrown).not.toBeNull();
    expect(thrown!.message).not.toContain(secretValue);
    expect(thrown!.message).not.toContain('$.sessionId');
    expect(thrown!.message).not.toContain('API key');
    expect(thrown!.message).not.toContain('Bearer');
    expect(thrown!.redactionFailure.flaggedCount).toBe(1);
  });
});
