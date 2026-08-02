import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';
import {
  onboardingExtractionRuns,
  onboardingInterviews,
  onboardingSlotEvidence,
  onboardingSlotValues,
  users,
} from '../drizzle/schemas/control_schema';
import { ONBOARDING_SLOTS } from '../../onboarding/types';
import type {
  InterviewSlot,
  InterviewStatus,
  OnboardingSlot,
} from '../../onboarding/types';
import type { BaseImprint, SlotUpdate } from '../../onboarding/schemas';

const IN_FLIGHT_STATUSES: InterviewStatus[] = ['active', 'paused', 'review'];
const UNIQUE_VIOLATION = '23505';

export interface CreateInterviewParams {
  userId: string;
  organizationId: string;
  guideAgentId: string;
}

export interface InterviewSnapshot {
  id: string;
  userId: string;
  organizationId: string;
  guideAgentId: string;
  status: InterviewStatus;
  currentObjective: OnboardingSlot | null;
  turnCount: number;
  stateVersion: number;
  slots: Record<OnboardingSlot, InterviewSlot>;
}

export interface ExtractionRunRecord {
  outcome: 'accepted' | 'rejected' | 'failed';
  model: string | null;
  provider: string | null;
  promptVersion: string | null;
  rawResponse: string | null;
  acceptedUpdates: unknown;
  rejectedUpdates: unknown;
  validationErrors: unknown;
  latencyMs: number | null;
  tokensUsed: number | null;
  sourceMessageIds: string[];
}

export interface CommitTurnParams {
  interviewId: string;
  organizationId: string;
  userId: string;
  expectedStateVersion: number;
  nextObjective: OnboardingSlot | null;
  nextStatus: InterviewStatus;
  updates: SlotUpdate[];
  triggerMessageId: string;
  clientTurnId: string | null;
  extractionRun: ExtractionRunRecord;
  /**
   * Statuses the interview may be in for this commit to apply. Defaults to
   * `active` — an interview turn. Review-screen corrections pass `['review']`,
   * since by then the interview has left the conversational phase.
   */
  allowedFromStatuses?: InterviewStatus[];
}

export interface RecordFailedRunParams {
  interviewId: string;
  organizationId: string;
  triggerMessageId: string;
  clientTurnId: string | null;
  run: ExtractionRunRecord;
}

export interface MarkStatusParams {
  interviewId: string;
  organizationId: string;
  userId: string;
  from: InterviewStatus[];
  to: InterviewStatus;
}

export interface MarkUserOnboardedParams {
  userId: string;
  organizationId: string;
  /** null when the user skipped: settled, but with nothing learned about them. */
  imprint: BaseImprint | null;
}

export type CommitTurnResult =
  | {
      committed: true;
      stateVersion: number;
      status: InterviewStatus;
      currentObjective: OnboardingSlot | null;
    }
  | { committed: false; reason: 'state_conflict' }
  | {
      committed: false;
      reason: 'replayed';
      stateVersion: number;
      status: InterviewStatus;
      currentObjective: OnboardingSlot | null;
    };

export class InterviewNotFoundError extends Error {
  readonly code = 'ONBOARDING_INTERVIEW_NOT_FOUND';

  constructor(message = 'Onboarding interview not found') {
    super(message);
    this.name = 'InterviewNotFoundError';
  }
}

interface InterviewRowShape {
  id: string;
  userId: string;
  organizationId: string;
  guideAgentId: string;
  status: string;
  currentObjective: string | null;
  turnCount: number;
  stateVersion: number;
}

interface SlotRowShape {
  slotKey: string;
  status: string;
  value: unknown;
  confidence: string | number | null;
  attempts: number;
  revision: number;
}

