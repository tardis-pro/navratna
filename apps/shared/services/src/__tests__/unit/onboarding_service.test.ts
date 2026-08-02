import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extractTurn: vi.fn(),
  composeQuestion: vi.fn(),
}));

vi.mock('../../onboarding/extraction_service.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, extractTurn: mocks.extractTurn, composeQuestion: mocks.composeQuestion };
});

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

import { ExtractionFailedError } from '../../onboarding/extraction_service';
import { ONBOARDING_SLOTS } from '../../onboarding/types';
import type { InterviewSlot, OnboardingSlot, SlotStatus } from '../../onboarding/types';
import { BaseImprintSchema } from '../../onboarding/schemas';
import type { SlotUpdate, TurnExtraction } from '../../onboarding/schemas';
import type { InterviewSnapshot } from '../../database/repositories/onboarding_interview_repository';
import type { AgentCandidate } from '../../onboarding/agent_recommendation_service';
import {
  INTERVIEW_CLOSING_LINE,
  OnboardingService,
  assembleImprint,
  isInterviewComplete,
  selectNextObjective,
} from '../../onboarding/onboarding_service';
import type { OnboardingServiceDeps } from '../../onboarding/onboarding_service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const INTERVIEW_ID = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const USER_MESSAGE_ID = '55555555-5555-4555-8555-555555555555';
const PROCESSING_TOKEN = '66666666-6666-4666-8666-666666666666';

function slot(status: SlotStatus, value: string | null = null): InterviewSlot {
  return { status, value, evidenceMessageIds: [], confidence: null, attempts: 0, revision: 0 };
}

function slotsWith(overrides: Partial<Record<OnboardingSlot, InterviewSlot>> = {}) {
  const slots = {} as Record<OnboardingSlot, InterviewSlot>;
  for (const key of ONBOARDING_SLOTS) {
    slots[key] = slot('unanswered');
  }
  return { ...slots, ...overrides };
}

function allAnswered(): Record<OnboardingSlot, InterviewSlot> {
  const slots = {} as Record<OnboardingSlot, InterviewSlot>;
  for (const key of ONBOARDING_SLOTS) {
    slots[key] = slot('answered', `value for ${key}`);
  }
  return slots;
}

function snapshot(overrides: Partial<InterviewSnapshot> = {}): InterviewSnapshot {
  return {
    id: INTERVIEW_ID,
    userId: USER_ID,
    organizationId: ORG_ID,
    guideAgentId: '77777777-7777-4777-8777-777777777777',
    status: 'active',
    currentObjective: 'identity',
    turnCount: 0,
    stateVersion: 0,
    slots: slotsWith(),
    ...overrides,
  };
}

type StampedTurn = TurnExtraction & { updates: SlotUpdate[] };

function extraction(updates: SlotUpdate[]): StampedTurn {
  return { updates, userIntent: 'answer', shouldClarify: false, clarificationReason: null };
}

function update(
  slotKey: OnboardingSlot,
  value = 'an answer',
  evidence = 'the user said an answer'
): SlotUpdate {
  return {
    slot: slotKey,
    status: 'answered',
    value,
    evidence,
    sourceKind: 'chat_message',
    sourceMessageId: USER_MESSAGE_ID,
  };
}

function extractionResult(turn: StampedTurn) {
  return {
    extraction: turn,
    updates: turn.updates,
    rejectedUpdates: [],
    raw: JSON.stringify(turn),
    model: 'gpt-4o-mini',
    provider: 'openai',
    latencyMs: 120,
    tokensUsed: 300,
  };
}

interface Deps extends OnboardingServiceDeps {
  repository: {
    createInterview: ReturnType<typeof vi.fn>;
    findActiveInterview: ReturnType<typeof vi.fn>;
    findLatestInterview: ReturnType<typeof vi.fn>;
    commitTurn: ReturnType<typeof vi.fn>;
    recordFailedRun: ReturnType<typeof vi.fn>;
    markStatus: ReturnType<typeof vi.fn>;
    markUserOnboarded: ReturnType<typeof vi.fn>;
  };
  chat: {
    resolveConversation: ReturnType<typeof vi.fn>;
    beginTurn: ReturnType<typeof vi.fn>;
    completeTurn: ReturnType<typeof vi.fn>;
    failTurn: ReturnType<typeof vi.fn>;
    loadHistory: ReturnType<typeof vi.fn>;
  };
  assignments: {
    assignMany: ReturnType<typeof vi.fn>;
    replaceProvisionalAssignments: ReturnType<typeof vi.fn>;
  };
}

