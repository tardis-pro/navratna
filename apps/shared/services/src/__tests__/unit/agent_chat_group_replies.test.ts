import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  leaseReleases: 0,
  insertedRows: [] as Array<Record<string, unknown>>,
  leaseHeld: true,
}));

vi.mock('../../database/drizzle/clients/index.js', () => {
  function tableNameOf(table: unknown): string {
    const name = (table as Record<symbol, unknown>)[Symbol.for('drizzle:Name')];
    return typeof name === 'string' ? name : 'unknown';
  }

  function tx() {
    return {
      update(table: unknown) {
        const name = tableNameOf(table);
        const chain = {
          set() {
            return chain;
          },
          where() {
            return chain;
          },
          returning() {
            if (name === 'agent_chat_messages') {
              mocks.leaseReleases += 1;
              return Promise.resolve(mocks.leaseHeld ? [{ id: 'user-message-1' }] : []);
            }
            return Promise.resolve([{ id: 'conversation-1' }]);
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve([]).then(resolve);
          },
        };
        return chain;
      },
      insert() {
        const chain = {
          values(rows: Array<Record<string, unknown>>) {
            mocks.insertedRows.push(...rows);
            return chain;
          },
          returning() {
            return Promise.resolve(
              mocks.insertedRows.map((_row, index) => ({ id: `assistant-${index}` }))
            );
          },
        };
        return chain;
      },
    };
  }

  return {
    getIntelligenceDb: () => ({
      transaction: (fn: (t: ReturnType<typeof tx>) => unknown) => fn(tx()),
    }),
  };
});

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});

import { AgentChatPersistenceService } from '../../agent_chat_persistence_service';

const ORG = '00000000-0000-0000-0000-000000000001';
const CONVERSATION = '33333333-3333-3333-3333-333333333333';
const USER_MESSAGE = '44444444-4444-4444-4444-444444444444';
const AGENT_A = '55555555-5555-5555-5555-555555555555';
const AGENT_B = '66666666-6666-6666-6666-666666666666';

describe('AgentChatPersistenceService.completeTurnWithReplies', () => {
  let service: AgentChatPersistenceService;

  beforeEach(() => {
    mocks.leaseReleases = 0;
    mocks.insertedRows = [];
    mocks.leaseHeld = true;
    service = new AgentChatPersistenceService();
  });

  it('releases the lease once no matter how many agents answered', async () => {
    await service.completeTurnWithReplies({
      conversationId: CONVERSATION,
      organizationId: ORG,
      clientTurnId: 'turn-1',
      userMessageId: USER_MESSAGE,
      processingToken: 'token-1',
      replies: [
        { agentId: AGENT_A, content: 'from A' },
        { agentId: AGENT_B, content: 'from B' },
      ],
    });

    // The lease lives on the USER row, so it can only be released once. Releasing
    // per reply would let the second agent find the turn already completed and
    // silently drop its answer.
    expect(mocks.leaseReleases).toBe(1);
  });

  it('writes one row per responding agent, each attributed', async () => {
    await service.completeTurnWithReplies({
      conversationId: CONVERSATION,
      organizationId: ORG,
      clientTurnId: 'turn-1',
      userMessageId: USER_MESSAGE,
      processingToken: 'token-1',
      replies: [
        { agentId: AGENT_A, content: 'from A', model: 'dirt-cheap' },
        { agentId: AGENT_B, content: 'from B', model: 'dirt-cheap' },
      ],
    });

    expect(mocks.insertedRows).toHaveLength(2);
    expect(mocks.insertedRows.map((row) => row.agentId)).toEqual([AGENT_A, AGENT_B]);
    // Every reply answers the same user message; the (reply_to, agent) index is
    // what keeps them distinct.
    expect(mocks.insertedRows.every((row) => row.replyToMessageId === USER_MESSAGE)).toBe(true);
  });

  it('carries each agent usage separately rather than merging it', async () => {
    await service.completeTurnWithReplies({
      conversationId: CONVERSATION,
      organizationId: ORG,
      clientTurnId: 'turn-1',
      userMessageId: USER_MESSAGE,
      processingToken: 'token-1',
      replies: [
        { agentId: AGENT_A, content: 'a', usage: { totalTokens: 10 } },
        { agentId: AGENT_B, content: 'b', usage: { totalTokens: 25 } },
      ],
    });

    expect(mocks.insertedRows.map((row) => row.totalTokens)).toEqual([10, 25]);
  });

  it('writes nothing when the lease was already lost', async () => {
    mocks.leaseHeld = false;

    const result = await service.completeTurnWithReplies({
      conversationId: CONVERSATION,
      organizationId: ORG,
      clientTurnId: 'turn-1',
      userMessageId: USER_MESSAGE,
      processingToken: 'stale-token',
      replies: [{ agentId: AGENT_A, content: 'from A' }],
    });

    expect(result).toBeNull();
    expect(mocks.insertedRows).toHaveLength(0);
  });

  it('refuses an empty reply set instead of releasing the lease for nothing', async () => {
    const result = await service.completeTurnWithReplies({
      conversationId: CONVERSATION,
      organizationId: ORG,
      clientTurnId: 'turn-1',
      userMessageId: USER_MESSAGE,
      processingToken: 'token-1',
      replies: [],
    });

    // Releasing the lease with no reply would mark the turn completed and leave
    // the user with an answer that never arrives and cannot be retried.
    expect(result).toBeNull();
    expect(mocks.leaseReleases).toBe(0);
  });
});

describe('AgentChatPersistenceService.completeTurn', () => {
  beforeEach(() => {
    mocks.leaseReleases = 0;
    mocks.insertedRows = [];
    mocks.leaseHeld = true;
  });

  it('still writes a single attributed reply', async () => {
    const service = new AgentChatPersistenceService();

    const id = await service.completeTurn({
      conversationId: CONVERSATION,
      organizationId: ORG,
      clientTurnId: 'turn-1',
      userMessageId: USER_MESSAGE,
      processingToken: 'token-1',
      content: 'solo',
      agentId: AGENT_A,
    });

    expect(id).toBe('assistant-0');
    expect(mocks.insertedRows).toHaveLength(1);
    expect(mocks.insertedRows[0]?.agentId).toBe(AGENT_A);
  });
});
