import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertedValues: [] as Array<{ table: string; values: Record<string, unknown> }>,
  conflictTargets: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../database/drizzle/clients/index.js', () => {
  function tableNameOf(table: unknown): string {
    const name = (table as Record<symbol, unknown>)[Symbol.for('drizzle:Name')];
    return typeof name === 'string' ? name : 'unknown';
  }

  function insertBuilder(table: unknown) {
    const name = tableNameOf(table);
    const chain = {
      values(values: Record<string, unknown>) {
        mocks.insertedValues.push({ table: name, values });
        return chain;
      },
      onConflictDoUpdate(config: Record<string, unknown>) {
        mocks.conflictTargets.push({ table: name, ...config });
        return chain;
      },
      onConflictDoNothing(config: Record<string, unknown>) {
        mocks.conflictTargets.push({ table: name, ...config });
        return chain;
      },
      returning() {
        return Promise.resolve([{ id: 'conversation-1' }]);
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve([{ id: 'conversation-1' }]).then(resolve);
      },
    };
    return chain;
  }

  return {
    getIntelligenceDb: () => ({ insert: insertBuilder }),
  };
});

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});

import { AgentChatPersistenceService } from '../../agent_chat_persistence_service';

const ORG = '00000000-0000-0000-0000-000000000001';
const USER = '11111111-1111-1111-1111-111111111111';
const AGENT = '22222222-2222-2222-2222-222222222222';

describe('AgentChatPersistenceService.resolveConversation', () => {
  beforeEach(() => {
    mocks.insertedValues.length = 0;
    mocks.conflictTargets.length = 0;
  });

  it('defaults threadKey to the agent id so existing clients keep their thread', async () => {
    await new AgentChatPersistenceService().resolveConversation({
      organizationId: ORG,
      userId: USER,
      agentId: AGENT,
    });

    const conversation = mocks.insertedValues.find((i) =>
      i.table.includes('agent_chat_conversations')
    );

    expect(conversation).toBeDefined();
    // A client that predates threads sends no threadKey; if this did not fall back
    // to the agent id it would silently create a NEW empty thread and the user's
    // history would appear to vanish.
    expect(conversation?.values.threadKey).toBe(AGENT);
  });

  it('honours an explicit threadKey, which is what makes a second thread possible', async () => {
    const threadKey = '33333333-3333-3333-3333-333333333333';

    await new AgentChatPersistenceService().resolveConversation({
      organizationId: ORG,
      userId: USER,
      agentId: AGENT,
      threadKey,
    });

    const conversation = mocks.insertedValues.find((i) =>
      i.table.includes('agent_chat_conversations')
    );

    expect(conversation?.values.threadKey).toBe(threadKey);
    expect(conversation?.values.agentId).toBe(AGENT);
  });

  it('registers the agent as a participant so it is addressable in the thread', async () => {
    await new AgentChatPersistenceService().resolveConversation({
      organizationId: ORG,
      userId: USER,
      agentId: AGENT,
    });

    const participant = mocks.insertedValues.find((i) =>
      i.table.includes('agent_chat_participants')
    );

    expect(participant).toBeDefined();
    expect(participant?.values.agentId).toBe(AGENT);
    expect(participant?.values.conversationId).toBe('conversation-1');
  });
});
