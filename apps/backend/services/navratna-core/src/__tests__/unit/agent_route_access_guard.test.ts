import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

/**
 * Scoping GET /api/v1/agents is not enough on its own: a user who learns an
 * agent UUID from any other surface could still drive that agent through the
 * capability and memory routes, which took the id straight from the URL. These
 * tests pin that every per-agent route consults the same grant.
 *
 * Unassigned must be indistinguishable from missing (404, never 403) for the
 * same reason it is on GET /:agentId — a 403 confirms the agent exists.
 */

const authState = vi.hoisted(() => ({
  user: {
    id: 'user-uuid-1234',
    email: 'member@example.com',
    role: 'user',
    organizationId: 'org-uuid-1234',
  },
}));

const accessMocks = vi.hoisted(() => ({
  canAccessAgent: vi.fn(),
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
  return { ...actual, canAccessAgent: accessMocks.canAccessAgent };
});

import {
  registerAgentCapabilityRoutes,
  registerAgentMemoryRoutes,
} from '@uaip/agent-intelligence-core';

const AGENT_ID = 'aaaaaaa1-0000-4000-8000-000000000005';
const CONCEPT_ID = 'ccccccc1-0000-4000-8000-000000000009';

const capabilityMocks = {
  getAgent: vi.fn(),
  analyzeContext: vi.fn(),
  generateExecutionPlan: vi.fn(),
  learnFromOperation: vi.fn(),
};
const discoveryMocks = { getAgentCapabilities: vi.fn() };
const memoryMocks = {
  pruneMemory: vi.fn(),
  reinforceConcept: vi.fn(),
  downvoteMemory: vi.fn(),
};

function capabilityApp() {
  return new Elysia().use(
    registerAgentCapabilityRoutes(capabilityMocks as never, discoveryMocks as never)
  );
}

function memoryApp() {
  return new Elysia().use(registerAgentMemoryRoutes(memoryMocks as never));
}

function send(app: Elysia, method: string, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = {
    id: 'user-uuid-1234',
    email: 'member@example.com',
    role: 'user',
    organizationId: 'org-uuid-1234',
  };
  capabilityMocks.getAgent.mockResolvedValue({ id: AGENT_ID, name: 'Hidden' });
  discoveryMocks.getAgentCapabilities.mockResolvedValue(['x']);
  capabilityMocks.analyzeContext.mockResolvedValue({ ok: true });
  capabilityMocks.generateExecutionPlan.mockResolvedValue({ ok: true });
  capabilityMocks.learnFromOperation.mockResolvedValue({ ok: true });
  memoryMocks.pruneMemory.mockResolvedValue(undefined);
  memoryMocks.reinforceConcept.mockResolvedValue(undefined);
  memoryMocks.downvoteMemory.mockResolvedValue(undefined);
});

describe('agent capability routes deny unassigned agents', () => {
  const cases: [string, string, unknown][] = [
    ['GET', `/api/v1/agents/${AGENT_ID}/capabilities`, undefined],
    ['POST', `/api/v1/agents/${AGENT_ID}/analyze`, { input: 'hello' }],
    ['POST', `/api/v1/agents/${AGENT_ID}/plan`, { analysis: {} }],
    ['POST', `/api/v1/agents/${AGENT_ID}/learn`, { operationId: 'op-1' }],
  ];

  for (const [method, path, body] of cases) {
    it(`${method} ${path.replace(AGENT_ID, ':agentId')} returns 404 without a grant`, async () => {
      accessMocks.canAccessAgent.mockResolvedValue(false);

      const res = await send(capabilityApp(), method, path, body);

      expect(res.status).toBe(404);
      expect(accessMocks.canAccessAgent).toHaveBeenCalledWith(
        { userId: 'user-uuid-1234', organizationId: 'org-uuid-1234', role: 'user' },
        AGENT_ID
      );
    });

    it(`${method} ${path.replace(AGENT_ID, ':agentId')} never reaches the service without a grant`, async () => {
      accessMocks.canAccessAgent.mockResolvedValue(false);

      await send(capabilityApp(), method, path, body);

      expect(discoveryMocks.getAgentCapabilities).not.toHaveBeenCalled();
      expect(capabilityMocks.analyzeContext).not.toHaveBeenCalled();
      expect(capabilityMocks.generateExecutionPlan).not.toHaveBeenCalled();
      expect(capabilityMocks.learnFromOperation).not.toHaveBeenCalled();
    });
  }

  it('allows the call once a grant exists', async () => {
    accessMocks.canAccessAgent.mockResolvedValue(true);

    const res = await send(capabilityApp(), 'GET', `/api/v1/agents/${AGENT_ID}/capabilities`);

    expect(res.status).toBe(200);
    expect(discoveryMocks.getAgentCapabilities).toHaveBeenCalledWith(AGENT_ID);
  });
});

describe('agent memory routes deny unassigned agents', () => {
  const path = `/api/v1/agents/${AGENT_ID}/memory/semantic/${CONCEPT_ID}`;

  it('DELETE returns 404 without a grant and never prunes', async () => {
    accessMocks.canAccessAgent.mockResolvedValue(false);

    const res = await send(memoryApp(), 'DELETE', path);

    expect(res.status).toBe(404);
    expect(memoryMocks.pruneMemory).not.toHaveBeenCalled();
  });

  it('PATCH returns 404 without a grant and never mutates', async () => {
    accessMocks.canAccessAgent.mockResolvedValue(false);

    const res = await send(memoryApp(), 'PATCH', path, { action: 'reinforce' });

    expect(res.status).toBe(404);
    expect(memoryMocks.reinforceConcept).not.toHaveBeenCalled();
    expect(memoryMocks.downvoteMemory).not.toHaveBeenCalled();
  });

  it('allows the mutation once a grant exists', async () => {
    accessMocks.canAccessAgent.mockResolvedValue(true);

    const res = await send(memoryApp(), 'DELETE', path);

    expect(res.status).toBe(200);
    expect(memoryMocks.pruneMemory).toHaveBeenCalledWith(AGENT_ID, CONCEPT_ID);
  });
});
