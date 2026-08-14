import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * The approval-reply branch is the inbound half of approval-over-WhatsApp. It must:
 *   - run BEFORE every existing routing branch (a pending agent selection otherwise
 *     swallows the reply as a menu choice), yet leave normal chat traffic untouched;
 *   - accept a decision ONLY from a 1:1 chat by an explicitly allow-listed JID —
 *     in a group `msg.from` is the group JID and the participant is never captured,
 *     so the sender cannot be identified;
 *   - never leak whether a code is real to an unauthorised sender;
 *   - never assert the outcome itself — that arrives on `approval.decision.ack`.
 * The outbound half (`notification.whatsapp.send`) crosses a process boundary, so a
 * failed send must be logged loudly rather than swallowed.
 */

const ALLOWLIST_PREFIX = 'whatsapp:approval:allowlist:';

const loggerStub = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const redisStore = new Map<string, string>();
const redisStub = {
  on: vi.fn(),
  get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => {
    redisStore.set(key, value);
    return 'OK';
  }),
  del: vi.fn(async (key: string) => (redisStore.delete(key) ? 1 : 0)),
  mget: vi.fn(async (...keys: string[]) => keys.map((k) => redisStore.get(k) ?? null)),
  scan: vi.fn(async (_cursor: string, _match: string, pattern: string) => {
    const prefix = pattern.replace(/\*$/, '');
    return ['0', [...redisStore.keys()].filter((k) => k.startsWith(prefix))];
  }),
};

const clientStub = Object.assign(new EventEmitter(), {
  connect: vi.fn<() => Promise<void>>(async () => {}),
  sendText: vi.fn<(jid: string, text: string) => Promise<void>>(async () => {}),
  getState: vi.fn(() => 'connected'),
  getConnectedInfo: vi.fn(() => null),
  isDestroyed: vi.fn(() => false),
});

const namespaceStub = {
  emit: vi.fn(),
  on: vi.fn(),
};

type Subscriber = (event: { data: unknown }) => Promise<void>;

const subscriptions = new Map<string, Subscriber>();
const eventBusStub = {
  publish: vi.fn<(eventType: string, payload: unknown) => Promise<void>>(async () => {}),
  // Must keep a real implementation: the handler chains `.catch()` onto the result.
  subscribe: vi.fn<(eventType: string, handler: Subscriber) => Promise<void>>(
    async (eventType, handler) => {
      subscriptions.set(eventType, handler);
    }
  ),
};

const ioStub = {
  of: vi.fn(() => namespaceStub),
};

vi.mock('ioredis', () => ({
  default: class {
    constructor() {
      return redisStub;
    }
  },
}));

vi.mock('@uaip/infra', () => ({
  getRedisTLSOptions: () => ({}),
}));

vi.mock('@uaip/utils', () => ({
  createLogger: () => loggerStub,
  InternalServerError: class extends Error {},
  ExternalServiceError: class extends Error {},
}));

vi.mock('@uaip/middleware', () => ({
  validateJWTToken: vi.fn(async () => null),
}));

vi.mock('../../whatsapp/baileys_client.js', () => ({
  BaileysClient: class {
    constructor() {
      return clientStub;
    }
  },
}));

const { WhatsAppHandler } = await import('../../whatsapp/whatsapp_handler.js');

const APPROVER_JID = '919812345678@s.whatsapp.net';
const STRANGER_JID = '447700900123@s.whatsapp.net';
const GROUP_JID = '120363000000000000@g.us';

function incoming(overrides: Record<string, unknown> = {}) {
  return {
    id: 'MSG1',
    from: APPROVER_JID,
    fromName: 'Admin',
    text: 'A 7C3F',
    timestamp: 1_700_000_000,
    isGroup: false,
    type: 'text' as const,
    ...overrides,
  };
}

