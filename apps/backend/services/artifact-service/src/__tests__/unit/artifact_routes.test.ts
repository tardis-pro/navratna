import { describe, it, expect, vi } from 'vitest';
import Elysia from 'elysia';
import type { UserContext } from '@uaip/types';

const authenticatedUser: UserContext = {
  id: '3b0923f1-d14f-4d43-9878-831dd4c800b4',
  email: 'test@example.com',
  role: 'admin',
  organizationId: '3b0923f1-d14f-4d43-9878-831dd4c800b6',
};

vi.mock('@uaip/middleware', () => ({
  withNginxAuth: (app: Elysia) =>
    app
      .derive(({ headers }) => ({
        user: headers['x-test-unauthed'] === 'true' ? null : authenticatedUser,
      }))
      .guard({
        beforeHandle(context) {
          const user = 'user' in context ? context['user'] : null;
          if (user) return;
          context.set.status = 401;
          return { error: 'Authentication required', code: 'AUTH_REQUIRED' };
        },
      }),
}));
import { DatabaseService } from '@uaip/shared-services';
import { registerArtifactRoutes } from '../../routes/artifact_routes.js';

describe('Artifact Routes - GET /api/v1/artifacts', () => {
  const mockArtifacts = [
    {
      id: 'art-1',
      title: 'PRD Doc',
      type: 'prd',
      conversationId: 'disc-100',
    },
    {
      id: 'art-2',
      title: 'Code File',
      type: 'code',
      conversationId: 'disc-100',
    },
  ];

  const mockArtifactRepo = {
    findByConversationId: vi.fn(async (convId: string) => {
      return mockArtifacts.filter((a) => a.conversationId === convId);
    }),
    findMany: vi.fn(async ({ limit, offset, type }: Parameters<ReturnType<DatabaseService['getArtifactRepository']>['findMany']>[0]) => {
      let res = mockArtifacts;
      if (type) {
        res = res.filter((a) => a.type.includes(type));
      }
      return res.slice(offset ?? 0, (offset ?? 0) + (limit ?? 50));
    }),
    count: vi.fn(async () => mockArtifacts.length),
  };

  const databaseService = Object.assign(Object.create(DatabaseService.prototype), {
    getArtifactRepository: () => mockArtifactRepo,
  });
  vi.spyOn(DatabaseService, 'getInstance').mockReturnValue(databaseService);

  const mockArtifactService = {
    generateArtifact: vi.fn(),
    generateAndPersistArtifact: vi.fn(),
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    validateArtifact: vi.fn(),
    getServiceHealth: vi.fn(),
  } satisfies Pick<
    import('../../artifact_service.js').ArtifactService,
    'generateArtifact' | 'generateAndPersistArtifact' | 'listTemplates' | 'getTemplate' | 'validateArtifact' | 'getServiceHealth'
  >;
  const testApp = new Elysia().use(registerArtifactRoutes(mockArtifactService));

  it('requires authentication for GET /api/v1/artifacts', async () => {
    const res = await testApp.handle(
      new Request('http://localhost/api/v1/artifacts', {
        headers: { 'x-test-unauthed': 'true' },
      })
    );
    expect(res.status).toBe(401);
  });

  it('filters artifacts by discussionId using findByConversationId', async () => {
    const res = await testApp.handle(
      new Request('http://localhost/api/v1/artifacts?discussionId=disc-100')
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[]; total: number };
    expect(body.success).toBe(true);
    expect(mockArtifactRepo.findByConversationId).toHaveBeenCalledWith('disc-100');
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it('filters artifacts by conversationId alias using findByConversationId', async () => {
    const res = await testApp.handle(
      new Request('http://localhost/api/v1/artifacts?conversationId=disc-100')
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[]; total: number };
    expect(body.success).toBe(true);
    expect(mockArtifactRepo.findByConversationId).toHaveBeenCalledWith('disc-100');
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it('filters by discussionId and type with in-memory pagination', async () => {
    const res = await testApp.handle(
      new Request('http://localhost/api/v1/artifacts?discussionId=disc-100&type=prd')
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { type: string }[]; total: number };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].type).toBe('prd');
    expect(body.total).toBe(1);
  });

  it('preserves findMany pagination when no discussionId or conversationId is specified', async () => {
    const res = await testApp.handle(
      new Request('http://localhost/api/v1/artifacts?limit=10&offset=0')
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[]; total: number };
    expect(body.success).toBe(true);
    expect(mockArtifactRepo.findMany).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    expect(body.total).toBe(2);
  });
});