function buildDeps(): Deps {
  return {
    repository: {
      createInterview: vi.fn(),
      findActiveInterview: vi.fn(),
      findLatestInterview: vi.fn().mockResolvedValue(null),
      commitTurn: vi.fn(),
      recordFailedRun: vi.fn(),
      markStatus: vi.fn(),
      markUserOnboarded: vi.fn().mockResolvedValue(undefined),
    },
    chat: {
      resolveConversation: vi.fn().mockResolvedValue(CONVERSATION_ID),
      beginTurn: vi.fn().mockResolvedValue({
        state: 'claimed',
        claim: {
          conversationId: CONVERSATION_ID,
          userMessageId: USER_MESSAGE_ID,
          processingToken: PROCESSING_TOKEN,
        },
      }),
      completeTurn: vi.fn().mockResolvedValue('assistant-message-id'),
      failTurn: vi.fn().mockResolvedValue(undefined),
      loadHistory: vi.fn().mockResolvedValue([]),
    },
    assignments: {
      assignMany: vi.fn().mockResolvedValue([]),
      replaceProvisionalAssignments: vi.fn().mockResolvedValue([]),
    },
  } as unknown as Deps;
}

const CANDIDATES: AgentCandidate[] = [
  { id: 'a-1', name: 'Josh', capabilities: ['frontend-development', 'ui-ux-design'], role: 'EXECUTOR' },
  { id: 'a-2', name: 'Keegan', capabilities: ['backend-development'], role: 'EXECUTOR' },
  { id: 'a-3', name: 'Taniye', capabilities: ['task-orchestration'], role: 'ORCHESTRATOR' },
  { id: 'a-4', name: 'Prashis', capabilities: ['full-stack-development'], role: 'EXECUTOR' },
  { id: 'a-5', name: 'Pro', capabilities: ['data-analysis'], role: 'ANALYZER' },
];

describe('selectNextObjective', () => {
  it('returns the first unanswered slot in canonical order', () => {
    const slots = slotsWith({
      identity: slot('answered', 'Pronit'),
      scope_of_work: slot('answered', 'platform'),
    });
    expect(selectNextObjective(slots)).toBe('communication');
  });

  it('skips declined and not_applicable slots', () => {
    const slots = slotsWith({
      identity: slot('declined'),
      scope_of_work: slot('not_applicable'),
      communication: slot('answered', 'terse'),
    });
    expect(selectNextObjective(slots)).toBe('always_surface');
  });

  it('returns null when every slot is resolved', () => {
    expect(selectNextObjective(allAnswered())).toBeNull();
  });
});

describe('isInterviewComplete', () => {
  it('is false while any slot needs clarification', () => {
    const slots = { ...allAnswered(), vision: slot('needs_clarification') };
    expect(isInterviewComplete(slots)).toBe(false);
    expect(selectNextObjective(slots)).toBe('vision');
  });

  it('is true when nothing remains', () => {
    expect(isInterviewComplete(allAnswered())).toBe(true);
  });
});

