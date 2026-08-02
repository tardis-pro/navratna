import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMRequest, LLMResponse } from '@uaip/types';
import type { InterviewSlot, OnboardingSlot } from '../../onboarding/types';
import {
  ExtractionFailedError,
  composeQuestion,
  extractJsonBlock,
  extractTurn,
  setOnboardingLLMGateway,
} from '../../onboarding/extraction_service';
import type {
  ComposeQuestionParams,
  ExtractTurnParams,
} from '../../onboarding/extraction_service';

const mocks = vi.hoisted(() => ({
  userGenerate: vi.fn<(userId: string, request: LLMRequest) => Promise<LLMResponse>>(),
  platformGenerate:
    vi.fn<
      (request: LLMRequest, preferredType?: string, requestType?: string) => Promise<LLMResponse>
    >(),
}));

setOnboardingLLMGateway({
  generateForUser: (userId, request) => mocks.userGenerate(userId, request),
  generateOnPlatform: (request) => mocks.platformGenerate(request),
});

const DEFAULT_USER_MESSAGE = 'I am Pronit, a platform engineer based in Kolkata.';

function defaultSlot(): InterviewSlot {
  return {
    status: 'unanswered',
    value: null,
    evidenceMessageIds: [],
    confidence: null,
    attempts: 0,
    revision: 0,
  };
}

function emptySlotStates(): Record<OnboardingSlot, InterviewSlot> {
  return {
    identity: defaultSlot(),
    scope_of_work: defaultSlot(),
    communication: defaultSlot(),
    always_surface: defaultSlot(),
    never_surface: defaultSlot(),
    decision_style: defaultSlot(),
    approval_style: defaultSlot(),
    non_negotiables: defaultSlot(),
    vision: defaultSlot(),
    trust_kill: defaultSlot(),
  };
}

function validTurnPayload(): Record<string, unknown> {
  return {
    updates: [
      {
        slot: 'identity',
        status: 'answered',
        value: 'Pronit, platform engineer',
        evidence: 'I am Pronit, a platform engineer',
      },
    ],
    userIntent: 'answer',
    shouldClarify: false,
    clarificationReason: null,
  };
}

