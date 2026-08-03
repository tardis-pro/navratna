import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  intelligenceQuery: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../../database/drizzle/clients/index', () => ({
  initializePlanes: vi.fn(),
  getIntelligencePool: () => ({
    connect: async () => ({ query: mocks.intelligenceQuery, release: mocks.release }),
  }),
}));

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  };
});

import {
  EnsureAgentChatThreads,
  AGENT_CHAT_THREAD_STATEMENTS,
} from '../../database/migrations/ensure_agent_chat_threads';

function executedSql(): string[] {
  return mocks.intelligenceQuery.mock.calls.map((call) => String(call[0]));
}

function indexOfStatement(fragment: string): number {
  return AGENT_CHAT_THREAD_STATEMENTS.findIndex((s) => s.includes(fragment));
}

describe('AGENT_CHAT_THREAD_STATEMENTS', () => {
  it('constrains the user turn WITHOUT agent_id, so a NULL agent cannot duplicate it', () => {
    const userTurn = AGENT_CHAT_THREAD_STATEMENTS.find((s) =>
      s.includes('uq_agent_chat_user_turn')
    );

    expect(userTurn).toBeDefined();
    expect(userTurn).toContain(`WHERE role = 'user'`);
    // The whole point: a composite index including agent_id would NOT constrain
    // user rows, because their agent_id is NULL and Postgres treats NULLs as
    // distinct — duplicate user turns would slip through on retry.
    expect(userTurn).not.toContain('agent_id');
  });

  it('scopes the assistant turn BY agent so several agents can answer one turn', () => {
    const assistantTurn = AGENT_CHAT_THREAD_STATEMENTS.find((s) =>
      s.includes('uq_agent_chat_assistant_turn')
    );

    expect(assistantTurn).toBeDefined();
    expect(assistantTurn).toContain('"conversation_id","client_turn_id","agent_id"');
    expect(assistantTurn).toContain(`WHERE role = 'assistant'`);
  });

  it('widens the per-message reply index by agent so a thread can fan out', () => {
    const created = indexOfStatement('uq_agent_chat_assistant_reply_agent');
    const dropped = indexOfStatement('DROP INDEX IF EXISTS "uq_agent_chat_assistant_reply"');

    expect(created).toBeGreaterThanOrEqual(0);
    expect(dropped).toBeGreaterThan(created);

    // The original index was UNIQUE on reply_to_message_id alone, which allows
    // exactly ONE assistant reply per user message — correct for 1:1, fatal for a
    // thread where several agents each answer the same turn.
    const statement = AGENT_CHAT_THREAD_STATEMENTS[created];
    expect(statement).toContain('"reply_to_message_id","agent_id"');
    expect(statement).toContain(`WHERE role = 'assistant'`);
  });

  it('adds thread_key nullable, backfills it, and only then demands NOT NULL', () => {
    const added = indexOfStatement('ADD COLUMN IF NOT EXISTS "thread_key"');
    const backfilled = indexOfStatement('SET "thread_key" = "agent_id"');
    const tightened = indexOfStatement('ALTER COLUMN "thread_key" SET NOT NULL');

    expect(added).toBeGreaterThanOrEqual(0);
    // A NOT NULL column cannot be added to a table that already has rows, so the
    // order here is load-bearing rather than stylistic.
    expect(backfilled).toBeGreaterThan(added);
    expect(tightened).toBeGreaterThan(backfilled);
  });

  it('creates the replacement unique index before dropping the old one', () => {
    const created = indexOfStatement('CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_chat_thread"');
    const dropped = indexOfStatement('DROP INDEX IF EXISTS "uq_agent_chat_conversation"');

    expect(created).toBeGreaterThanOrEqual(0);
    // Otherwise the table is briefly unconstrained and a concurrent writer can
    // insert a duplicate that the new index then refuses to build over.
    expect(dropped).toBeGreaterThan(created);
  });

  it('backfills message agent_id before building the index that depends on it', () => {
    const backfilled = indexOfStatement(`SET "agent_id" = c."agent_id"`);
    const indexed = indexOfStatement('uq_agent_chat_assistant_turn');

    expect(backfilled).toBeGreaterThanOrEqual(0);
    expect(indexed).toBeGreaterThan(backfilled);
  });

  it('backfills one participant per existing conversation, tolerating re-application', () => {
    const insert = AGENT_CHAT_THREAD_STATEMENTS.find((s) =>
      s.includes('INSERT INTO "agent_chat_participants"')
    );

    expect(insert).toBeDefined();
    expect(insert).toContain('ON CONFLICT ("conversation_id","agent_id") DO NOTHING');
    expect(insert).toContain(`WHERE c."agent_id" IS NOT NULL`);
  });

  it('is idempotent by construction: every statement is safe to re-run', () => {
    for (const statement of AGENT_CHAT_THREAD_STATEMENTS) {
      const guarded =
        statement.includes('IF NOT EXISTS') ||
        statement.includes('IF EXISTS') ||
        statement.startsWith('UPDATE ') ||
        statement.includes('ON CONFLICT') ||
        statement.includes('DROP NOT NULL') ||
        statement.includes('SET NOT NULL');

      expect(guarded, `unguarded statement: ${statement.slice(0, 80)}`).toBe(true);
    }
  });
});

describe('EnsureAgentChatThreads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.intelligenceQuery.mockResolvedValue({ rows: [] });
  });

  it('serialises booting machines with an advisory lock and commits atomically', async () => {
    await new EnsureAgentChatThreads().run();

    const sql = executedSql();
    expect(sql[0]).toContain('pg_advisory_lock');
    expect(sql[1]).toBe('BEGIN');
    expect(sql).toContain('COMMIT');
    expect(sql[sql.length - 1]).toContain('pg_advisory_unlock');
  });

  it('rolls back and releases the lock when a statement fails', async () => {
    mocks.intelligenceQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('agent_chat_participants') && sql.includes('CREATE TABLE')) {
        throw new Error('boom');
      }
      return { rows: [] };
    });

    await expect(new EnsureAgentChatThreads().run()).rejects.toThrow('boom');

    const sql = executedSql();
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('COMMIT');
    // A leaked advisory lock would wedge every future boot of every machine.
    expect(sql[sql.length - 1]).toContain('pg_advisory_unlock');
    expect(mocks.release).toHaveBeenCalled();
  });
});