describe('assembleImprint', () => {
  it('output parses against BaseImprintSchema', () => {
    const imprint = assembleImprint(allAnswered());
    expect(() => BaseImprintSchema.parse(imprint)).not.toThrow();
  });

  it('leaves unanswered slots null and never fabricates a value', () => {
    const imprint = assembleImprint(slotsWith({ identity: slot('answered', 'Pronit, engineer') }));

    expect(imprint.identity.description).toBe('Pronit, engineer');
    expect(imprint.identity.role).toBeNull();
    expect(imprint.identity.communicationStyle).toBeNull();
    expect(imprint.systemVision.longTerm).toBeNull();
    expect(imprint.priorities.alwaysSurface).toEqual([]);
    expect(imprint.domains).toEqual([]);
    expect(() => BaseImprintSchema.parse(imprint)).not.toThrow();
  });

  it('does not carry a value through for a declined slot', () => {
    const imprint = assembleImprint(slotsWith({ never_surface: slot('declined') }));
    expect(imprint.priorities.neverSurface).toEqual([]);
  });

  it('splits list-shaped slots into array fields', () => {
    const imprint = assembleImprint(
      slotsWith({ always_surface: slot('answered', 'prod outages; security alerts, PR reviews') })
    );
    expect(imprint.priorities.alwaysSurface).toEqual([
      'prod outages',
      'security alerts',
      'PR reviews',
    ]);
  });

  it('keeps non-negotiables and trust-breakers as separate, retrievable answers', () => {
    const imprint = assembleImprint(
      slotsWith({
        non_negotiables: slot('answered', 'never touch prod; no data deletion'),
        trust_kill: slot('answered', 'one tenant seeing another tenant data'),
      })
    );

    // These were previously joined into security.maxAutonomyLevel with ' | ',
    // which mislabels both (neither is an autonomy level) and makes it
    // impossible to tell afterwards which half came from which question.
    expect(imprint.security.nonNegotiables).toEqual([
      'never touch prod',
      'no data deletion',
    ]);
    expect(imprint.security.trustBreakers).toBe('one tenant seeing another tenant data');
    expect(imprint.security.maxAutonomyLevel).toBeNull();
  });

  it('preserves the raw identity answer instead of mislabelling it as a job title', () => {
    const imprint = assembleImprint(
      slotsWith({ identity: slot('answered', 'Pronit, engineer in Asia/Kolkata') })
    );

    expect(imprint.identity.description).toBe('Pronit, engineer in Asia/Kolkata');
  });

  it('records the scope answer as the domain scope without inventing tools or repositories', () => {
    const imprint = assembleImprint(
      slotsWith({ scope_of_work: slot('answered', 'the React frontend and design system') })
    );

    expect(imprint.domains).toEqual([
      { name: null, scope: 'the React frontend and design system', tools: [], repositories: [] },
    ]);
  });
});

describe('OnboardingService.startInterview', () => {
  let deps: Deps;
  let service: OnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = buildDeps();
    service = new OnboardingService(deps);
  });

  it('returns the existing interview instead of creating a second', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());

    const result = await service.startInterview(USER_ID, ORG_ID);

    expect(result.interview?.id).toBe(INTERVIEW_ID);
    expect(deps.repository.createInterview).not.toHaveBeenCalled();
  });

  it('persists an opening question so the transcript is never empty', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(null);
    deps.repository.findLatestInterview.mockResolvedValue(null);
    deps.repository.createInterview.mockResolvedValue(snapshot());
    mocks.composeQuestion.mockResolvedValue('Who are you?');

    const result = await service.startInterview(USER_ID, ORG_ID);

    expect(result.outcome).toBe('started');
    expect(mocks.composeQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ objective: 'identity', acknowledgePrevious: false })
    );
    expect(deps.chat.completeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Who are you?' })
    );
    if (result.outcome !== 'started') throw new Error('expected a started interview');
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it.each(['completed', 'abandoned'] as const)(
    'refuses to restart a %s interview instead of opening a dead chat',
    async (terminal) => {
      // findActiveInterview only matches in-flight statuses, so a terminal
      // interview looks absent — but createInterview then hits
      // uq_onboarding_interviews_user_guide and reads the terminal row back.
      deps.repository.findActiveInterview.mockResolvedValue(null);
      deps.repository.findLatestInterview.mockResolvedValue(snapshot({ status: terminal }));

      const result = await service.startInterview(USER_ID, ORG_ID);

      expect(result.outcome).toBe('already_finished');
      expect(deps.repository.createInterview).not.toHaveBeenCalled();
      expect(deps.chat.completeTurn).not.toHaveBeenCalled();
    }
  );
});

