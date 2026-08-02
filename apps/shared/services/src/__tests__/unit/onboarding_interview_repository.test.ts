import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({
  db: {} as Record<string, unknown>,
  getControlDb: vi.fn(),
}));

vi.mock('../../database/drizzle/clients/index', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getControlDb: mocks.getControlDb };
});

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

import {
  OnboardingInterviewRepository,
  InterviewNotFoundError,
  type ExtractionRunRecord,
} from '../../database/repositories/onboarding_interview_repository';
import {
  onboardingInterviews,
  onboardingSlotValues,
  onboardingSlotEvidence,
  onboardingExtractionRuns,
} from '../../database/drizzle/schemas/control_schema';
import { ONBOARDING_SLOTS } from '../../onboarding/types';
import type { SlotUpdate } from '../../onboarding/schemas';

interface ExecuteCall {
  sql: SQL;
  text: string;
}

interface InsertCall {
  table: unknown;
  values: unknown;
  onConflictDoUpdate?: unknown;
  onConflictDoNothing?: unknown;
}

interface UpdateCall {
  table: unknown;
  set: unknown;
}

interface Recorder {
  executes: ExecuteCall[];
  inserts: InsertCall[];
  updates: UpdateCall[];
  executeQueue: { rows: Record<string, unknown>[] }[];
  insertReturnQueue: Record<string, unknown>[][];
  selectQueue: Record<string, unknown>[][];
  updateReturnQueue: Record<string, unknown>[][];
}

const dialect = new PgDialect();

function sqlText(statement: SQL): string {
  return dialect.sqlToQuery(statement).sql;
}

function createRecorder(): Recorder {
  return {
    executes: [],
    inserts: [],
    updates: [],
    executeQueue: [],
    insertReturnQueue: [],
    selectQueue: [],
    updateReturnQueue: [],
  };
}

function buildDb(rec: Recorder): Record<string, unknown> {
  const nextSelect = () => rec.selectQueue.shift() ?? [];

  const selectChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const key of ['from', 'where', 'orderBy', 'limit', 'innerJoin']) {
      chain[key] = () => chain;
    }
    chain.then = (resolve: (rows: Record<string, unknown>[]) => unknown) => resolve(nextSelect());
    return chain;
  };

  const insertChain = (table: unknown): Record<string, unknown> => {
    const call: InsertCall = { table, values: undefined };
    const chain: Record<string, unknown> = {};
    chain.values = (values: unknown) => {
      call.values = values;
      rec.inserts.push(call);
      return chain;
    };
    chain.onConflictDoUpdate = (arg: unknown) => {
      call.onConflictDoUpdate = arg;
      return chain;
    };
    chain.onConflictDoNothing = (arg: unknown) => {
      call.onConflictDoNothing = arg ?? true;
      return chain;
    };
    chain.returning = () => ({
      then: (resolve: (rows: Record<string, unknown>[]) => unknown) =>
        resolve(rec.insertReturnQueue.shift() ?? []),
    });
    chain.then = (resolve: (rows: Record<string, unknown>[]) => unknown) => resolve([]);
    return chain;
  };

  const updateChain = (table: unknown): Record<string, unknown> => {
    const call: UpdateCall = { table, set: undefined };
    const chain: Record<string, unknown> = {};
    chain.set = (values: unknown) => {
      call.set = values;
      rec.updates.push(call);
      return chain;
    };
    chain.where = () => chain;
    chain.returning = () => ({
      then: (resolve: (rows: Record<string, unknown>[]) => unknown) =>
        resolve(rec.updateReturnQueue.shift() ?? []),
    });
    return chain;
  };

  const tx: Record<string, unknown> = {
    execute: (statement: SQL) => {
      rec.executes.push({ sql: statement, text: sqlText(statement) });
      return Promise.resolve(rec.executeQueue.shift() ?? { rows: [] });
    },
    insert: (table: unknown) => insertChain(table),
    select: () => selectChain(),
    update: (table: unknown) => updateChain(table),
  };

  return {
    transaction: (cb: (t: unknown) => unknown) => Promise.resolve(cb(tx)),
    execute: tx.execute,
    insert: tx.insert,
    select: tx.select,
    update: tx.update,
  };
}