function fenced(payload: unknown): string {
  return `Here is the extraction:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

function llmSuccess(content: string, overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    content,
    model: 'test-model',
    provider: 'test-provider',
    tokensUsed: 42,
    ...overrides,
  };
}

function makeParams(overrides: Partial<ExtractTurnParams> = {}): ExtractTurnParams {
  return {
    userId: 'user-1',
    objective: 'identity',
    userMessage: DEFAULT_USER_MESSAGE,
    recentTranscript: [
      { role: 'assistant', content: 'Who are you and what do you do?' },
      { role: 'user', content: DEFAULT_USER_MESSAGE },
    ],
    slotStates: emptySlotStates(),
    sourceMessageId: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  };
}

function makeComposeParams(overrides: Partial<ComposeQuestionParams> = {}): ComposeQuestionParams {
  return {
    userId: 'user-1',
    objective: 'communication',
    recentTranscript: [{ role: 'user', content: 'I am Pronit.' }],
    acknowledgePrevious: true,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.userGenerate.mockReset();
  mocks.platformGenerate.mockReset();
});

describe('extractJsonBlock', () => {
  it('extractJsonBlock parses a json-fenced block', () => {
    const raw = 'Sure thing.\n```json\n{ "answer": 42 }\n```\nHope that helps.';

    const block = extractJsonBlock(raw);

    expect(block).not.toBeNull();
    expect(JSON.parse(block ?? '')).toEqual({ answer: 42 });
  });

  it('extractJsonBlock parses a bare fenced block', () => {
    const raw = 'Result below.\n```\n{ "answer": 42 }\n```';

    const block = extractJsonBlock(raw);

    expect(block).not.toBeNull();
    expect(JSON.parse(block ?? '')).toEqual({ answer: 42 });
  });

  it('extractJsonBlock parses a raw object embedded in prose', () => {
    const raw = 'Here is what I found {"answer": 42, "ok": true} — done.';

    const block = extractJsonBlock(raw);

    expect(block).not.toBeNull();
    expect(JSON.parse(block ?? '')).toEqual({ answer: 42, ok: true });
  });

  it('extractJsonBlock survives nested braces', () => {
    const payload =
      '{"outer": {"inner": {"value": 1}}, "note": "a closing } brace inside a string"}';
    const raw = `Certainly! ${payload} That is everything.`;

    const block = extractJsonBlock(raw);

    expect(block).not.toBeNull();
    expect(JSON.parse(block ?? '')).toEqual({
      outer: { inner: { value: 1 } },
      note: 'a closing } brace inside a string',
    });
  });

  it('extractJsonBlock returns null for unparseable output', () => {
    expect(extractJsonBlock('I could not produce any structured output, sorry.')).toBeNull();
  });
});

describe('extractTurn', () => {
  it('extractTurn falls back to the platform LLM when the user has no providers', async () => {
    mocks.userGenerate.mockRejectedValue(new Error('No LLM providers configured for user'));
    mocks.platformGenerate.mockResolvedValue(
      llmSuccess(fenced(validTurnPayload()), { provider: 'openai' })
    );

    const result = await extractTurn(makeParams());

    expect(mocks.userGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.platformGenerate).toHaveBeenCalledTimes(1);
    expect(result.updates).toHaveLength(1);
    expect(result.provider).toBe('openai');
  });

  it('extractTurn treats a resolved response carrying an error field as a failure', async () => {
    mocks.userGenerate.mockResolvedValue({ content: '', model: 'x', error: 'rate limited' });
    mocks.platformGenerate.mockResolvedValue(llmSuccess(fenced(validTurnPayload())));

    const result = await extractTurn(makeParams());

    expect(mocks.userGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.platformGenerate).toHaveBeenCalledTimes(1);
    expect(result.extraction.userIntent).toBe('answer');
  });

  it('extractTurn drops an answered update whose evidence is absent from the user message', async () => {
    const hallucinated = {
      ...validTurnPayload(),
      updates: [
        {
          slot: 'identity',
          status: 'answered',
          value: 'turtle enthusiast',
          evidence: 'I love turtles',
        },
      ],
    };
    mocks.userGenerate.mockResolvedValue(llmSuccess(fenced(hallucinated)));

    const result = await extractTurn(makeParams());

    expect(result.updates).toHaveLength(0);
    expect(result.rejectedUpdates).toEqual([
      { slot: 'identity', reason: 'evidence_not_found_in_user_message' },
    ]);
  });

  it('extractTurn keeps an answered update whose evidence differs only by whitespace and case', async () => {
    const wobbly = {
      ...validTurnPayload(),
      updates: [
        {
          slot: 'identity',
          status: 'answered',
          value: 'Pronit',
          evidence: 'i am PRONIT,   a platform\nengineer',
        },
      ],
    };
    mocks.userGenerate.mockResolvedValue(llmSuccess(fenced(wobbly)));

    const result = await extractTurn(makeParams());

    expect(result.rejectedUpdates).toHaveLength(0);
    expect(result.updates).toHaveLength(1);
  });

  it('extractTurn retries once with a repair prompt when the first response fails schema validation', async () => {
    const invalid = { ...validTurnPayload(), shouldClarify: true, clarificationReason: null };
    mocks.userGenerate
      .mockResolvedValueOnce(llmSuccess(fenced(invalid)))
      .mockResolvedValueOnce(llmSuccess(fenced(validTurnPayload())));

    const result = await extractTurn(makeParams());

    expect(mocks.userGenerate).toHaveBeenCalledTimes(2);
    const secondRequest = mocks.userGenerate.mock.calls[1][1];
    expect(secondRequest.prompt).toContain(
      'shouldClarify=true requires a non-empty clarificationReason'
    );
    expect(result.extraction.shouldClarify).toBe(false);
  });

  it('extractTurn throws ExtractionFailedError when both attempts fail validation', async () => {
    const invalid = { ...validTurnPayload(), shouldClarify: true, clarificationReason: null };
    mocks.userGenerate.mockResolvedValue(llmSuccess(fenced(invalid)));

    const outcome: unknown = await extractTurn(makeParams()).then(
      () => null,
      (error: unknown) => error
    );

    expect(outcome).toBeInstanceOf(ExtractionFailedError);
    if (!(outcome instanceof ExtractionFailedError)) {
      throw new Error('expected an ExtractionFailedError instance');
    }
    expect(outcome.code).toBe('ONBOARDING_EXTRACTION_FAILED');
  });

  it('extractTurn drops updates for unknown slot names', async () => {
    const payload = {
      updates: [
        {
          slot: 'favorite_color',
          status: 'answered',
          value: 'blue',
          evidence: 'I am Pronit',
        },
        {
          slot: 'identity',
          status: 'answered',
          value: 'Pronit',
          evidence: 'I am Pronit, a platform engineer',
        },
      ],
      userIntent: 'answer',
      shouldClarify: false,
      clarificationReason: null,
    };
    mocks.userGenerate.mockResolvedValue(llmSuccess(fenced(payload)));

    const result = await extractTurn(makeParams());

    expect(mocks.userGenerate).toHaveBeenCalledTimes(1);
    expect(result.rejectedUpdates).toEqual([{ slot: 'favorite_color', reason: 'unknown_slot' }]);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].slot).toBe('identity');
  });
});

describe('composeQuestion', () => {
  it('composeQuestion returns the trimmed model content', async () => {
    mocks.userGenerate.mockResolvedValue(
      llmSuccess('  How do you prefer to communicate day to day?  \n')
    );

    const question = await composeQuestion(makeComposeParams());

    expect(question).toBe('How do you prefer to communicate day to day?');
  });

  it('composeQuestion system prompt forbids the model from declaring completion', async () => {
    mocks.userGenerate.mockResolvedValue(llmSuccess('What is your role?'));

    await composeQuestion(makeComposeParams());

    expect(mocks.userGenerate).toHaveBeenCalledTimes(1);
    const request = mocks.userGenerate.mock.calls[0][1];
    expect(request.systemPrompt ?? '').toContain('declare the interview complete');
    expect(request.systemPrompt ?? '').toContain('SERVER-CONTROLLED OBJECTIVE');
  });
});
