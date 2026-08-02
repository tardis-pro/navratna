import { logger } from '@uaip/utils';
import type { AgentChatMessage } from '@uaip/types';
import { ONBOARDING_SLOTS } from './types.js';
import type { InterviewSlot, InterviewStatus, OnboardingSlot } from './types.js';
import { BaseImprintSchema } from './schemas.js';
import type { BaseImprint, SlotUpdate } from './schemas.js';
import { ExtractionFailedError, composeQuestion, extractTurn } from './extraction_service.js';
import { recommendAgents } from './agent_recommendation_service.js';
import type { AgentCandidate, AgentRecommendation } from './agent_recommendation_service.js';
import { ONBOARDING_GUIDE_AGENT_ID } from '../agent_access_service.js';
import type {
  CommitTurnParams,
  ExtractionRunRecord,
  InterviewSnapshot,
} from '../database/repositories/onboarding_interview_repository.js';
import type { AgentChatPersistenceService } from '../agent_chat_persistence_service.js';
import type { OnboardingInterviewRepository } from '../database/repositories/onboarding_interview_repository.js';
import type { UserAgentAssignmentRepository } from '../database/repositories/user_agent_assignment_repository.js';

/**
 * Orchestrates the conversational onboarding interview.
 *
 * The server owns the protocol: which slot is asked next, and whether the
 * interview is finished. The LLM only extracts deltas from a user turn and
 * phrases the next question. A model that could declare itself done, or skip
 * ahead, would make onboarding non-deterministic and unauditable — so both
 * decisions are pure functions of slot state, exported and tested separately.
 */

const TERMINAL_STATUSES = new Set<InterviewStatus>(['completed', 'abandoned']);
const LIST_SLOTS: OnboardingSlot[] = ['always_surface', 'never_surface', 'non_negotiables'];
const UNRESOLVED_STATUSES = new Set(['unanswered', 'needs_clarification']);
const TRANSCRIPT_WINDOW = 12;

export const INTERVIEW_CLOSING_LINE =
  "That's everything I need. Here's what I understood about you — correct anything I got wrong before I bring in your agents.";

export interface OnboardingServiceDeps {
  repository: OnboardingInterviewRepository;
  chat: AgentChatPersistenceService;
  assignments: UserAgentAssignmentRepository;
}

export interface OnboardingStatusResult {
  interview: InterviewSnapshot | null;
  messages: AgentChatMessage[];
}

export type StartInterviewResult =
  | { outcome: 'started'; interview: InterviewSnapshot; messages: AgentChatMessage[] }
  | { outcome: 'already_finished'; status: InterviewStatus };

/**
 * `interviewId` is optional because the interview is always the caller's own
 * active one — the service loads it by identity. When supplied it acts as an
 * assertion: a mismatch means the client is acting on a stale interview and is
 * refused rather than silently redirected to the current one.
 */
export interface SubmitTurnParams {
  userId: string;
  organizationId: string;
  interviewId?: string;
  message: string;
  clientTurnId: string;
  expectedStateVersion: number;
}

export interface UpdateSlotParams {
  userId: string;
  organizationId: string;
  interviewId?: string;
  slotKey: OnboardingSlot;
  value: string;
  status: 'answered' | 'declined';
}

export type SubmitTurnResult =
  | { outcome: 'not_found' }
  | { outcome: 'extraction_failed' }
  | { outcome: 'conflict' }
  | { outcome: 'processing' }
  | { outcome: 'replayed'; reply: string; interview: InterviewSnapshot }
  | { outcome: 'committed'; reply: string; interview: InterviewSnapshot };

export type UpdateSlotResult =
  | { outcome: 'not_found' }
  | { outcome: 'conflict' }
  | { outcome: 'committed'; interview: InterviewSnapshot };

export type CompleteInterviewResult =
  | { outcome: 'not_found' }
  | { outcome: 'not_ready' }
  | {
      outcome: 'completed';
      imprint: BaseImprint;
      provisionedAgents: AgentRecommendation[];
    };

