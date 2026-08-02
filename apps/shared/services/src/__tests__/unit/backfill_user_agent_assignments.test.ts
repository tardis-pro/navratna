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

interface SelectCall {
  plane: 'control' | 'intelligence';
  table: unknown;
}

interface InsertCall {
  table: unknown;
  values: Record<string, unknown>[];
  conflictTarget: unknown;
}

const ADMIN_ORG = '00000000-0000-0000-0000-000000000001';

const rawQueries: QueryCall[] = [];
const selects: SelectCall[] = [];
const inserts: InsertCall[] = [];

let activeAgentRows: { id: string; organizationId: string | null }[] = [];
let userRows: { id: string; organizationId: string }[] = [];
let insertFailsForUser: string | null = null;
let ledgerRows: Record<string, unknown>[] = [];
let intelligenceThrows: Error | null = null;

const release = vi.fn();

const controlClientStub = {
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    rawQueries.push({ sql, params });
    return { rows: [] };
  }),
  release,
};

function thenable<T>(rows: () => T[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.where = () => chain;
  chain.limit = () => chain;
  chain.orderBy = () => chain;
  chain.then = (resolve: (value: T[]) => unknown, reject?: (e: unknown) => unknown) => {
    try {
      return Promise.resolve(resolve(rows()));
    } catch (error) {
      return reject ? Promise.resolve(reject(error)) : Promise.reject(error);
    }
  };
  return chain;
}

function makeDb(plane: 'control' | 'intelligence'): Record<string, unknown> {
  return {
    select: () => ({
      from: (table: unknown) => {
        selects.push({ plane, table });
        return thenable(() => {
          if (plane === 'intelligence') {
            if (intelligenceThrows) throw intelligenceThrows;
            return activeAgentRows;
          }
          if (table === schemas.dataMigrations) return ledgerRows;
          if (table === schemas.users) return userRows;
          return [];
        });
      },
    }),
    insert: (table: unknown) => {
      const call: InsertCall = { table, values: [], conflictTarget: undefined };
      const chain: Record<string, unknown> = {};
      chain.values = (values: Record<string, unknown> | Record<string, unknown>[]) => {
        call.values = Array.isArray(values) ? values : [values];
        return chain;
      };
      chain.onConflictDoNothing = (arg: { target?: unknown }) => {
        call.conflictTarget = arg?.target;
        inserts.push(call);
        return chain;
      };
      const settle = () => {
        if (insertFailsForUser !== null && call.values.some((v) => v.userId === insertFailsForUser)) {
          throw new Error('simulated insert failure');
        }
        return call.values.map((_, index) => ({ id: `row-${index}` }));
      };
      chain.returning = () => thenable(settle);
      chain.then = (resolve: (value: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        try {
          return Promise.resolve(resolve(settle()));
        } catch (error) {
          return reject ? Promise.resolve(reject(error)) : Promise.reject(error);
        }
      };
      return chain;
    },
  };
}

vi.mock('../../database/drizzle/clients/index', async () => {
  const actual = await vi.importActual<typeof import('../../database/drizzle/clients/index')>(
    '../../database/drizzle/clients/index'
  );
  return {
    ...actual,
    getControlDb: () => makeDb('control'),
    getIntelligenceDb: () => makeDb('intelligence'),
    getControlPool: () => ({ connect: async () => controlClientStub }),
  };
});

const schemas = await import('../../database/drizzle/schemas/control_schema');
const intelligenceSchemas = await import('../../database/drizzle/schemas/intelligence_schema');

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

const assignmentInserts = () => inserts.filter((c) => c.table === schemas.userAgentAssignments);
const ledgerWrites = () => inserts.filter((c) => c.table === schemas.dataMigrations);
const grantsFor = (userId: string) =>
  assignmentInserts()
    .filter((c) => c.values.some((v) => v.userId === userId))
    .flatMap((c) => c.values);

beforeEach(() => {
  vi.clearAllMocks();
  rawQueries.length = 0;
  selects.length = 0;
  inserts.length = 0;
  activeAgentRows = [
    { id: AGENT_A, organizationId: ADMIN_ORG },
    { id: AGENT_B, organizationId: ADMIN_ORG },
  ];
  userRows = [
    { id: USER_1, organizationId: ORG_1 },
    { id: USER_2, organizationId: ORG_2 },
  ];
  insertFailsForUser = null;
  ledgerRows = [];
  intelligenceThrows = null;
});

describe('BackfillUserAgentAssignments', () => {
  it('assigns every platform agent to every user', async () => {
    const result = await new BackfillUserAgentAssignments().run();

    expect(result.usersProcessed).toBe(2);
    expect(result.agentsFound).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.assignmentsCreated).toBe(4);

    expect(grantsFor(USER_1).map((v) => v.agentId)).toEqual([AGENT_A, AGENT_B]);
    expect(grantsFor(USER_2).map((v) => v.agentId)).toEqual([AGENT_A, AGENT_B]);
  });

  it('never grants one tenant an agent privately owned by another', async () => {
    activeAgentRows = [
      { id: AGENT_A, organizationId: ORG_1 },
      { id: AGENT_B, organizationId: ORG_2 },
    ];

    await new BackfillUserAgentAssignments().run();

    expect(grantsFor(USER_1).map((v) => v.agentId)).toEqual([AGENT_A]);
    expect(grantsFor(USER_2).map((v) => v.agentId)).toEqual([AGENT_B]);
  });

  it('skips a user entirely when no agent is offerable to their tenant', async () => {
    activeAgentRows = [{ id: AGENT_A, organizationId: ORG_1 }];

    await new BackfillUserAgentAssignments().run();

    expect(grantsFor(USER_2)).toHaveLength(0);
  });

  it('excludes the onboarding guide agent from the backfill', async () => {
    activeAgentRows = [
      { id: AGENT_A, organizationId: ADMIN_ORG },
      { id: ONBOARDING_GUIDE_AGENT_ID, organizationId: ADMIN_ORG },
    ];

    await new BackfillUserAgentAssignments().run();

    for (const insert of assignmentInserts()) {
      expect(insert.values.map((v) => v.agentId)).not.toContain(ONBOARDING_GUIDE_AGENT_ID);
      expect(insert.values.map((v) => v.agentId)).toContain(AGENT_A);
    }
  });

  it('never reads users and agents through the same plane', async () => {
    await new BackfillUserAgentAssignments().run();

    // A cross-plane join is unrepresentable here by construction: `agents` is
    // only ever reached through the intelligence db handle and `users` only
    // through the control one, so no single statement can name both.
    const agentSelects = selects.filter((s) => s.table === intelligenceSchemas.agents);
    const userSelects = selects.filter((s) => s.table === schemas.users);

    expect(agentSelects.length).toBeGreaterThan(0);
    expect(userSelects.length).toBeGreaterThan(0);
    expect(agentSelects.every((s) => s.plane === 'intelligence')).toBe(true);
    expect(userSelects.every((s) => s.plane === 'control')).toBe(true);
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
    expect(assignmentInserts()).toHaveLength(0);
    expect(selects.filter((s) => s.table === schemas.users)).toHaveLength(0);
  });

  it('is idempotent — conflicts on (user_id, agent_id) do nothing', async () => {
    await new BackfillUserAgentAssignments().run();

    const calls = assignmentInserts();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.conflictTarget).toEqual([
        schemas.userAgentAssignments.userId,
        schemas.userAgentAssignments.agentId,
      ]);
    }
  });

  it("uses each user's own organizationId, not the admin organization", async () => {
    await new BackfillUserAgentAssignments().run();

    expect(grantsFor(USER_1).every((v) => v.organizationId === ORG_1)).toBe(true);
    expect(grantsFor(USER_2).every((v) => v.organizationId === ORG_2)).toBe(true);
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
    expect(assignmentInserts()).toHaveLength(0);
  });

  it('never re-grants to a user created after the first backfill', async () => {
    await new BackfillUserAgentAssignments().run();
    expect(assignmentInserts().length).toBeGreaterThan(0);

    inserts.length = 0;
    selects.length = 0;
    ledgerRows = [{ name: BACKFILL_MIGRATION_NAME }];
    userRows = [
      { id: USER_1, organizationId: ORG_1 },
      { id: USER_2, organizationId: ORG_2 },
      { id: '33333333-3333-4333-8333-333333333333', organizationId: ORG_1 },
    ];

    const second = await new BackfillUserAgentAssignments().run();

    expect(second.assignmentsCreated).toBe(0);
    expect(assignmentInserts()).toHaveLength(0);
  });

  it('probes the ledger before reading agents, so a no-op never touches the other plane', async () => {
    ledgerRows = [{ name: BACKFILL_MIGRATION_NAME }];

    await new BackfillUserAgentAssignments().run();

    expect(selects.filter((s) => s.plane === 'intelligence')).toHaveLength(0);
    expect(selects[0]?.table).toBe(schemas.dataMigrations);
  });

  it('records completion in the ledger when every user succeeded', async () => {
    await new BackfillUserAgentAssignments().run();

    const writes = ledgerWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.values[0]?.name).toBe(BACKFILL_MIGRATION_NAME);
    expect(writes[0]?.conflictTarget).toBe(schemas.dataMigrations.name);
  });

  it('does NOT record completion when a user was skipped, so the next boot retries', async () => {
    insertFailsForUser = USER_1;

    const result = await new BackfillUserAgentAssignments().run();

    // Marking a partial run complete would strand the skipped user with an
    // empty roster permanently — the ledger must stay empty so it retries.
    expect(result.skipped).toBe(1);
    expect(ledgerWrites()).toHaveLength(0);
  });

  it('continues past a failing user and counts it as skipped', async () => {
    insertFailsForUser = USER_1;

    const result = await new BackfillUserAgentAssignments().run();

    expect(result.usersProcessed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(grantsFor(USER_2).length).toBeGreaterThan(0);
  });

  it('serializes concurrent boots behind an advisory lock and always releases it', async () => {
    await new BackfillUserAgentAssignments().run();

    const statements = rawQueries.map((call) => call.sql);
    expect(statements[0]).toContain('pg_advisory_lock');
    expect(statements[statements.length - 1]).toContain('pg_advisory_unlock');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the lock even when the run throws', async () => {
    intelligenceThrows = new Error('intelligence plane down');

    await expect(new BackfillUserAgentAssignments().run()).rejects.toThrow(
      /intelligence plane down/
    );

    expect(rawQueries.some((call) => call.sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