/** Deliver a message the way BaileysClient does, and wait for the async handler. */
async function deliver(msg: ReturnType<typeof incoming>): Promise<void> {
  clientStub.emit('message', msg);
  // handleIncomingMessage is fired unawaited from the listener; drain the microtasks.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The `approval.decision.submitted` payload, exactly as CONTRACT.md specifies it. */
interface SubmittedDecision {
  code: string;
  approved: boolean;
  channel: string;
  jid: string;
  approverUserId: string;
  submittedAt: string;
}

function isSubmittedDecision(v: unknown): v is SubmittedDecision {
  return (
    typeof v === 'object' &&
    v !== null &&
    'code' in v &&
    typeof v.code === 'string' &&
    'approved' in v &&
    typeof v.approved === 'boolean' &&
    'channel' in v &&
    typeof v.channel === 'string' &&
    'jid' in v &&
    typeof v.jid === 'string' &&
    'approverUserId' in v &&
    typeof v.approverUserId === 'string' &&
    'submittedAt' in v &&
    typeof v.submittedAt === 'string'
  );
}

function submittedDecisionPayloads(): unknown[] {
  return eventBusStub.publish.mock.calls
    .filter((call) => call[0] === 'approval.decision.submitted')
    .map((call) => call[1]);
}

/**
 * Assert exactly one decision was published AND that it matches the contract shape,
 * then narrow it. Throwing on a shape mismatch is deliberate: silently filtering a
 * malformed payload out would make a broken publish look identical to no publish.
 */
function expectSingleDecision(): SubmittedDecision {
  const payloads = submittedDecisionPayloads();
  expect(payloads).toHaveLength(1);

  const [payload] = payloads;
  if (!isSubmittedDecision(payload)) {
    throw new Error(
      `approval.decision.submitted payload does not match the contract: ${JSON.stringify(payload)}`
    );
  }
  return payload;
}

describe('WhatsApp approval reply handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    subscriptions.clear();
    clientStub.removeAllListeners();
    clientStub.sendText.mockReset();
    clientStub.sendText.mockResolvedValue(undefined);

    redisStore.set(
      `${ALLOWLIST_PREFIX}${APPROVER_JID}`,
      JSON.stringify({
        userId: 'user-abc',
        addedAt: '2026-01-01T00:00:00.000Z',
        addedBy: 'admin-1',
      })
    );

    process.env.WHATSAPP_APPROVER_ALLOWLIST = '';
    // oxlint-disable-next-line no-new -- constructed for its side effects on the shared stubs
    new WhatsAppHandler(ioStub as never, eventBusStub as never);
  });

  it('publishes an approval for "A 7C3F" from an allow-listed 1:1 JID', async () => {
    await deliver(incoming({ text: 'A 7C3F' }));

    const decision = expectSingleDecision();
    expect(decision).toMatchObject({
      code: '7C3F',
      approved: true,
      channel: 'whatsapp',
      jid: APPROVER_JID,
      approverUserId: 'user-abc',
    });
    expect(Number.isNaN(Date.parse(decision.submittedAt))).toBe(false);
  });

  it('parses lowercase "r 7c3f" as a rejection and uppercases the code', async () => {
    await deliver(incoming({ text: 'r 7c3f' }));

    const decision = expectSingleDecision();
    expect(decision).toMatchObject({ code: '7C3F', approved: false });
  });

  it('does not confirm the decision itself — the ack is authoritative', async () => {
    await deliver(incoming({ text: 'A 7C3F' }));

    const replies = clientStub.sendText.mock.calls.map((c) => String(c[1]).toLowerCase());
    expect(replies.some((r) => r.includes('approved'))).toBe(false);
  });

  it('publishes nothing for a non-allow-listed JID and does not reveal the code', async () => {
    await deliver(incoming({ from: STRANGER_JID, text: 'A 7C3F' }));

    expect(submittedDecisionPayloads()).toHaveLength(0);
    expect(loggerStub.warn).toHaveBeenCalledWith(
      expect.stringContaining('SECURITY'),
      expect.objectContaining({ jid: STRANGER_JID, code: '7C3F' })
    );

    expect(clientStub.sendText).toHaveBeenCalledTimes(1);
    const reply = String(clientStub.sendText.mock.calls[0][1]);
    expect(clientStub.sendText.mock.calls[0][0]).toBe(STRANGER_JID);
    expect(reply).toBe('Not authorised.');
    expect(reply).not.toContain('7C3F');
  });

  it('publishes nothing when the same text arrives from a group chat', async () => {
    // Even with the group's JID allow-listed, the individual participant is unknowable.
    redisStore.set(
      `${ALLOWLIST_PREFIX}${GROUP_JID}`,
      JSON.stringify({ userId: 'user-abc', addedAt: 'x', addedBy: 'admin-1' })
    );

    await deliver(incoming({ from: GROUP_JID, isGroup: true, groupJid: GROUP_JID }));

    expect(submittedDecisionPayloads()).toHaveLength(0);
    expect(eventBusStub.publish).not.toHaveBeenCalled();
    expect(clientStub.sendText).not.toHaveBeenCalled();
    expect(loggerStub.warn).toHaveBeenCalledWith(
      expect.stringContaining('non-1:1'),
      expect.objectContaining({ jid: GROUP_JID })
    );
  });

  it.each(['hello', 'A 7C3', 'A 7C3F extra', 'AA 7C3F', 'A7C3F'])(
    'lets non-matching text %j fall through to the existing routing branches',
    async (text) => {
      redisStore.set(`whatsapp:binding:${APPROVER_JID}`, 'agent-1');

      await deliver(incoming({ text }));

      expect(submittedDecisionPayloads()).toHaveLength(0);
      // The existing selection lookup ran, then the binding lookup routed to the agent.
      expect(redisStub.get).toHaveBeenCalledWith(`whatsapp:selecting:${APPROVER_JID}`);
      expect(redisStub.get).toHaveBeenCalledWith(`whatsapp:binding:${APPROVER_JID}`);
      expect(eventBusStub.publish).toHaveBeenCalledWith(
        'agent.chat.request',
        expect.objectContaining({ agentId: 'agent-1', message: text })
      );
    }
  );

  it('is not swallowed by a pending agent selection', async () => {
    // This is why the branch must come FIRST: handleSelectionReply consumes any text
    // while a selection is pending, so a later branch would eat the approval.
    redisStore.set(
      `whatsapp:selecting:${APPROVER_JID}`,
      JSON.stringify({
        agents: [{ id: 'agent-1', name: 'One', description: '' }],
        expiresAt: Date.now() + 60_000,
      })
    );

    await deliver(incoming({ text: 'A 7C3F' }));

    expect(submittedDecisionPayloads()).toHaveLength(1);
    expect(redisStore.has(`whatsapp:selecting:${APPROVER_JID}`)).toBe(true);
  });

  it('does not touch the selection or binding state when the approval branch fires', async () => {
    await deliver(incoming({ text: 'A 7C3F' }));

    expect(redisStub.get).not.toHaveBeenCalledWith(`whatsapp:selecting:${APPROVER_JID}`);
    expect(redisStub.get).not.toHaveBeenCalledWith(`whatsapp:binding:${APPROVER_JID}`);
  });
});

