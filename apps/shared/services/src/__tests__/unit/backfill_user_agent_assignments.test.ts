import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Migration safety net for the agent-visibility flip: once GET /api/v1/agents
 * returns only assigned agents, every pre-existing user needs a
 * user_agent_assignments row per active agent or they see zero agents.
 *
 * `users`/`user_agent_assignments` are CONTROL plane and `agents` is
 * INTELLIGENCE plane — physically separable hosts — so no single SQL
 * statement may reference both tables. These tests pin that constraint, the
 * onboarding-guide exclusion, per-tenant grant filtering, ledgered
 * completion, advisory-lock serialization, and per-user failure isolation.
 */

interface QueryCall {
  sql: string;
  params: unknown[] | undefined;
}

interface PoolQueryResult {
  rows: Record<string, unknown>[];
}

const ADMIN_ORG = '00000000-0000-0000-0000-000000000001';

const intelligenceQueries: QueryCall[] = [];
const controlQueries: QueryCall[] = [];

let activeAgentRows: { id: string; organization_id: string | null }[] = [];
let userRows: { id: string; organization_id: string }[] = [];
let controlInsertFailsForParamContaining: string | null = null;
let ledgerRows: Record<string, unknown>[] = [];

const release = vi.fn();

const intelligencePoolStub = {
  query: vi.fn(async (sql: string, params?: unknown[]): Promise<PoolQueryResult> => {
    intelligenceQueries.push({ sql, params });
    return { rows: activeAgentRows };
  }),
};

const controlClientStub = {
  query: vi.fn(async (sql: string, params?: unknown[]): Promise<PoolQueryResult> => {
    controlQueries.push({ sql, params });
    if (/FROM data_migrations/i.test(sql)) {
      return { rows: ledgerRows };
    }
    if (/SELECT/i.test(sql) && /FROM users/i.test(sql)) {
      return { rows: userRows };
    }
    if (
      controlInsertFailsForParamContaining !== null &&
      (params ?? []).includes(controlInsertFailsForParamContaining)
    ) {
      throw new Error('simulated insert failure');
    }
    return { rows: [] };
  }),
  release,
};

vi.mock('../../database/drizzle/clients/index', async () => {
  const actual = await vi.importActual<typeof import('../../database/drizzle/clients/index')>(
    '../../database/drizzle/clients/index'
  );
  return {
    ...actual,
    getIntelligencePool: () => intelligencePoolStub,
    getControlPool: () => ({ connect: async () => controlClientStub }),
  };
});

const { BackfillUserAgentAssignments, BACKFILL_MIGRATION_NAME } = await import(
  '../../database/migrations/backfill_user_agent_assignments'
);
const { ONBOARDING_GUIDE_AGENT_ID } = await import('../../agent_access_service');

const AGENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AGENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_1 = '11111111-1111-4111-8111-111111111111';
const USER_2 = '22222222-2222-4222-8222-222222222222';
const ORG_1 = '0000f1f1-0000-4000-8000-000000000001';
const ORG_2 = '0000f2f2-0000-4000-8000-000000000002';

const insertCalls = () =>
  controlQueries.filter((call) => /INSERT INTO user_agent_assignments/i.test(call.sql));

const ledgerWrites = () =>
  controlQueries.filter((call) => /INSERT INTO data_migrations/i.test(call.sql));

beforeEach(() => {
  vi.clearAllMocks();
  intelligenceQueries.length = 0;
  controlQueries.length = 0;
  activeAgentRows = [
    { id: AGENT_A, organization_id: ADMIN_ORG },
    { id: AGENT_B, organization_id: ADMIN_ORG },
  ];
  userRows = [
    { id: USER_1, organization_id: ORG_1 },
    { id: USER_2, organization_id: ORG_2 },
  ];
  controlInsertFailsForParamContaining = null;
  ledgerRows = [];
});