interface EvidenceRowShape {
  slotKey: string;
  slotRevision: number;
  sourceMessageId: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * A failed extraction already occupies an attempt slot for this trigger
 * message, so a literal attempt number from the caller makes the successful
 * retry violate uq_onboarding_extraction_runs_attempt and roll back the whole
 * commit. Derived in SQL so it is evaluated inside the same transaction.
 */
function nextAttemptNo(interviewId: string, triggerMessageId: string): SQL<number> {
  return sql<number>`(
    SELECT COALESCE(MAX(attempt_no), 0) + 1
    FROM onboarding_extraction_runs
    WHERE interview_id = ${interviewId}
      AND trigger_message_id = ${triggerMessageId}
  )`;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

function toSlotValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function emptySlot(): InterviewSlot {
  return { status: 'unanswered', value: null, evidenceMessageIds: [], confidence: null, attempts: 0, revision: 0 };
}

function emptySlotMap(): Record<OnboardingSlot, InterviewSlot> {
  const slots = {} as Record<OnboardingSlot, InterviewSlot>;
  for (const key of ONBOARDING_SLOTS) {
    slots[key] = emptySlot();
  }
  return slots;
}

/**
 * Control-plane repository for the conversational onboarding interview.
 *
 * navratna-core runs multi-instance, so no in-process lock can serialize
 * concurrent turns. Every state transition is a conditional write: the CAS in
 * `commitTurn` guards on `state_version`, and the loser of a race matches no
 * row and is told to retry. Cross-plane ids (guide agent, chat messages) are
 * stored as plain uuids — this file never touches the intelligence plane.
 */
export class OnboardingInterviewRepository {
  private get db() {
    return getControlDb();
  }

  async createInterview(params: CreateInterviewParams): Promise<InterviewSnapshot> {
    const { userId, organizationId, guideAgentId } = params;

    try {
      return await this.db.transaction(async (tx) => {
        const inserted = (await tx
          .insert(onboardingInterviews)
          .values({
            userId,
            organizationId,
            guideAgentId,
            status: 'active',
            currentObjective: ONBOARDING_SLOTS[0],
            turnCount: 0,
            stateVersion: 0,
          })
          .onConflictDoNothing({
            target: [
              onboardingInterviews.organizationId,
              onboardingInterviews.userId,
              onboardingInterviews.guideAgentId,
            ],
          })
          .returning());

        if (inserted.length > 0) {
          const row = inserted[0];
          await tx.insert(onboardingSlotValues).values(
            ONBOARDING_SLOTS.map((slotKey) => ({
              interviewId: row.id,
              organizationId,
              slotKey,
              status: 'unanswered',
              value: null as string | null,
              attempts: 0,
              revision: 0,
            }))
          );
          return this.toSnapshot(row, [], []);
        }

        const existing = (await tx
          .select()
          .from(onboardingInterviews)
          .where(
            and(
              eq(onboardingInterviews.organizationId, organizationId),
              eq(onboardingInterviews.userId, userId),
              eq(onboardingInterviews.guideAgentId, guideAgentId)
            )
          )
          .limit(1));

        if (existing.length === 0) {
          throw new InterviewNotFoundError(
            'Interview insert conflicted but the existing row could not be read back'
          );
        }

        const row = existing[0];
        const slotRows = (await tx
          .select()
          .from(onboardingSlotValues)
          .where(eq(onboardingSlotValues.interviewId, row.id)));
        const evidenceRows = (await tx
          .select()
          .from(onboardingSlotEvidence)
          .where(eq(onboardingSlotEvidence.interviewId, row.id)));

        return this.toSnapshot(row, slotRows, evidenceRows);
      });
    } catch (error: unknown) {
      logger.error('OnboardingInterviewRepository.createInterview failed', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findActiveInterview(
    userId: string,
    organizationId: string
  ): Promise<InterviewSnapshot | null> {
    try {
      const rows = (await this.db
        .select()
        .from(onboardingInterviews)
        .where(
          and(
            eq(onboardingInterviews.userId, userId),
            eq(onboardingInterviews.organizationId, organizationId),
            inArray(onboardingInterviews.status, IN_FLIGHT_STATUSES)
          )
        )
        .orderBy(asc(onboardingInterviews.lastActivityAt))
        .limit(1));

      if (rows.length === 0) return null;
      const row = rows[0];

      const slotRows = (await this.db
        .select()
        .from(onboardingSlotValues)
        .where(eq(onboardingSlotValues.interviewId, row.id)));

      const evidenceRows = (await this.db
        .select()
        .from(onboardingSlotEvidence)
        .where(eq(onboardingSlotEvidence.interviewId, row.id)));

      return this.toSnapshot(row, slotRows, evidenceRows);
    } catch (error: unknown) {
      logger.error('OnboardingInterviewRepository.findActiveInterview failed', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Unfiltered by status, unlike findActiveInterview. A terminal interview is
   * invisible to that lookup but still occupies uq_onboarding_interviews_user_guide,
   * so the caller needs it to tell "never started" from "already finished".
   */
  async findLatestInterview(
    userId: string,
    organizationId: string
  ): Promise<InterviewSnapshot | null> {
    try {
      const rows = (await this.db
        .select()
        .from(onboardingInterviews)
        .where(
          and(
            eq(onboardingInterviews.userId, userId),
            eq(onboardingInterviews.organizationId, organizationId)
          )
        )
        .orderBy(desc(onboardingInterviews.lastActivityAt))
        .limit(1));

      if (rows.length === 0) return null;
      const row = rows[0];

      const slotRows = (await this.db
        .select()
        .from(onboardingSlotValues)
        .where(eq(onboardingSlotValues.interviewId, row.id)));

      const evidenceRows = (await this.db
        .select()
        .from(onboardingSlotEvidence)
        .where(eq(onboardingSlotEvidence.interviewId, row.id)));

      return this.toSnapshot(row, slotRows, evidenceRows);
    } catch (error: unknown) {
      logger.error('OnboardingInterviewRepository.findLatestInterview failed', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async commitTurn(params: CommitTurnParams): Promise<CommitTurnResult> {
    const {
      interviewId,
      organizationId,
      userId,
      expectedStateVersion,
      nextObjective,
      nextStatus,
      updates,
      triggerMessageId,
      clientTurnId,
      extractionRun,
      allowedFromStatuses = ['active'],
    } = params;

    try {
      return await this.db.transaction(async (tx) => {
        const replay = await tx.execute(sql`
          SELECT resulting_state_version, resulting_status, next_objective
          FROM onboarding_extraction_runs
          WHERE interview_id = ${interviewId}
            AND trigger_message_id = ${triggerMessageId}
            AND outcome = 'accepted'
          LIMIT 1
        `);

        const replayRow = replay.rows[0];
        if (replayRow) {
          return {
            committed: false,
            reason: 'replayed',
            stateVersion: toNumber(replayRow.resulting_state_version),
            status: replayRow.resulting_status as InterviewStatus,
            currentObjective: (replayRow.next_objective as OnboardingSlot | null) ?? null,
          };
        }

        const cas = await tx.execute(sql`
          UPDATE onboarding_interviews
          SET current_objective = ${nextObjective},
              status = ${nextStatus},
              turn_count = turn_count + 1,
              state_version = state_version + 1,
              last_activity_at = NOW(),
              updated_at = NOW(),
              completed_at = CASE WHEN ${nextStatus} = 'completed' THEN NOW() ELSE completed_at END
          WHERE id = ${interviewId}
            AND organization_id = ${organizationId}
            AND user_id = ${userId}
            AND state_version = ${expectedStateVersion}
            AND status = ANY(${allowedFromStatuses}::text[])
          RETURNING state_version
        `);

        const casRow = cas.rows[0];
        if (!casRow) {
          return { committed: false, reason: 'state_conflict' };
        }
        const resultingStateVersion = toNumber(casRow.state_version);

        for (const update of updates) {
          const rows = (await tx
            .insert(onboardingSlotValues)
            .values({
              interviewId,
              organizationId,
              slotKey: update.slot,
              status: update.status,
              value: update.value,
              attempts: 1,
              revision: 1,
            })
            .onConflictDoUpdate({
              target: [onboardingSlotValues.interviewId, onboardingSlotValues.slotKey],
              set: {
                status: update.status,
                value: update.value,
                clarificationReason: null,
                attempts: sql`${onboardingSlotValues.attempts} + 1`,
                revision: sql`${onboardingSlotValues.revision} + 1`,
                updatedAt: new Date(),
              },
            })
            .returning({ revision: onboardingSlotValues.revision }));

          if (update.status !== 'answered' || update.evidence === null) continue;

          await tx
            .insert(onboardingSlotEvidence)
            .values({
              interviewId,
              organizationId,
              slotKey: update.slot,
              slotRevision: toNumber(rows[0]?.revision ?? 1),
              sourceKind: update.sourceKind ?? 'chat_message',
              sourceMessageId: update.sourceKind === 'review_edit' ? null : update.sourceMessageId,
              evidenceText: update.evidence,
            })
            .onConflictDoNothing();
        }

        await tx.insert(onboardingExtractionRuns).values({
          interviewId,
          organizationId,
          triggerMessageId,
          sourceMessageIds: extractionRun.sourceMessageIds,
          clientTurnId,
          attemptNo: nextAttemptNo(interviewId, triggerMessageId),
          outcome: 'accepted',
          model: extractionRun.model,
          provider: extractionRun.provider,
          promptVersion: extractionRun.promptVersion,
          sourceStateVersion: expectedStateVersion,
          resultingStateVersion,
          resultingStatus: nextStatus,
          nextObjective,
          rawResponse: extractionRun.rawResponse,
          acceptedUpdates: extractionRun.acceptedUpdates,
          rejectedUpdates: extractionRun.rejectedUpdates,
          validationErrors: extractionRun.validationErrors,
          latencyMs: extractionRun.latencyMs,
          tokensUsed: extractionRun.tokensUsed,
        });

        return {
          committed: true,
          stateVersion: resultingStateVersion,
          status: nextStatus,
          currentObjective: nextObjective,
        };
      });
    } catch (error: unknown) {
      logger.error('OnboardingInterviewRepository.commitTurn failed', {
        interviewId,
        organizationId,
        expectedStateVersion,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async recordFailedRun(params: RecordFailedRunParams): Promise<void> {
    const { interviewId, organizationId, triggerMessageId, clientTurnId, run } = params;

    try {
      await this.db.insert(onboardingExtractionRuns).values({
        interviewId,
        organizationId,
        triggerMessageId,
        sourceMessageIds: run.sourceMessageIds,
        clientTurnId,
        attemptNo: nextAttemptNo(interviewId, triggerMessageId),
        outcome: run.outcome,
        model: run.model,
        provider: run.provider,
        promptVersion: run.promptVersion,
        sourceStateVersion: null,
        resultingStateVersion: null,
        resultingStatus: null,
        nextObjective: null,
        rawResponse: run.rawResponse,
        acceptedUpdates: run.acceptedUpdates,
        rejectedUpdates: run.rejectedUpdates,
        validationErrors: run.validationErrors,
        latencyMs: run.latencyMs,
        tokensUsed: run.tokensUsed,
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        logger.warn('OnboardingInterviewRepository.recordFailedRun skipped a duplicate attempt', {
          interviewId,
          triggerMessageId,
        });
        return;
      }
      logger.error('OnboardingInterviewRepository.recordFailedRun failed', {
        interviewId,
        triggerMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async markStatus(params: MarkStatusParams): Promise<boolean> {
    const { interviewId, organizationId, userId, from, to } = params;

    try {
      const rows = await this.db
        .update(onboardingInterviews)
        .set({
          status: to,
          completedAt: to === 'completed' ? new Date() : null,
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(onboardingInterviews.id, interviewId),
            eq(onboardingInterviews.organizationId, organizationId),
            eq(onboardingInterviews.userId, userId),
            inArray(onboardingInterviews.status, from)
          )
        )
        .returning({ id: onboardingInterviews.id });

      return rows.length > 0;
    } catch (error: unknown) {
      logger.error('OnboardingInterviewRepository.markStatus failed', {
        interviewId,
        organizationId,
        to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Flips the flag `GET /onboarding-status` reads. The imprint is stored beside
   * it so the answers survive as the user's profile rather than living only in
   * the interview tables.
   *
   * A null imprint means the user skipped. They are still SETTLED — the flag
   * must flip either way, because the interview row is already terminal and
   * startInterview refuses terminal rows, so leaving the flag false would show
   * the user an onboarding they can never enter.
   */
  async markUserOnboarded(params: MarkUserOnboardedParams): Promise<void> {
    const { userId, organizationId, imprint } = params;

    try {
      await this.db
        .update(users)
        .set({
          onboardingProgress: {
            isCompleted: true,
            currentStep: imprint === null ? 0 : ONBOARDING_SLOTS.length,
            completedSteps: imprint === null ? [] : [...ONBOARDING_SLOTS],
            completedAt: new Date(),
            responses: imprint === null ? { skipped: true } : { baseImprint: imprint },
          },
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)));
    } catch (error: unknown) {
      logger.error('OnboardingInterviewRepository.markUserOnboarded failed', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private toSnapshot(
    row: InterviewRowShape,
    slotRows: SlotRowShape[],
    evidenceRows: EvidenceRowShape[]
  ): InterviewSnapshot {
    const slots = emptySlotMap();

    for (const slotRow of slotRows) {
      const key = slotRow.slotKey as OnboardingSlot;
      if (!(key in slots)) continue;
      slots[key] = {
        status: slotRow.status as InterviewSlot['status'],
        value: toSlotValue(slotRow.value),
        evidenceMessageIds: [],
        confidence: toNullableNumber(slotRow.confidence),
        attempts: toNumber(slotRow.attempts),
        revision: toNumber(slotRow.revision),
      };
    }

    for (const evidence of evidenceRows) {
      const key = evidence.slotKey as OnboardingSlot;
      const slot = slots[key];
      if (!slot || evidence.sourceMessageId === null) continue;
      if (toNumber(evidence.slotRevision) !== slot.revision) continue;
      slot.evidenceMessageIds.push(evidence.sourceMessageId);
    }

    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      guideAgentId: row.guideAgentId,
      status: row.status as InterviewStatus,
      currentObjective: (row.currentObjective as OnboardingSlot | null) ?? null,
      turnCount: toNumber(row.turnCount),
      stateVersion: toNumber(row.stateVersion),
      slots,
    };
  }
}