describe('WhatsApp approval event subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    subscriptions.clear();
    clientStub.removeAllListeners();
    clientStub.sendText.mockReset();
    clientStub.sendText.mockResolvedValue(undefined);

    process.env.WHATSAPP_APPROVER_ALLOWLIST = '';
    // oxlint-disable-next-line no-new -- constructed for its side effects on the shared stubs
    new WhatsAppHandler(ioStub as never, eventBusStub as never);
  });

  it('normalises a bare E.164 "to" into a 1:1 JID', async () => {
    const handler = subscriptions.get('notification.whatsapp.send');
    expect(handler).toBeDefined();

    await handler!({
      data: { to: '919812345678', text: 'Approve deploy-prod? Reply A 7C3F', correlationId: 'wf-1' },
    });

    expect(clientStub.sendText).toHaveBeenCalledWith(
      '919812345678@s.whatsapp.net',
      'Approve deploy-prod? Reply A 7C3F'
    );
  });

  it('passes through a "to" that already carries a JID', async () => {
    const handler = subscriptions.get('notification.whatsapp.send');

    await handler!({ data: { to: APPROVER_JID, text: 'hi', correlationId: 'wf-2' } });

    expect(clientStub.sendText).toHaveBeenCalledWith(APPROVER_JID, 'hi');
  });

  it('logs an error with the correlationId when the client is disconnected', async () => {
    clientStub.sendText.mockRejectedValueOnce(new Error('WhatsApp not connected'));
    const handler = subscriptions.get('notification.whatsapp.send');

    await expect(
      handler!({ data: { to: '919812345678', text: 'hi', correlationId: 'wf-3' } })
    ).resolves.toBeUndefined();

    expect(loggerStub.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to deliver WhatsApp notification'),
      expect.objectContaining({ correlationId: 'wf-3' })
    );
  });

  it('drops a malformed notification payload loudly instead of sending', async () => {
    const handler = subscriptions.get('notification.whatsapp.send');

    await handler!({ data: { to: '', text: 'hi', correlationId: 'wf-4' } });
    await handler!({ data: null });

    expect(clientStub.sendText).not.toHaveBeenCalled();
    expect(loggerStub.error).toHaveBeenCalledTimes(2);
  });

  it('delivers an approval.decision.ack message to the given jid', async () => {
    const handler = subscriptions.get('approval.decision.ack');
    expect(handler).toBeDefined();

    await handler!({ data: { jid: APPROVER_JID, ok: true, message: 'Approved deploy-prod #42.' } });

    expect(clientStub.sendText).toHaveBeenCalledWith(APPROVER_JID, 'Approved deploy-prod #42.');
  });

  it('does not throw out of the ack subscriber when the send fails', async () => {
    clientStub.sendText.mockRejectedValueOnce(new Error('WhatsApp not connected'));
    const handler = subscriptions.get('approval.decision.ack');

    await expect(
      handler!({ data: { jid: APPROVER_JID, ok: false, message: 'Code expired.' } })
    ).resolves.toBeUndefined();

    expect(loggerStub.error).toHaveBeenCalled();
  });
});