function answeredUpdate(overrides: Partial<SlotUpdate> = {}): SlotUpdate {
  return {
    slot: 'identity',
    status: 'answered',
    value: 'Pronit, platform engineer',
    evidence: "I'm Pronit, a platform engineer",
    sourceMessageId: 'msg-1',
    ...overrides,
  } as SlotUpdate;
}

function runRecord(overrides: Partial<ExtractionRunRecord> = {}): ExtractionRunRecord {
  return {
    outcome: 'accepted',
    model: 'gpt-4o-mini',
    provider: 'openai',
    promptVersion: 'v1',
    rawResponse: '{"updates":[]}',
    acceptedUpdates: [],
    rejectedUpdates: [],
    validationErrors: [],
    latencyMs: 120,
    tokensUsed: 300,
    sourceMessageIds: ['msg-1'],
    ...overrides,
  };
}

describe('OnboardingInterviewRepository', () => {
  let rec: Recorder;
  let repo: OnboardingInterviewRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    rec = createRecorder();
    mocks.getControlDb.mockImplementation(() => buildDb(rec));
    repo = new OnboardingInterviewRepository();
  });

  describe('createInterview', () => {
    it('prepopulates all ten slots as unanswered', async () => {
      rec.insertReturnQueue.push([
        {
          id: 'iv-1',
          userId: 'u-1',
          organizationId: 'org-1',
          guideAgentId: 'guide-1',
          status: 'active',
          currentObjective: 'identity',
          turnCount: 0,
          stateVersion: 0,
        },
      ]);

      const snapshot = await repo.createInterview({
        userId: 'u-1',
        organizationId: 'org-1',
        guideAgentId: 'guide-1',
      });

      const slotInsert = rec.inserts.find((c) => c.table === onboardingSlotValues);
      expect(slotInsert).toBeDefined();
      const rows = slotInsert?.values as Record<string, unknown>[];
      expect(rows).toHaveLength(ONBOARDING_SLOTS.length);
      expect(rows.map((r) => r.slotKey)).toEqual([...ONBOARDING_SLOTS]);
      expect(rows.every((r) => r.status === 'unanswered' && r.value === null)).toBe(true);
      expect(rows.every((r) => r.revision === 0 && r.attempts === 0)).toBe(true);
      expect(Object.keys(snapshot.slots)).toHaveLength(ONBOARDING_SLOTS.length);
    });

    it('reads back the existing row when a concurrent create wins', async () => {
      rec.insertReturnQueue.push([]);
      rec.selectQueue.push([
        {
          id: 'iv-existing',
          userId: 'u-1',
          organizationId: 'org-1',
          guideAgentId: 'guide-1',
          status: 'active',
          currentObjective: 'scope_of_work',
          turnCount: 3,
          stateVersion: 3,
        },
      ]);
      rec.selectQueue.push([]);
      rec.selectQueue.push([]);

      const snapshot = await repo.createInterview({
        userId: 'u-1',
        organizationId: 'org-1',
        guideAgentId: 'guide-1',
      });

      expect(snapshot.id).toBe('iv-existing');
      expect(snapshot.stateVersion).toBe(3);
      expect(rec.inserts.some((c) => c.table === onboardingSlotValues)).toBe(false);
    });

    it('throws InterviewNotFoundError when neither insert nor read-back yields a row', async () => {
      rec.insertReturnQueue.push([]);
      rec.selectQueue.push([]);

      await expect(
        repo.createInterview({ userId: 'u-1', organizationId: 'org-1', guideAgentId: 'guide-1' })
      ).rejects.toBeInstanceOf(InterviewNotFoundError);
    });
  });

  describe('findActiveInterview', () => {
    it('returns every slot key even when a slot row is missing', async () => {
      rec.selectQueue.push([
        {
          id: 'iv-1',
          userId: 'u-1',
          organizationId: 'org-1',
          guideAgentId: 'guide-1',
          status: 'active',
          currentObjective: 'identity',
          turnCount: 1,
          stateVersion: 1,
        },
      ]);
      rec.selectQueue.push([
        {
          slotKey: 'identity',
          status: 'answered',
          value: 'Pronit',
          confidence: '0.90000',
          attempts: 1,
          revision: 2,
        },
      ]);
      rec.selectQueue.push([]);

      const snapshot = await repo.findActiveInterview('u-1', 'org-1');

      expect(snapshot).not.toBeNull();
      expect(Object.keys(snapshot?.slots ?? {}).sort()).toEqual([...ONBOARDING_SLOTS].sort());
      expect(snapshot?.slots.identity.status).toBe('answered');
      expect(snapshot?.slots.identity.confidence).toBe(0.9);
      expect(snapshot?.slots.vision.status).toBe('unanswered');
      expect(snapshot?.slots.vision.value).toBeNull();
    });

    it('attaches evidence only from the current slot revision', async () => {
      rec.selectQueue.push([
        {
          id: 'iv-1',
          userId: 'u-1',
          organizationId: 'org-1',
          guideAgentId: 'guide-1',
          status: 'active',
          currentObjective: 'identity',
          turnCount: 1,
          stateVersion: 1,
        },
      ]);
      rec.selectQueue.push([
        { slotKey: 'identity', status: 'answered', value: 'Pronit', confidence: null, attempts: 2, revision: 2 },
      ]);
      rec.selectQueue.push([
        { slotKey: 'identity', slotRevision: 1, sourceMessageId: 'msg-old' },
        { slotKey: 'identity', slotRevision: 2, sourceMessageId: 'msg-new' },
      ]);

      const snapshot = await repo.findActiveInterview('u-1', 'org-1');

      expect(snapshot?.slots.identity.evidenceMessageIds).toEqual(['msg-new']);
    });

    it('returns null when no in-flight interview exists', async () => {
      rec.selectQueue.push([]);
      expect(await repo.findActiveInterview('u-1', 'org-1')).toBeNull();
    });
  });

  describe('commitTurn', () => {
    const baseParams = {
      interviewId: 'iv-1',
      organizationId: 'org-1',
      userId: 'u-1',
      expectedStateVersion: 4,
      nextObjective: 'communication' as const,
      nextStatus: 'active' as const,
      triggerMessageId: 'msg-1',
      clientTurnId: 'turn-1',
    };

    it('returns replayed without re-applying when an accepted run exists for the trigger message', async () => {
      rec.executeQueue.push({
        rows: [
          { resulting_state_version: 5, resulting_status: 'active', next_objective: 'communication' },
        ],
      });

      const result = await repo.commitTurn({
        ...baseParams,
        updates: [answeredUpdate()],
        extractionRun: runRecord(),
      });

      expect(result).toEqual({
        committed: false,
        reason: 'replayed',
        stateVersion: 5,
        status: 'active',
        currentObjective: 'communication',
      });
      expect(rec.executes).toHaveLength(1);
      expect(rec.inserts).toHaveLength(0);
    });

    it('returns state_conflict when the CAS matches no row', async () => {
      rec.executeQueue.push({ rows: [] });
      rec.executeQueue.push({ rows: [] });

      const result = await repo.commitTurn({
        ...baseParams,
        updates: [answeredUpdate()],
        extractionRun: runRecord(),
      });

      expect(result).toEqual({ committed: false, reason: 'state_conflict' });
      expect(rec.inserts).toHaveLength(0);
    });

    it('guards the CAS on state_version and an active status in its predicate', async () => {
      rec.executeQueue.push({ rows: [] });
      rec.executeQueue.push({ rows: [] });

      await repo.commitTurn({ ...baseParams, updates: [], extractionRun: runRecord() });

      const cas = rec.executes[1];
      const whereIndex = cas.text.search(/\bwhere\b/i);
      expect(whereIndex).toBeGreaterThan(-1);
      const predicate = cas.text.slice(whereIndex);
      expect(predicate).toMatch(/state_version/i);
      expect(predicate).toMatch(/status/i);
      expect(predicate).toMatch(/organization_id/i);
      expect(predicate).toMatch(/user_id/i);
    });

    it('increments slot revision and writes evidence at that revision', async () => {
      rec.executeQueue.push({ rows: [] });
      rec.executeQueue.push({ rows: [{ state_version: 5 }] });
      rec.insertReturnQueue.push([{ revision: 3 }]);

      const result = await repo.commitTurn({
        ...baseParams,
        updates: [answeredUpdate()],
        extractionRun: runRecord(),
      });

      expect(result).toEqual({
        committed: true,
        stateVersion: 5,
        status: 'active',
        currentObjective: 'communication',
      });

      const slotInsert = rec.inserts.find((c) => c.table === onboardingSlotValues);
      expect(slotInsert?.onConflictDoUpdate).toBeDefined();

      const evidenceInsert = rec.inserts.find((c) => c.table === onboardingSlotEvidence);
      const evidence = evidenceInsert?.values as Record<string, unknown>;
      expect(evidence.slotRevision).toBe(3);
      expect(evidence.sourceKind).toBe('chat_message');
      expect(evidence.sourceMessageId).toBe('msg-1');
      expect(evidenceInsert?.onConflictDoNothing).toBeDefined();
    });

    it('writes a review edit as source_kind=review_edit with a NULL message id', async () => {
      rec.executeQueue.push({ rows: [] });
      rec.executeQueue.push({ rows: [{ state_version: 5 }] });
      rec.insertReturnQueue.push([{ revision: 2 }]);

      await repo.commitTurn({
        ...baseParams,
        updates: [
          answeredUpdate({
            sourceKind: 'review_edit',
            sourceMessageId: null,
            value: 'corrected by hand',
            evidence: 'corrected by hand',
          }),
        ],
        extractionRun: runRecord(),
      });

      const evidenceInsert = rec.inserts.find((c) => c.table === onboardingSlotEvidence);
      const evidence = evidenceInsert?.values as Record<string, unknown>;

      // chk_onboarding_slot_evidence_review_edit REQUIRES a null message id, and
      // 'review:<slot>' is not a uuid — writing it fails at the driver.
      expect(evidence.sourceKind).toBe('review_edit');
      expect(evidence.sourceMessageId).toBeNull();
    });

    it('defaults evidence to chat_message when the update carries no source kind', async () => {
      rec.executeQueue.push({ rows: [] });
      rec.executeQueue.push({ rows: [{ state_version: 5 }] });
      rec.insertReturnQueue.push([{ revision: 1 }]);

      await repo.commitTurn({
        ...baseParams,
        updates: [answeredUpdate()],
        extractionRun: runRecord(),
      });

      const evidenceInsert = rec.inserts.find((c) => c.table === onboardingSlotEvidence);
      const evidence = evidenceInsert?.values as Record<string, unknown>;
      expect(evidence.sourceKind).toBe('chat_message');
      expect(evidence.sourceMessageId).toBe('msg-1');
    });

    it('records the accepted extraction run with resultingStateVersion = expected + 1', async () => {
      rec.executeQueue.push({ rows: [] });
      rec.executeQueue.push({ rows: [{ state_version: 5 }] });

      await repo.commitTurn({ ...baseParams, updates: [], extractionRun: runRecord() });

      const runInsert = rec.inserts.find((c) => c.table === onboardingExtractionRuns);
      const values = runInsert?.values as Record<string, unknown>;
      expect(values.sourceStateVersion).toBe(4);
      expect(values.resultingStateVersion).toBe(5);
      expect(values.resultingStatus).toBe('active');
      expect(values.nextObjective).toBe('communication');
      expect(values.triggerMessageId).toBe('msg-1');
      expect(values.clientTurnId).toBe('turn-1');
    });

    it('writes no evidence row for a declined slot', async () => {
      rec.executeQueue.push({ rows: [] });
      rec.executeQueue.push({ rows: [{ state_version: 5 }] });
      rec.insertReturnQueue.push([{ revision: 1 }]);

      await repo.commitTurn({
        ...baseParams,
        updates: [
          answeredUpdate({ slot: 'never_surface', status: 'declined', value: null, evidence: null }),
        ],
        extractionRun: runRecord(),
      });

      expect(rec.inserts.some((c) => c.table === onboardingSlotEvidence)).toBe(false);
    });

    it('derives the attempt number from stored runs instead of trusting the caller', async () => {
      rec.executeQueue.push({ rows: [] });
      rec.executeQueue.push({ rows: [{ state_version: 5 }] });

      await repo.commitTurn({ ...baseParams, updates: [], extractionRun: runRecord() });

      // A failed extraction for this same trigger message already occupies
      // attempt_no = 1 in uq_onboarding_extraction_runs_attempt, so a literal
      // 1 makes the successful retry violate that index and roll back the
      // whole commit.
      const runInsert = rec.inserts.find((c) => c.table === onboardingExtractionRuns);
      const values = runInsert?.values as Record<string, unknown>;
      expect(sqlText(values.attemptNo as SQL)).toMatch(/max\(attempt_no\)/i);
    });

    it('forces outcome accepted even when the caller passes a different outcome', async () => {
      rec.executeQueue.push({ rows: [] });
      rec.executeQueue.push({ rows: [{ state_version: 5 }] });

      await repo.commitTurn({
        ...baseParams,
        updates: [],
        extractionRun: runRecord({ outcome: 'failed' }),
      });

      const runInsert = rec.inserts.find((c) => c.table === onboardingExtractionRuns);
      expect((runInsert?.values as Record<string, unknown>).outcome).toBe('accepted');
    });
  });

  describe('recordFailedRun', () => {
    it('writes sourceStateVersion and all result columns as null', async () => {
      await repo.recordFailedRun({
        interviewId: 'iv-1',
        organizationId: 'org-1',
        triggerMessageId: 'msg-1',
        clientTurnId: 'turn-1',
        run: runRecord({ outcome: 'failed' }),
      });

      const runInsert = rec.inserts.find((c) => c.table === onboardingExtractionRuns);
      const values = runInsert?.values as Record<string, unknown>;
      expect(values.outcome).toBe('failed');
      expect(values.sourceStateVersion).toBeNull();
      expect(values.resultingStateVersion).toBeNull();
      expect(values.resultingStatus).toBeNull();
      expect(values.nextObjective).toBeNull();
    });

    it('swallows a duplicate-attempt unique violation', async () => {
      mocks.getControlDb.mockImplementation(() => ({
        insert: () => ({
          values: () => {
            const err = new Error('duplicate key value violates unique constraint');
            Object.assign(err, { code: '23505' });
            return Promise.reject(err);
          },
        }),
      }));

      await expect(
        repo.recordFailedRun({
          interviewId: 'iv-1',
          organizationId: 'org-1',
          triggerMessageId: 'msg-1',
          clientTurnId: null,
          run: runRecord({ outcome: 'rejected' }),
        })
      ).resolves.toBeUndefined();
    });

    it('rethrows an error that is not a unique violation', async () => {
      mocks.getControlDb.mockImplementation(() => ({
        insert: () => ({
          values: () => Promise.reject(new Error('connection terminated')),
        }),
      }));

      await expect(
        repo.recordFailedRun({
          interviewId: 'iv-1',
          organizationId: 'org-1',
          triggerMessageId: 'msg-1',
          clientTurnId: null,
          run: runRecord({ outcome: 'rejected' }),
        })
      ).rejects.toThrow('connection terminated');
    });
  });

  describe('markStatus', () => {
    it('sets completedAt to a Date when transitioning to completed', async () => {
      rec.updateReturnQueue.push([{ id: 'iv-1' }]);

      const changed = await repo.markStatus({
        interviewId: 'iv-1',
        organizationId: 'org-1',
        userId: 'u-1',
        from: ['review'],
        to: 'completed',
      });

      expect(changed).toBe(true);
      const update = rec.updates.find((c) => c.table === onboardingInterviews);
      const set = update?.set as Record<string, unknown>;
      expect(set.status).toBe('completed');
      expect(set.completedAt).toBeInstanceOf(Date);
    });

    it('nulls completedAt when transitioning to a non-completed status', async () => {
      rec.updateReturnQueue.push([{ id: 'iv-1' }]);

      await repo.markStatus({
        interviewId: 'iv-1',
        organizationId: 'org-1',
        userId: 'u-1',
        from: ['active'],
        to: 'abandoned',
      });

      const update = rec.updates.find((c) => c.table === onboardingInterviews);
      expect((update?.set as Record<string, unknown>).completedAt).toBeNull();
    });

    it('returns false when the update matches no row', async () => {
      rec.updateReturnQueue.push([]);

      const changed = await repo.markStatus({
        interviewId: 'iv-1',
        organizationId: 'org-1',
        userId: 'u-1',
        from: ['active'],
        to: 'completed',
      });

      expect(changed).toBe(false);
    });
  });
});