describe('OnboardingService.submitTurn', () => {
  let deps: Deps;
  let service: OnboardingService;

  const params = {
    userId: USER_ID,
    organizationId: ORG_ID,
    interviewId: INTERVIEW_ID,
    message: 'I am Pronit, a platform engineer',
    clientTurnId: '88888888-8888-4888-8888-888888888888',
    expectedStateVersion: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    deps = buildDeps();
    service = new OnboardingService(deps);
    mocks.composeQuestion.mockResolvedValue('And what do you manage?');
  });

  it('returns not_found when there is no in-flight interview', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(null);

    const result = await service.submitTurn(params);

    expect(result.outcome).toBe('not_found');
    expect(deps.chat.beginTurn).not.toHaveBeenCalled();
  });

  it('persists the user message before extraction runs', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());
    mocks.extractTurn.mockResolvedValue(extractionResult(extraction([update('identity')])));
    deps.repository.commitTurn.mockResolvedValue({
      committed: true,
      stateVersion: 1,
      status: 'active',
      currentObjective: 'scope_of_work',
    });

    await service.submitTurn(params);

    const beginOrder = deps.chat.beginTurn.mock.invocationCallOrder[0];
    const extractOrder = mocks.extractTurn.mock.invocationCallOrder[0];
    expect(beginOrder).toBeLessThan(extractOrder);
  });

  it('keeps the user message and fails the turn when extraction throws', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());
    mocks.extractTurn.mockRejectedValue(new ExtractionFailedError('model returned garbage'));

    const result = await service.submitTurn(params);

    expect(result.outcome).toBe('extraction_failed');
    expect(deps.repository.recordFailedRun).toHaveBeenCalledWith(
      expect.objectContaining({ run: expect.objectContaining({ outcome: 'failed' }) })
    );
    expect(deps.chat.failTurn).toHaveBeenCalledWith(USER_MESSAGE_ID, PROCESSING_TOKEN);
    expect(deps.repository.commitTurn).not.toHaveBeenCalled();
  });

  it('computes the next objective in the server, never from the model', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());
    mocks.extractTurn.mockResolvedValue(extractionResult(extraction([update('vision')])));
    deps.repository.commitTurn.mockResolvedValue({
      committed: true,
      stateVersion: 1,
      status: 'active',
      currentObjective: 'identity',
    });

    await service.submitTurn(params);

    expect(deps.repository.commitTurn).toHaveBeenCalledWith(
      expect.objectContaining({ nextObjective: 'identity', nextStatus: 'active' })
    );
  });

  it("passes the caller's expectedStateVersion through unchanged", async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot({ stateVersion: 9 }));
    mocks.extractTurn.mockResolvedValue(extractionResult(extraction([update('identity')])));
    deps.repository.commitTurn.mockResolvedValue({
      committed: true,
      stateVersion: 4,
      status: 'active',
      currentObjective: 'scope_of_work',
    });

    await service.submitTurn({ ...params, expectedStateVersion: 3 });

    expect(deps.repository.commitTurn).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStateVersion: 3 })
    );
  });

  it('returns conflict and fails the turn on a CAS conflict', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());
    mocks.extractTurn.mockResolvedValue(extractionResult(extraction([update('identity')])));
    deps.repository.commitTurn.mockResolvedValue({ committed: false, reason: 'state_conflict' });

    const result = await service.submitTurn(params);

    expect(result.outcome).toBe('conflict');
    expect(deps.chat.failTurn).toHaveBeenCalledWith(USER_MESSAGE_ID, PROCESSING_TOKEN);
    expect(mocks.composeQuestion).not.toHaveBeenCalled();
    expect(deps.chat.completeTurn).not.toHaveBeenCalled();
  });

  it('does not call the LLM again on a replayed turn', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());
    mocks.extractTurn.mockResolvedValue(extractionResult(extraction([update('identity')])));
    deps.repository.commitTurn.mockResolvedValue({
      committed: false,
      reason: 'replayed',
      stateVersion: 5,
      status: 'active',
      currentObjective: 'communication',
    });

    const result = await service.submitTurn(params);

    expect(result.outcome).toBe('replayed');
    expect(mocks.composeQuestion).not.toHaveBeenCalled();
  });

  it('replays the stored reply when the chat layer already completed the turn', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());
    deps.chat.beginTurn.mockResolvedValue({
      state: 'completed',
      conversationId: CONVERSATION_ID,
      content: 'already answered',
      assistantMessageId: 'assistant-1',
    });

    const result = await service.submitTurn(params);

    expect(result.outcome).toBe('replayed');
    expect(mocks.extractTurn).not.toHaveBeenCalled();
    expect(deps.repository.commitTurn).not.toHaveBeenCalled();
  });

  it('reports processing when another attempt holds the lease', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());
    deps.chat.beginTurn.mockResolvedValue({ state: 'processing', conversationId: CONVERSATION_ID });

    const result = await service.submitTurn(params);

    expect(result.outcome).toBe('processing');
    expect(mocks.extractTurn).not.toHaveBeenCalled();
  });

  it('emits a deterministic closing line instead of asking the model at review', async () => {
    const nearlyDone = { ...allAnswered(), trust_kill: slot('unanswered') };
    deps.repository.findActiveInterview.mockResolvedValue(
      snapshot({ currentObjective: 'trust_kill', slots: nearlyDone })
    );
    mocks.extractTurn.mockResolvedValue(extractionResult(extraction([update('trust_kill')])));
    deps.repository.commitTurn.mockResolvedValue({
      committed: true,
      stateVersion: 10,
      status: 'review',
      currentObjective: null,
    });

    const result = await service.submitTurn(params);

    expect(deps.repository.commitTurn).toHaveBeenCalledWith(
      expect.objectContaining({ nextObjective: null, nextStatus: 'review' })
    );
    expect(mocks.composeQuestion).not.toHaveBeenCalled();
    expect(result.outcome).toBe('committed');
    if (result.outcome === 'committed') {
      expect(result.reply).toBe(INTERVIEW_CLOSING_LINE);
    }
  });

  it('fails the turn and rethrows when composing the next question throws', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());
    mocks.extractTurn.mockResolvedValue(extractionResult(extraction([update('identity')])));
    deps.repository.commitTurn.mockResolvedValue({
      committed: true,
      stateVersion: 1,
      status: 'active',
      currentObjective: 'scope_of_work',
    });
    mocks.composeQuestion.mockRejectedValue(new Error('llm down'));

    await expect(service.submitTurn(params)).rejects.toThrow('llm down');
    expect(deps.chat.failTurn).toHaveBeenCalledWith(USER_MESSAGE_ID, PROCESSING_TOKEN);
  });
});

