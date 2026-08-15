import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * What this guards: the platform (the tardis provisioner) mints projects through
 * POST /api/v1/projects/provision and then had no way to read any of them back —
 * GET /api/v1/projects answered a flat 401 to a machine caller, because every
 * route on this collection was gated on a browser session. The provisioner has
 * no user to be.
 *
 * The three cases below are the whole contract, and the third is the one that
 * matters: a credential check that is never exercised with a WRONG credential is
 * indistinguishable from one that always passes. This codebase has already had
 * an isolation control that was configured and was theatre; a service door that
 * opens for any header value would be the next one.
 */

const SERVICE_TOKEN = 'p'.repeat(48);

const { authUser, listProjects, getProject } = vi.hoisted(() => ({
  authUser: { value: null as { id: string; role?: string } | null },
  listProjects: vi.fn(async () => ({ projects: [{ id: 'proj-1' }], total: 1 })),
  getProject: vi.fn(async () => ({ id: 'proj-1', name: 'demo' })),
}));

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
  process.env.PROJECT_PROVISION_TOKEN = 'p'.repeat(48);
});

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, message: string, public code?: string) {
      super(message);
    }
  },
}));

// withOptionalAuth attaches a session when there is one and refuses nobody, so
// the handler is the wall. The mock reproduces exactly that: it derives whatever
// `authUser` currently holds, including null.
vi.mock('@uaip/middleware', () => ({
  withOptionalAuth: (app: { derive: (fn: () => unknown) => unknown }) =>
    app.derive(() => ({ user: authUser.value })),
}));

vi.mock('@uaip/shared-services', () => ({
  ProjectManagementService: class ProjectManagementService {
    initialize = vi.fn(async () => undefined);
    listProjects = listProjects;
    getProject = getProject;
  },
  DatabaseService: { getInstance: () => ({}) },
  OAuthService: { getInstance: () => ({}) },
  PROJECT_INSTRUCTIONS_MAX: 10_000,
  readProjectChatSettings: vi.fn(() => ({})),
  writeProjectChatSettings: vi.fn(() => ({})),
}));

// Reached only through project_provision_elysia's module-level import; nothing
// in these tests touches the control database.
vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  getControlPool: () => ({ query: vi.fn() }),
}));

vi.mock('@uaip/infra/event_bus', () => ({
  EventBusService: { getInstance: () => ({}) },
}));

vi.mock('../../services/github_integration_service.js', () => ({
  GitHubIntegrationService: class GitHubIntegrationService {},
}));

vi.mock('../../services/audit_service.js', () => ({
  AuditService: class AuditService {},
}));

vi.mock('../../services/oauth_provider_service.js', () => ({
  OAuthProviderService: class OAuthProviderService {},
}));

const { registerProjectRoutes } = await import('../../http/projects_elysia.ts');

async function call(
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown }> {
  const response = await registerProjectRoutes().handle(
    new Request(`http://localhost${path}`, { headers })
  );
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: response.status, body };
}

describe('projects management routes — service credential', () => {
  beforeEach(() => {
    authUser.value = null;
    listProjects.mockClear();
    getProject.mockClear();
  });

  describe('GET /api/v1/projects', () => {
    it('refuses an unauthenticated call with the same 401 as before', async () => {
      const { status, body } = await call('/api/v1/projects');
      expect(status).toBe(401);
      expect(body).toEqual({ error: 'Authentication required' });
      expect(listProjects).not.toHaveBeenCalled();
    });

    it('accepts a valid service credential', async () => {
      const { status, body } = await call('/api/v1/projects', {
        'x-navratna-service-token': SERVICE_TOKEN,
      });
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true });
      expect(listProjects).toHaveBeenCalledTimes(1);
    });

    it('refuses an INVALID service token exactly like no credential at all', async () => {
      const { status, body } = await call('/api/v1/projects', {
        'x-navratna-service-token': 'q'.repeat(48),
      });
      expect(status).toBe(401);
      expect(body).toEqual({ error: 'Authentication required' });
      expect(listProjects).not.toHaveBeenCalled();
    });

    it('refuses a wrong-length token without a 500', async () => {
      // timingSafeEqual throws on a length mismatch, so a short token must be
      // rejected by the length check rather than surfacing as a server error.
      const { status } = await call('/api/v1/projects', {
        'x-navratna-service-token': 'short',
      });
      expect(status).toBe(401);
    });

    it('still admits an authenticated person', async () => {
      authUser.value = { id: 'user-1', role: 'user' };
      const { status } = await call('/api/v1/projects');
      expect(status).toBe(200);
    });
  });

  describe('GET /api/v1/projects/:projectId', () => {
    it('refuses an unauthenticated call', async () => {
      const { status, body } = await call('/api/v1/projects/proj-1');
      expect(status).toBe(401);
      expect(body).toEqual({ success: false, error: 'Authentication required' });
      expect(getProject).not.toHaveBeenCalled();
    });

    it('refuses an INVALID service token', async () => {
      const { status } = await call('/api/v1/projects/proj-1', {
        'x-navratna-service-token': 'q'.repeat(48),
      });
      expect(status).toBe(401);
      expect(getProject).not.toHaveBeenCalled();
    });

    it('accepts a valid service credential and looks the project up UNSCOPED', async () => {
      const { status } = await call('/api/v1/projects/proj-1', {
        'x-navratna-service-token': SERVICE_TOKEN,
      });
      expect(status).toBe(200);
      // undefined userId is what skips userCanAccessProject. It is the whole
      // difference between a service call and a person, and it is asserted here
      // so it cannot be quietly changed to a forged user id.
      expect(getProject).toHaveBeenCalledWith('proj-1', undefined);
    });

    it('still 404s a service call for a project that does not exist', async () => {
      // "No user" must not become "sees everything": the existence check runs for
      // a service call too, so a token cannot turn a bad id into a 200.
      getProject.mockResolvedValueOnce(null as never);
      const { status, body } = await call('/api/v1/projects/nope', {
        'x-navratna-service-token': SERVICE_TOKEN,
      });
      expect(status).toBe(404);
      expect(body).toEqual({ success: false, error: 'Project not found' });
    });

    it('keeps a person scoped to the projects they can access', async () => {
      authUser.value = { id: 'user-1', role: 'user' };
      await call('/api/v1/projects/proj-1');
      expect(getProject).toHaveBeenCalledWith('proj-1', 'user-1');
    });
  });
});