describe('BackfillUserAgentAssignments', () => {
  it('assigns every platform agent to every user', async () => {
    const result = await new BackfillUserAgentAssignments().run();

    expect(result.usersProcessed).toBe(2);
    expect(result.agentsFound).toBe(2);
    expect(result.skipped).toBe(0);

    const inserts = insertCalls();
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert.params).toEqual(expect.arrayContaining([AGENT_A, AGENT_B]));
    }
    expect(inserts[0]?.params).toContain(USER_1);
    expect(inserts[1]?.params).toContain(USER_2);
  });

  it('never grants one tenant an agent privately owned by another', async () => {
    activeAgentRows = [
      { id: AGENT_A, organization_id: ORG_1 },
      { id: AGENT_B, organization_id: ORG_2 },
    ];

    await new BackfillUserAgentAssignments().run();

    const user1Insert = insertCalls().find((call) => call.params?.includes(USER_1));
    const user2Insert = insertCalls().find((call) => call.params?.includes(USER_2));

    expect(user1Insert?.params).toContain(AGENT_A);
    expect(user1Insert?.params).not.toContain(AGENT_B);
    expect(user2Insert?.params).toContain(AGENT_B);
    expect(user2Insert?.params).not.toContain(AGENT_A);
  });

  it('skips a user entirely when no agent is offerable to their tenant', async () => {
    activeAgentRows = [{ id: AGENT_A, organization_id: ORG_1 }];

    await new BackfillUserAgentAssignments().run();

    expect(insertCalls().find((call) => call.params?.includes(USER_2))).toBeUndefined();
  });

  it('excludes the onboarding guide agent from the backfill', async () => {
    activeAgentRows = [
      { id: AGENT_A, organization_id: ADMIN_ORG },
      { id: ONBOARDING_GUIDE_AGENT_ID, organization_id: ADMIN_ORG },
    ];

    await new BackfillUserAgentAssignments().run();

    for (const insert of insertCalls()) {
      expect(insert.params).not.toContain(ONBOARDING_GUIDE_AGENT_ID);
      expect(insert.params).toContain(AGENT_A);
    }
  });

  it('never issues a SQL statement referencing both users and agents', async () => {
    await new BackfillUserAgentAssignments().run();

    const allQueries = [...intelligenceQueries, ...controlQueries];
    expect(allQueries.length).toBeGreaterThan(0);
    for (const call of allQueries) {
      const touchesUsers = /\busers\b/i.test(call.sql);
      const touchesAgents = /\bagents\b/i.test(call.sql);
      expect(
        touchesUsers && touchesAgents,
        `cross-plane statement detected: ${call.sql}`
      ).toBe(false);
    }
  });

  it('returns early without reading users or inserting when no active agents exist', async () => {
    activeAgentRows = [];

    const result = await new BackfillUserAgentAssignments().run();

    expect(result).toEqual({
      usersProcessed: 0,
      assignmentsCreated: 0,
      agentsFound: 0,
      skipped: 0,
      alreadyApplied: false,
    });
    expect(insertCalls()).toHaveLength(0);
    expect(controlQueries.filter((call) => /FROM users/i.test(call.sql))).toHaveLength(0);
  });

  it('is idempotent — uses ON CONFLICT DO NOTHING', async () => {
    await new BackfillUserAgentAssignments().run();

    const inserts = insertCalls();
    expect(inserts.length).toBeGreaterThan(0);
    for (const insert of inserts) {
      expect(insert.sql).toMatch(/ON CONFLICT\s*\(\s*user_id\s*,\s*agent_id\s*\)\s*DO NOTHING/i);
    }
  });

  it("uses each user's own organization_id, not the admin organization", async () => {
    await new BackfillUserAgentAssignments().run();

    const inserts = insertCalls();
    const user1Insert = inserts.find((call) => call.params?.includes(USER_1));
    const user2Insert = inserts.find((call) => call.params?.includes(USER_2));

    expect(user1Insert?.params).toContain(ORG_1);
    expect(user1Insert?.params).not.toContain(ORG_2);
    expect(user2Insert?.params).toContain(ORG_2);
    expect(user2Insert?.params).not.toContain(ORG_1);
  });

  it('does nothing at all once the ledger records the migration', async () => {
    ledgerRows = [{ name: BACKFILL_MIGRATION_NAME }];

    const result = await new BackfillUserAgentAssignments().run();

    expect(result).toEqual({
      usersProcessed: 0,
      assignmentsCreated: 0,
      agentsFound: 0,
      skipped: 0,
      alreadyApplied: true,
    });
    expect(insertCalls()).toHaveLength(0);
  });

  it('never re-grants to a user created after the first backfill', async () => {
    await new BackfillUserAgentAssignments().run();
    expect(insertCalls().length).toBeGreaterThan(0);

    controlQueries.length = 0;
    intelligenceQueries.length = 0;
    ledgerRows = [{ name: BACKFILL_MIGRATION_NAME }];
    userRows = [
      { id: USER_1, organization_id: ORG_1 },
      { id: USER_2, organization_id: ORG_2 },
      { id: '33333333-3333-4333-8333-333333333333', organization_id: ORG_1 },
    ];

    const second = await new BackfillUserAgentAssignments().run();

    expect(second.assignmentsCreated).toBe(0);
    expect(insertCalls()).toHaveLength(0);
  });

  it('probes the ledger before reading agents, so a no-op never touches the other plane', async () => {
    ledgerRows = [{ name: BACKFILL_MIGRATION_NAME }];

    await new BackfillUserAgentAssignments().run();

    expect(intelligenceQueries).toHaveLength(0);
    const ledgerProbe = controlQueries.find((call) => /FROM data_migrations/i.test(call.sql));
    expect(ledgerProbe?.params).toEqual([BACKFILL_MIGRATION_NAME]);
  });

  it('records completion in the ledger when every user succeeded', async () => {
    await new BackfillUserAgentAssignments().run();

    const writes = ledgerWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.params?.[0]).toBe(BACKFILL_MIGRATION_NAME);
    expect(writes[0]?.sql).toMatch(/ON CONFLICT\s*\(\s*name\s*\)\s*DO NOTHING/i);
  });

  it('does NOT record completion when a user was skipped, so the next boot retries', async () => {
    controlInsertFailsForParamContaining = USER_1;

    const result = await new BackfillUserAgentAssignments().run();

    // Marking a partial run complete would strand the skipped user with an
    // empty roster permanently — the ledger must stay empty so it retries.
    expect(result.skipped).toBe(1);
    expect(ledgerWrites()).toHaveLength(0);
  });

  it('continues past a failing user and counts it as skipped', async () => {
    controlInsertFailsForParamContaining = USER_1;

    const result = await new BackfillUserAgentAssignments().run();

    expect(result.usersProcessed).toBe(2);
    expect(result.skipped).toBe(1);
    const user2Insert = insertCalls().find((call) => call.params?.includes(USER_2));
    expect(user2Insert).toBeDefined();
  });

  it('serializes concurrent boots behind an advisory lock and always releases it', async () => {
    await new BackfillUserAgentAssignments().run();

    const sql = controlQueries.map((call) => call.sql);
    const lockAt = sql.findIndex((s) => s.includes('pg_advisory_lock'));
    const probeAt = sql.findIndex((s) => /FROM data_migrations/i.test(s));
    const unlockAt = sql.findIndex((s) => s.includes('pg_advisory_unlock'));

    expect(lockAt).toBe(0);
    expect(probeAt).toBeGreaterThan(lockAt);
    expect(unlockAt).toBeGreaterThan(probeAt);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the lock even when the run throws', async () => {
    intelligencePoolStub.query.mockRejectedValueOnce(new Error('intelligence plane down'));

    await expect(new BackfillUserAgentAssignments().run()).rejects.toThrow(
      /intelligence plane down/
    );

    expect(controlQueries.some((call) => call.sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
