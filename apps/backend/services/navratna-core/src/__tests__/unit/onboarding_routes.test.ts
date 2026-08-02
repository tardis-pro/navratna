import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

/**
 * HTTP contract for the conversational onboarding interview.
 *
 * The route layer owns exactly two things the service cannot: mapping service
 * outcomes to status codes, and loading the agent roster the service scores
 * against. Everything else is delegated, so these tests assert delegation and
 * status mapping rather than interview behaviour.
 */

const authState = vi.hoisted(() => ({
  user: {
    id: 'user-uuid-1234',
    email: 'member@example.com',
    role: 'user',
    organizationId: 'org-uuid-1234',
  },
}));

const serviceMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  startInterview: vi.fn(),
  submitTurn: vi.fn(),
  updateSlot: vi.fn(),
  completeInterview: vi.fn(),
  skipInterview: vi.fn(),
}));

vi.mock('@uaip/middleware', () => {
  const passthrough = (app: Elysia) => app.derive(() => ({ user: authState.user }));
  return {
    withRequiredAuth: passthrough,
    withOptionalAuth: passthrough,
    withAdminGuard: passthrough,
    withNginxAuth: passthrough,
    attachAuth: passthrough,
    getNginxUser: () => authState.user,
    requireAuth: (app: Elysia) => app,
  };
});

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  isRecord: (val: unknown) => typeof val === 'object' && val !== null && !Array.isArray(val),
}));

vi.mock('@uaip/shared-services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/shared-services')>();
  class MockOnboardingService {
    getStatus = serviceMocks.getStatus;
    startInterview = serviceMocks.startInterview;
    submitTurn = serviceMocks.submitTurn;
    updateSlot = serviceMocks.updateSlot;
    completeInterview = serviceMocks.completeInterview;
    skipInterview = serviceMocks.skipInterview;
  }
  class MockOnboardingInterviewRepository {}
  class MockUserAgentAssignmentRepository {}
  class MockAgentChatPersistenceService {}
  return {
    ...actual,
    OnboardingService: MockOnboardingService,
    OnboardingInterviewRepository: MockOnboardingInterviewRepository,
    UserAgentAssignmentRepository: MockUserAgentAssignmentRepository,
    AgentChatPersistenceService: MockAgentChatPersistenceService,
  };
});

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  getIntelligenceDb: vi.fn(),
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  ne: vi.fn((col, val) => ({ col, val, op: 'ne' })),
  or: vi.fn((...args) => ({ args, op: 'or' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  inArray: vi.fn((col, vals) => ({ col, vals, op: 'inArray' })),
}));

vi.mock('@uaip/shared-services/drizzle/intelligence', () => ({
  agents: {
    id: 'id',
    name: 'name',
    isActive: 'isActive',
    capabilities: 'capabilities',
    role: 'role',
    organizationId: 'organizationId',
  },
}));

import { registerOnboardingRoutes } from '@uaip/agent-intelligence-core';
import { getIntelligenceDb } from '@uaip/shared-services/drizzle/clients';
import { ADMIN_ORG_ID, ONBOARDING_SLOTS } from '@uaip/shared-services';

const INTERVIEW_ID = '33333333-3333-4333-8333-333333333333';

function buildApp() {
  return new Elysia().use(registerOnboardingRoutes());
}

function slots() {
  const map: Record<string, unknown> = {};
  for (const key of ONBOARDING_SLOTS) {
    map[key] = { status: 'unanswered', value: null, confidence: null, revision: 0 };
  }
  return map;
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: INTERVIEW_ID,
    userId: authState.user.id,
    organizationId: authState.user.organizationId,
    guideAgentId: '77777777-7777-4777-8777-777777777777',
    status: 'active',
    currentObjective: 'identity',
    turnCount: 0,
    stateVersion: 0,
    slots: slots(),
    ...overrides,
  };
}

let candidateWhereArg: unknown = null;

function mockAgentCandidates(rows: Record<string, unknown>[]) {
  candidateWhereArg = null;
  vi.mocked(getIntelligenceDb).mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn((predicate: unknown) => {
          candidateWhereArg = predicate;
          return Promise.resolve(rows);
        }),
      }),
    }),
  } as never);
}