export function selectNextObjective(
  slots: Record<OnboardingSlot, InterviewSlot>
): OnboardingSlot | null {
  for (const key of ONBOARDING_SLOTS) {
    if (UNRESOLVED_STATUSES.has(slots[key]?.status ?? 'unanswered')) return key;
  }
  return null;
}

export function isInterviewComplete(slots: Record<OnboardingSlot, InterviewSlot>): boolean {
  return selectNextObjective(slots) === null;
}

function answeredValue(
  slots: Record<OnboardingSlot, InterviewSlot>,
  key: OnboardingSlot
): string | null {
  const entry = slots[key];
  if (!entry || entry.status !== 'answered') return null;
  return entry.value;
}

/**
 * Splits a free-prose answer into list entries on newlines, semicolons and
 * commas. Users write "prod outages; security alerts, PR reviews" rather than
 * a JSON array, and a priority list is only useful to match against when it is
 * separated into individual items.
 */
function splitList(value: string | null): string[] {
  if (value === null) return [];
  return value
    .split(/[\n;,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function assembleImprint(slots: Record<OnboardingSlot, InterviewSlot>): BaseImprint {
  const identity = answeredValue(slots, 'identity');
  const scope = answeredValue(slots, 'scope_of_work');

  return BaseImprintSchema.parse({
    identity: {
      name: null,
      role: null,
      timezone: null,
      communicationStyle: answeredValue(slots, 'communication'),
      description: identity,
    },
    domains:
      scope === null
        ? []
        : [{ name: null, scope, tools: [], repositories: [] }],
    workPatterns: {
      peakHours: null,
      reviewStyle: answeredValue(slots, 'decision_style'),
      delegationPreference: answeredValue(slots, 'approval_style'),
      contextSwitchFrequency: null,
    },
    priorities: {
      alwaysSurface: splitList(answeredValue(slots, 'always_surface')),
      neverSurface: splitList(answeredValue(slots, 'never_surface')),
      surfaceOnlyIfBlocking: [],
    },
    security: {
      approvalThreshold: answeredValue(slots, 'approval_style'),
      notificationChannel: null,
      autoRevertOnFailure: null,
      maxAutonomyLevel: null,
      nonNegotiables: splitList(answeredValue(slots, 'non_negotiables')),
      trustBreakers: answeredValue(slots, 'trust_kill'),
    },
    systemVision: {
      shortTerm: null,
      longTerm: answeredValue(slots, 'vision'),
      personality: null,
    },
  });
}

function mergeSlots(
  slots: Record<OnboardingSlot, InterviewSlot>,
  updates: SlotUpdate[]
): Record<OnboardingSlot, InterviewSlot> {
  const merged: Record<OnboardingSlot, InterviewSlot> = { ...slots };
  for (const update of updates) {
    const previous = merged[update.slot];
    merged[update.slot] = {
      status: update.status,
      value: update.value,
      evidenceMessageIds: previous?.evidenceMessageIds ?? [],
      confidence: previous?.confidence ?? null,
      attempts: (previous?.attempts ?? 0) + 1,
      revision: (previous?.revision ?? 0) + 1,
    };
  }
  return merged;
}

function toTranscript(messages: AgentChatMessage[]) {
  return messages.slice(-TRANSCRIPT_WINDOW).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export class OnboardingService {
  constructor(private readonly deps: OnboardingServiceDeps) {}

  async getStatus(userId: string, organizationId: string): Promise<OnboardingStatusResult> {
    const interview = await this.deps.repository.findActiveInterview(userId, organizationId);
    if (!interview) return { interview: null, messages: [] };

    const messages = await this.loadTranscript(userId, organizationId, interview.guideAgentId);
    return { interview, messages };
  }

  async startInterview(userId: string, organizationId: string): Promise<StartInterviewResult> {
    const existing = await this.deps.repository.findActiveInterview(userId, organizationId);
    if (existing) {
      const messages = await this.loadTranscript(userId, organizationId, existing.guideAgentId);
      return { outcome: 'started', interview: existing, messages };
    }

    // A completed or abandoned interview is invisible to findActiveInterview
    // but still holds uq_onboarding_interviews_user_guide, so createInterview
    // would read that terminal row back and open a chat whose every turn 404s.
    const latest = await this.deps.repository.findLatestInterview(userId, organizationId);
    if (latest !== null && TERMINAL_STATUSES.has(latest.status)) {
      return { outcome: 'already_finished', status: latest.status };
    }

    const interview = await this.deps.repository.createInterview({
      userId,
      organizationId,
      guideAgentId: ONBOARDING_GUIDE_AGENT_ID,
    });

    const objective = interview.currentObjective ?? ONBOARDING_SLOTS[0];
    const question = await composeQuestion({
      userId,
      objective,
      recentTranscript: [],
      acknowledgePrevious: false,
    });

    await this.persistOpeningQuestion({
      userId,
      organizationId,
      agentId: interview.guideAgentId,
      interviewId: interview.id,
      question,
    });

    const messages = await this.loadTranscript(userId, organizationId, interview.guideAgentId);
    return {
      outcome: 'started',
      interview,
      messages: messages.length > 0 ? messages : this.syntheticOpening(interview, question),
    };
  }

  async submitTurn(params: SubmitTurnParams): Promise<SubmitTurnResult> {
    const { userId, organizationId, message, clientTurnId, expectedStateVersion } = params;

    const interview = await this.deps.repository.findActiveInterview(userId, organizationId);
    if (!interview) return { outcome: 'not_found' };
    if (params.interviewId !== undefined && interview.id !== params.interviewId) {
      return { outcome: 'not_found' };
    }

    const turn = await this.deps.chat.beginTurn({
      organizationId,
      userId,
      agentId: interview.guideAgentId,
      clientTurnId,
      content: message,
    });

    if (turn.state === 'completed') {
      return { outcome: 'replayed', reply: turn.content, interview };
    }
    if (turn.state === 'processing') {
      return { outcome: 'processing' };
    }

    const { conversationId, userMessageId, processingToken } = turn.claim;
    const objective = interview.currentObjective ?? ONBOARDING_SLOTS[0];
    const transcript = toTranscript(await this.deps.chat.loadHistory({ conversationId }));

    let extracted;
    try {
      extracted = await extractTurn({
        userId,
        objective,
        userMessage: message,
        recentTranscript: transcript,
        slotStates: interview.slots,
        sourceMessageId: userMessageId,
      });
    } catch (error: unknown) {
      if (!(error instanceof ExtractionFailedError)) throw error;

      await this.deps.repository.recordFailedRun({
        interviewId: interview.id,
        organizationId,
        triggerMessageId: userMessageId,
        clientTurnId,
        run: this.failedRun(userMessageId, error.message),
      });
      await this.deps.chat.failTurn(userMessageId, processingToken);
      logger.warn('Onboarding extraction failed; the user turn is preserved for retry', {
        interviewId: interview.id,
        userMessageId,
      });
      return { outcome: 'extraction_failed' };
    }

    const merged = mergeSlots(interview.slots, extracted.updates);
    const nextObjective = selectNextObjective(merged);
    const nextStatus = nextObjective === null ? 'review' : 'active';

    const commit = await this.deps.repository.commitTurn({
      interviewId: interview.id,
      organizationId,
      userId,
      expectedStateVersion,
      nextObjective,
      nextStatus,
      updates: extracted.updates,
      triggerMessageId: userMessageId,
      clientTurnId,
      extractionRun: {
        outcome: 'accepted',
        model: extracted.model,
        provider: extracted.provider,
        promptVersion: null,
        rawResponse: extracted.raw,
        acceptedUpdates: extracted.updates,
        rejectedUpdates: extracted.rejectedUpdates,
        validationErrors: [],
        latencyMs: extracted.latencyMs,
        tokensUsed: extracted.tokensUsed,
        sourceMessageIds: [userMessageId],
      },
    });

    if (commit.committed === false) {
      await this.deps.chat.failTurn(userMessageId, processingToken);

      if (commit.reason === 'state_conflict') {
        return { outcome: 'conflict' };
      }

      return {
        outcome: 'replayed',
        reply: '',
        interview: { ...interview, stateVersion: commit.stateVersion, status: commit.status },
      };
    }

    let reply: string;
    try {
      reply =
        nextObjective === null
          ? INTERVIEW_CLOSING_LINE
          : await composeQuestion({
              userId,
              objective: nextObjective,
              recentTranscript: transcript,
              acknowledgePrevious: true,
            });

      await this.deps.chat.completeTurn({
        conversationId,
        organizationId,
        clientTurnId,
        userMessageId,
        processingToken,
        content: reply,
        metadata: { onboardingInterviewId: interview.id, objective: nextObjective },
      });
    } catch (error: unknown) {
      await this.deps.chat.failTurn(userMessageId, processingToken);
      throw error;
    }

    return {
      outcome: 'committed',
      reply,
      interview: {
        ...interview,
        slots: merged,
        status: commit.status,
        currentObjective: commit.currentObjective,
        stateVersion: commit.stateVersion,
        turnCount: interview.turnCount + 1,
      },
    };
  }

  /**
   * Review-screen correction. It reuses the turn CAS rather than a bare UPDATE
   * so a manual edit is versioned, journalled and race-safe exactly like an
   * interview turn — the interview is in `review` by then, so the commit must
   * be allowed from that status instead of `active`.
   */
  async updateSlot(params: UpdateSlotParams): Promise<UpdateSlotResult> {
    const { userId, organizationId, interviewId, slotKey, value, status } = params;

    const interview = await this.deps.repository.findActiveInterview(userId, organizationId);
    if (!interview) return { outcome: 'not_found' };
    if (interviewId !== undefined && interview.id !== interviewId) return { outcome: 'not_found' };

    const isAnswered = status === 'answered';
    const update: SlotUpdate = {
      slot: slotKey,
      status,
      value: isAnswered ? value : null,
      evidence: isAnswered ? value : null,
      sourceKind: 'review_edit',
      sourceMessageId: null,
    };

    const commit = await this.deps.repository.commitTurn({
      interviewId: interview.id,
      organizationId,
      userId,
      expectedStateVersion: interview.stateVersion,
      nextObjective: interview.currentObjective,
      nextStatus: interview.status === 'review' ? 'review' : 'active',
      updates: [update],
      triggerMessageId: crypto.randomUUID(),
      clientTurnId: null,
      allowedFromStatuses: ['active', 'review'],
      extractionRun: this.manualRun(),
    } satisfies CommitTurnParams);

    if (commit.committed === false) {
      return commit.reason === 'state_conflict' ? { outcome: 'conflict' } : { outcome: 'not_found' };
    }

    return {
      outcome: 'committed',
      interview: {
        ...interview,
        slots: mergeSlots(interview.slots, [update]),
        stateVersion: commit.stateVersion,
        status: commit.status,
      },
    };
  }

  async completeInterview(
    userId: string,
    organizationId: string,
    interviewId: string | undefined,
    candidates: AgentCandidate[]
  ): Promise<CompleteInterviewResult> {
    const interview = await this.deps.repository.findActiveInterview(userId, organizationId);
    if (!interview) return { outcome: 'not_found' };
    if (interviewId !== undefined && interview.id !== interviewId) return { outcome: 'not_found' };
    if (interview.status !== 'review') return { outcome: 'not_ready' };

    const imprint = assembleImprint(interview.slots);
    const { recommendations } = recommendAgents({ slots: interview.slots, candidates });

    await this.deps.assignments.assignMany({
      userId,
      organizationId,
      agentIds: recommendations.map((recommendation) => recommendation.agentId),
      source: 'onboarding',
    });

    const marked = await this.deps.repository.markStatus({
      interviewId: interview.id,
      organizationId,
      userId,
      from: ['review'],
      to: 'completed',
    });

    if (!marked) {
      logger.info('Onboarding interview was already completed by another writer', {
        interviewId: interview.id,
      });
    }

    // Unconditional: `marked` only reports who won the interview-status race,
    // but both writers must leave the user flagged onboarded or the loser's
    // request returns success while the next page load re-opens the interview.
    await this.deps.repository.markUserOnboarded({ userId, organizationId, imprint });

    return { outcome: 'completed', imprint, provisionedAgents: recommendations };
  }

  async skipInterview(
    userId: string,
    organizationId: string,
    interviewId: string
  ): Promise<boolean> {
    const marked = await this.deps.repository.markStatus({
      interviewId,
      organizationId,
      userId,
      from: ['active', 'paused', 'review'],
      to: 'abandoned',
    });

    // Unconditional, and NOT optional. Abandoning the interview alone is a
    // permanent lockout: the status endpoint keeps reporting isCompleted:false
    // while startInterview refuses the now-terminal row, so the user is shown
    // an onboarding they can never enter. `marked` only says who won the race.
    await this.deps.repository.markUserOnboarded({ userId, organizationId, imprint: null });

    return marked;
  }

  private async loadTranscript(
    userId: string,
    organizationId: string,
    agentId: string
  ): Promise<AgentChatMessage[]> {
    const conversationId = await this.deps.chat.resolveConversation({
      organizationId,
      userId,
      agentId,
    });
    return this.deps.chat.loadHistory({ conversationId });
  }

  private async persistOpeningQuestion(params: {
    userId: string;
    organizationId: string;
    agentId: string;
    interviewId: string;
    question: string;
  }): Promise<void> {
    const clientTurnId = crypto.randomUUID();
    const turn = await this.deps.chat.beginTurn({
      organizationId: params.organizationId,
      userId: params.userId,
      agentId: params.agentId,
      clientTurnId,
      content: '',
    });

    if (turn.state !== 'claimed') return;

    await this.deps.chat.completeTurn({
      conversationId: turn.claim.conversationId,
      organizationId: params.organizationId,
      clientTurnId,
      userMessageId: turn.claim.userMessageId,
      processingToken: turn.claim.processingToken,
      content: params.question,
      metadata: { onboardingInterviewId: params.interviewId, opening: true },
    });
  }

  private syntheticOpening(interview: InterviewSnapshot, question: string): AgentChatMessage[] {
    const now = new Date();
    return [
      {
        id: crypto.randomUUID(),
        conversationId: interview.id,
        organizationId: interview.organizationId,
        clientTurnId: crypto.randomUUID(),
        role: 'assistant',
        content: question,
        generationStatus: 'completed',
        replyToMessageId: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  private failedRun(userMessageId: string, reason: string): ExtractionRunRecord {
    return {
      outcome: 'failed',
      model: null,
      provider: null,
      promptVersion: null,
      rawResponse: null,
      acceptedUpdates: [],
      rejectedUpdates: [],
      validationErrors: [{ reason }],
      latencyMs: null,
      tokensUsed: null,
      sourceMessageIds: [userMessageId],
    };
  }

  private manualRun(): ExtractionRunRecord {
    return {
      outcome: 'accepted',
      model: null,
      provider: null,
      promptVersion: 'manual-review-edit',
      rawResponse: null,
      acceptedUpdates: [],
      rejectedUpdates: [],
      validationErrors: [],
      latencyMs: null,
      tokensUsed: null,
      sourceMessageIds: [],
    };
  }
}