describe('OnboardingService.updateSlot', () => {
  let deps: Deps;
  let service: OnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = buildDeps();
    service = new OnboardingService(deps);
  });

  it('applies a manual correction through the CAS commit path', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot({ status: 'review', stateVersion: 7 }));
    deps.repository.commitTurn.mockResolvedValue({
      committed: true,
      stateVersion: 8,
      status: 'review',
      currentObjective: null,
    });

    const result = await service.updateSlot({
      userId: USER_ID,
      organizationId: ORG_ID,
      interviewId: INTERVIEW_ID,
      slotKey: 'identity',
      value: 'Pronit Das, platform engineer',
      status: 'answered',
    });

    expect(result.outcome).toBe('committed');
    const call = deps.repository.commitTurn.mock.calls[0][0];
    expect(call.expectedStateVersion).toBe(7);
    expect(call.updates).toHaveLength(1);
    expect(call.updates[0]).toMatchObject({
      slot: 'identity',
      status: 'answered',
      value: 'Pronit Das, platform engineer',
    });
    expect(mocks.extractTurn).not.toHaveBeenCalled();
  });

  it('does not carry a value when the user declines a slot', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot({ status: 'review' }));
    deps.repository.commitTurn.mockResolvedValue({
      committed: true,
      stateVersion: 2,
      status: 'review',
      currentObjective: null,
    });

    await service.updateSlot({
      userId: USER_ID,
      organizationId: ORG_ID,
      interviewId: INTERVIEW_ID,
      slotKey: 'never_surface',
      value: 'ignored',
      status: 'declined',
    });

    const call = deps.repository.commitTurn.mock.calls[0][0];
    expect(call.updates[0].value).toBeNull();
    expect(call.updates[0].evidence).toBeNull();
  });
});