async function post(app: Elysia, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

describe('GET /api/v1/onboarding/interview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a null interview and empty slots when none exists', async () => {
    serviceMocks.getStatus.mockResolvedValue({ interview: null, messages: [] });

    const res = await buildApp().handle(
      new Request('http://localhost/api/v1/onboarding/interview')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.interview).toBeNull();
    expect(body.data.messages).toEqual([]);
  });

  it('splits the snapshot into interview and slots for the client', async () => {
    serviceMocks.getStatus.mockResolvedValue({
      interview: snapshot(),
      messages: [
        { id: 'm-1', role: 'assistant', content: 'Who are you?', createdAt: new Date('2026-08-02') },
      ],
    });

    const res = await buildApp().handle(
      new Request('http://localhost/api/v1/onboarding/interview')
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.interview.id).toBe(INTERVIEW_ID);
    expect(body.data.interview.slots).toBeUndefined();
    expect(Object.keys(body.data.slots)).toHaveLength(ONBOARDING_SLOTS.length);
    expect(body.data.messages[0].content).toBe('Who are you?');
  });

  it('scopes the lookup to the authenticated user, never a query parameter', async () => {
    serviceMocks.getStatus.mockResolvedValue({ interview: null, messages: [] });

    await buildApp().handle(
      new Request('http://localhost/api/v1/onboarding/interview?userId=someone-else')
    );

    expect(serviceMocks.getStatus).toHaveBeenCalledWith(
      authState.user.id,
      authState.user.organizationId
    );
  });
});

describe('POST /api/v1/onboarding/interview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts an interview and returns its opening transcript', async () => {
    serviceMocks.startInterview.mockResolvedValue({
      outcome: 'started',
      interview: snapshot(),
      messages: [{ id: 'm-1', role: 'assistant', content: 'Who are you?', createdAt: new Date() }],
    });

    const res = await post(buildApp(), '/api/v1/onboarding/interview');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.interview.currentObjective).toBe('identity');
    expect(body.data.messages).toHaveLength(1);
  });

  it('refuses with 409 when the interview is already finished', async () => {
    serviceMocks.startInterview.mockResolvedValue({
      outcome: 'already_finished',
      status: 'completed',
    });

    const res = await post(buildApp(), '/api/v1/onboarding/interview');
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('ONBOARDING_ALREADY_FINISHED');
  });
});

describe('POST /api/v1/onboarding/interview/turns', () => {
  const turnBody = {
    message: 'I am Pronit, a platform engineer',
    clientTurnId: '88888888-8888-4888-8888-888888888888',
    expectedStateVersion: 0,
  };

  beforeEach(() => vi.clearAllMocks());

  it('returns the reply and updated slots on a committed turn', async () => {
    serviceMocks.submitTurn.mockResolvedValue({
      outcome: 'committed',
      reply: 'And what do you manage?',
      interview: snapshot({ stateVersion: 1, currentObjective: 'scope_of_work' }),
    });

    const res = await post(buildApp(), '/api/v1/onboarding/interview/turns', turnBody);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.reply.content).toBe('And what do you manage?');
    expect(body.data.interview.stateVersion).toBe(1);
    expect(Object.keys(body.data.slots)).toHaveLength(ONBOARDING_SLOTS.length);
  });

  it('forwards the client turn id and expected state version untouched', async () => {
    serviceMocks.submitTurn.mockResolvedValue({
      outcome: 'committed',
      reply: 'next',
      interview: snapshot(),
    });

    await post(buildApp(), '/api/v1/onboarding/interview/turns', {
      ...turnBody,
      expectedStateVersion: 7,
    });

    expect(serviceMocks.submitTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        clientTurnId: turnBody.clientTurnId,
        expectedStateVersion: 7,
      })
    );
  });

  it('maps a CAS conflict to 409 ONBOARDING_STATE_CONFLICT', async () => {
    serviceMocks.submitTurn.mockResolvedValue({ outcome: 'conflict' });

    const res = await post(buildApp(), '/api/v1/onboarding/interview/turns', turnBody);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toBe('ONBOARDING_STATE_CONFLICT');
  });

  it('maps a missing interview to 404', async () => {
    serviceMocks.submitTurn.mockResolvedValue({ outcome: 'not_found' });

    const res = await post(buildApp(), '/api/v1/onboarding/interview/turns', turnBody);

    expect(res.status).toBe(404);
  });

  it('maps an in-flight duplicate to 202 rather than a duplicate generation', async () => {
    serviceMocks.submitTurn.mockResolvedValue({ outcome: 'processing' });

    const res = await post(buildApp(), '/api/v1/onboarding/interview/turns', turnBody);

    expect(res.status).toBe(202);
  });

  it('maps an extraction failure to 503 so the client can retry the same turn', async () => {
    serviceMocks.submitTurn.mockResolvedValue({ outcome: 'extraction_failed' });

    const res = await post(buildApp(), '/api/v1/onboarding/interview/turns', turnBody);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe('ONBOARDING_EXTRACTION_FAILED');
  });

  it('returns a replayed turn as a normal 200', async () => {
    serviceMocks.submitTurn.mockResolvedValue({
      outcome: 'replayed',
      reply: 'stored reply',
      interview: snapshot(),
    });

    const res = await post(buildApp(), '/api/v1/onboarding/interview/turns', turnBody);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.reply.content).toBe('stored reply');
  });
});

