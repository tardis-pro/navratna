import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  controlQuery: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../../database/drizzle/clients/index', () => ({
  initializePlanes: vi.fn(),
  getControlPool: () => ({
    connect: async () => ({ query: mocks.controlQuery, release: mocks.release }),
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
  EnsureOnboardingSchema,
  ONBOARDING_SCHEMA_STATEMENTS,
} from '../../database/migrations/ensure_onboarding_schema';

function executedSql(): string[] {
  return mocks.controlQuery.mock.calls.map((call) => String(call[0]));
}

describe('ONBOARDING_SCHEMA_STATEMENTS', () => {
  it('creates every table the onboarding feature reads and writes', () => {
    const joined = ONBOARDING_SCHEMA_STATEMENTS.join('\n');

    for (const table of [
      'user_agent_assignments',
      'onboarding_interviews',
      'onboarding_slot_values',
      'onboarding_slot_evidence',
      'onboarding_extraction_runs',
    ]) {
      expect(joined).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
  });

  it('is idempotent by construction: every statement guards against re-application', () => {
    for (const statement of ONBOARDING_SCHEMA_STATEMENTS) {
      const guarded =
        statement.includes('IF NOT EXISTS') || statement.includes('IF NOT EXISTS (SELECT 1');
      expect(guarded, `unguarded statement: ${statement.slice(0, 80)}`).toBe(true);
    }
  });

  it('creates the composite unique key before the FKs that reference it', () => {
    const joined = ONBOARDING_SCHEMA_STATEMENTS.join('\n');
    const uniqueAt = joined.indexOf('uq_onboarding_interviews_id_org');
    const firstFkAt = joined.indexOf('fk_onboarding_extraction_runs_interview');

    // Postgres accepts a unique constraint as an FK target but it must already
    // exist; drizzle-kit emits these in the wrong order (memory #3132).
    expect(uniqueAt).toBeGreaterThan(-1);
    expect(firstFkAt).toBeGreaterThan(uniqueAt);
  });

  it('truncates pg_constraint name comparisons to 63 characters', () => {
    for (const statement of ONBOARDING_SCHEMA_STATEMENTS) {
      if (!statement.includes('pg_constraint')) continue;
      expect(statement).toContain("left('");
      expect(statement).toContain(', 63)');
    }
  });

  it('never references an intelligence-plane table', () => {
    const joined = ONBOARDING_SCHEMA_STATEMENTS.join('\n');
    expect(joined).not.toMatch(/REFERENCES\s+"public"\."agents"/);
    expect(joined).not.toMatch(/REFERENCES\s+"public"\."personas"/);
  });
});

describe('EnsureOnboardingSchema.run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.controlQuery.mockResolvedValue({ rowCount: 0, rows: [] });
  });

  it('executes every statement against the control pool', async () => {
    await new EnsureOnboardingSchema().run();

    const ddl = executedSql().filter(
      (sql) => !/pg_advisory|^BEGIN$|^COMMIT$|^ROLLBACK$/.test(sql)
    );
    expect(ddl).toHaveLength(ONBOARDING_SCHEMA_STATEMENTS.length);
  });

  it('applies the tables before the constraints that depend on them', async () => {
    await new EnsureOnboardingSchema().run();

    const sql = executedSql();
    const tableAt = sql.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS "onboarding_interviews"'));
    const fkAt = sql.findIndex((s) => s.includes('fk_onboarding_slot_values_interview'));

    expect(tableAt).toBeGreaterThan(-1);
    expect(fkAt).toBeGreaterThan(tableAt);
  });

  it('serializes concurrent boots behind an advisory lock and releases it', async () => {
    await new EnsureOnboardingSchema().run();

    const sql = executedSql();
    const lockAt = sql.findIndex((s) => s.includes('pg_advisory_lock'));
    const firstDdlAt = sql.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS'));
    const unlockAt = sql.findIndex((s) => s.includes('pg_advisory_unlock'));

    // IF NOT EXISTS / pg_constraint probes are check-then-act: two Fly machines
    // can both pass the check and both run the ALTER without this lock.
    expect(lockAt).toBeGreaterThan(-1);
    expect(firstDdlAt).toBeGreaterThan(lockAt);
    expect(unlockAt).toBeGreaterThan(firstDdlAt);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('applies the whole schema in one transaction', async () => {
    await new EnsureOnboardingSchema().run();

    const sql = executedSql();
    expect(sql.filter((s) => s === 'BEGIN')).toHaveLength(1);
    expect(sql.filter((s) => s === 'COMMIT')).toHaveLength(1);
  });

  it('rolls back and releases the lock when a statement fails', async () => {
    mocks.controlQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('onboarding_slot_evidence')) {
        throw new Error('permission denied for schema public');
      }
      return { rowCount: 0, rows: [] };
    });

    await expect(new EnsureOnboardingSchema().run()).rejects.toThrow(/permission denied/);

    const sql = executedSql();
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('COMMIT');
    expect(sql.some((s) => s.includes('pg_advisory_unlock'))).toBe(true);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failure rather than reporting a schema that was never applied', async () => {
    mocks.controlQuery.mockRejectedValueOnce(new Error('permission denied for schema public'));

    await expect(new EnsureOnboardingSchema().run()).rejects.toThrow(/permission denied/);
  });
});