describe('OnboardingService.completeInterview', () => {
  let deps: Deps;
  let service: OnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = buildDeps();
    service = new OnboardingService(deps);
  });

  it('assigns the recommended agents to the user', async () => {
    const answers = allAnswered();
    answers.scope_of_work = slot('answered', 'I own our React frontend and the design system');
    deps.repository.findActiveInterview.mockResolvedValue(
      snapshot({ status: 'review', slots: answers })
    );
    deps.repository.markStatus.mockResolvedValue(true);

    const result = await service.completeInterview(USER_ID, ORG_ID, INTERVIEW_ID, CANDIDATES);

    expect(result.outcome).toBe('completed');
    expect(deps.assignments.replaceProvisionalAssignments).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        source: 'onboarding',
        agentIds: expect.any(Array),
      })
    );
    const assigned = deps.assignments.replaceProvisionalAssignments.mock.calls[0][0].agentIds;
    expect(assigned.length).toBeGreaterThan(0);
  });

  it('refuses when the interview is not in review', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(snapshot({ status: 'active' }));

    const result = await service.completeInterview(USER_ID, ORG_ID, INTERVIEW_ID, CANDIDATES);

    expect(result.outcome).toBe('not_ready');
    expect(deps.assignments.replaceProvisionalAssignments).not.toHaveBeenCalled();
  });

  it('marks the user onboarded and persists the imprint', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(
      snapshot({ status: 'review', slots: allAnswered() })
    );
    deps.repository.markStatus.mockResolvedValue(true);

    await service.completeInterview(USER_ID, ORG_ID, INTERVIEW_ID, CANDIDATES);

    // Without this write, GET /onboarding-status keeps reporting isCompleted:false,
    // so every page reload re-launches the interview the user just finished.
    expect(deps.repository.markUserOnboarded).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        imprint: expect.objectContaining({ identity: expect.any(Object) }),
      })
    );
  });

  it('marks the user onboarded even when another writer completed the interview first', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(
      snapshot({ status: 'review', slots: allAnswered() })
    );
    deps.repository.markStatus.mockResolvedValue(false);

    await service.completeInterview(USER_ID, ORG_ID, INTERVIEW_ID, CANDIDATES);

    expect(deps.repository.markUserOnboarded).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when markStatus reports another writer already completed it', async () => {
    deps.repository.findActiveInterview.mockResolvedValue(
      snapshot({ status: 'review', slots: allAnswered() })
    );
    deps.repository.markStatus.mockResolvedValue(false);

    const result = await service.completeInterview(USER_ID, ORG_ID, INTERVIEW_ID, CANDIDATES);

    expect(result.outcome).toBe('completed');
  });

  it('surfaces an imprint validation failure instead of swallowing it', async () => {
    const broken = allAnswered();
    // A slot value of the wrong runtime type must not be quietly coerced.
    broken.identity = { ...broken.identity, value: 42 as unknown as string };
    deps.repository.findActiveInterview.mockResolvedValue(
      snapshot({ status: 'review', slots: broken })
    );

    await expect(
      service.completeInterview(USER_ID, ORG_ID, INTERVIEW_ID, CANDIDATES)
    ).rejects.toThrow();
    expect(deps.assignments.replaceProvisionalAssignments).not.toHaveBeenCalled();
  });
});

describe('OnboardingService.skipInterview', () => {
  it('abandons the interview from any in-flight status', async () => {
    const deps = buildDeps();
    deps.repository.markStatus.mockResolvedValue(true);
    const service = new OnboardingService(deps);

    const skipped = await service.skipInterview(USER_ID, ORG_ID, INTERVIEW_ID);

    expect(skipped).toBe(true);
    expect(deps.repository.markStatus).toHaveBeenCalledWith(
      expect.objectContaining({ from: ['active', 'paused', 'review'], to: 'abandoned' })
    );
  });

  it('settles the user so a skip is not a permanent lockout', async () => {
    const deps = buildDeps();
    deps.repository.markStatus.mockResolvedValue(true);
    const service = new OnboardingService(deps);

    await service.skipInterview(USER_ID, ORG_ID, INTERVIEW_ID);

    // Abandoning alone leaves GET /onboarding-status reporting isCompleted:false
    // while startInterview permanently refuses the terminal row — the user is
    // then shown onboarding forever and can never proceed through it.
    expect(deps.repository.markUserOnboarded).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORG_ID,
      imprint: null,
    });
  });

  it('settles the user even when another writer already abandoned the interview', async () => {
    const deps = buildDeps();
    deps.repository.markStatus.mockResolvedValue(false);
    const service = new OnboardingService(deps);

    await service.skipInterview(USER_ID, ORG_ID, INTERVIEW_ID);

    expect(deps.repository.markUserOnboarded).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingService.getStatus', () => {
  it('returns a null interview and an empty transcript when none exists', async () => {
    const deps = buildDeps();
    deps.repository.findActiveInterview.mockResolvedValue(null);
    const service = new OnboardingService(deps);

    const result = await service.getStatus(USER_ID, ORG_ID);

    expect(result.interview).toBeNull();
    expect(result.messages).toEqual([]);
    expect(deps.chat.loadHistory).not.toHaveBeenCalled();
  });

  it('loads the transcript for an existing interview', async () => {
    const deps = buildDeps();
    deps.repository.findActiveInterview.mockResolvedValue(snapshot());
    deps.chat.loadHistory.mockResolvedValue([{ id: 'm-1', role: 'assistant', content: 'Who are you?' }]);
    const service = new OnboardingService(deps);

    const result = await service.getStatus(USER_ID, ORG_ID);

    expect(result.interview?.id).toBe(INTERVIEW_ID);
    expect(result.messages).toHaveLength(1);
  });
});