describe('PUT /api/v1/onboarding/interview/slots/:slotKey', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies a review-screen correction', async () => {
    serviceMocks.updateSlot.mockResolvedValue({
      outcome: 'committed',
      interview: snapshot({ status: 'review', stateVersion: 11 }),
    });

    const res = await buildApp().handle(
      new Request('http://localhost/api/v1/onboarding/interview/slots/identity', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'Pronit Das', status: 'answered' }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(serviceMocks.updateSlot).toHaveBeenCalledWith(
      expect.objectContaining({ slotKey: 'identity', value: 'Pronit Das', status: 'answered' })
    );
    expect(body.data.slots).toBeDefined();
  });

  it('rejects a slot key that is not one of the ten', async () => {
    const res = await buildApp().handle(
      new Request('http://localhost/api/v1/onboarding/interview/slots/not_a_slot', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'x', status: 'answered' }),
      })
    );

    expect(res.status).toBe(400);
    expect(serviceMocks.updateSlot).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/onboarding/interview/complete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the active agent roster and returns the provisioned agents', async () => {
    mockAgentCandidates([
      {
        id: 'a-1',
        name: 'Josh',
        capabilities: ['frontend-development'],
        role: 'EXECUTOR',
        organizationId: authState.user.organizationId,
      },
    ]);
    serviceMocks.completeInterview.mockResolvedValue({
      outcome: 'completed',
      imprint: { identity: { name: null, role: null, timezone: null, communicationStyle: null } },
      provisionedAgents: [
        {
          agentId: 'a-1',
          agentName: 'Josh',
          score: 3,
          matchedCapabilities: ['frontend-development'],
          rationale: 'frontend, ui/ux',
        },
      ],
    });

    const res = await post(buildApp(), '/api/v1/onboarding/interview/complete');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.provisionedAgents).toHaveLength(1);
    expect(body.data.provisionedAgents[0].name).toBe('Josh');
    expect(body.data.provisionedAgents[0].rationale).toBe('frontend, ui/ux');

    const candidates = serviceMocks.completeInterview.mock.calls[0][3];
    expect(candidates).toEqual([
      { id: 'a-1', name: 'Josh', capabilities: ['frontend-development'], role: 'EXECUTOR' },
    ]);
  });

  it('never offers agents from another tenant as candidates', async () => {
    mockAgentCandidates([]);
    serviceMocks.completeInterview.mockResolvedValue({ outcome: 'not_ready' });

    await post(buildApp(), '/api/v1/onboarding/interview/complete');

    expect(candidateWhereArg).not.toBeNull();
    expect(JSON.stringify(candidateWhereArg)).toContain(authState.user.organizationId);
  });

  it('offers platform agents to a tenant that owns none of its own', async () => {
    mockAgentCandidates([
      {
        id: 'a-1',
        name: 'Josh',
        capabilities: ['frontend-development'],
        role: 'EXECUTOR',
        organizationId: ADMIN_ORG_ID,
      },
    ]);
    serviceMocks.completeInterview.mockResolvedValue({ outcome: 'not_ready' });

    await post(buildApp(), '/api/v1/onboarding/interview/complete');

    // Every seeded agent lives in the admin org, so a strict org-equality
    // filter would provision NOBODY for a fresh tenant.
    const candidates = serviceMocks.completeInterview.mock.calls[0][3];
    expect(candidates.map((c: { id: string }) => c.id)).toEqual(['a-1']);
  });

  it('drops a third tenant\'s private agent even when the query returns it', async () => {
    mockAgentCandidates([
      {
        id: 'a-9',
        name: 'Intruder',
        capabilities: ['frontend-development'],
        role: 'EXECUTOR',
        organizationId: 'org-uuid-9999',
      },
    ]);
    serviceMocks.completeInterview.mockResolvedValue({ outcome: 'not_ready' });

    await post(buildApp(), '/api/v1/onboarding/interview/complete');

    const candidates = serviceMocks.completeInterview.mock.calls[0][3];
    expect(candidates).toEqual([]);
  });

  it('maps a not-ready interview to 409', async () => {
    mockAgentCandidates([]);
    serviceMocks.completeInterview.mockResolvedValue({ outcome: 'not_ready' });

    const res = await post(buildApp(), '/api/v1/onboarding/interview/complete');
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('ONBOARDING_NOT_READY');
  });
});

describe('POST /api/v1/onboarding/interview/skip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('abandons the interview', async () => {
    serviceMocks.skipInterview.mockResolvedValue(true);

    const res = await post(buildApp(), '/api/v1/onboarding/interview/skip');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('still succeeds when there was nothing to abandon', async () => {
    serviceMocks.skipInterview.mockResolvedValue(false);

    const res = await post(buildApp(), '/api/v1/onboarding/interview/skip');

    expect(res.status).toBe(200);
  });
});
