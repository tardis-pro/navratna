import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Elysia } from 'elysia';

vi.mock('@uaip/middleware', () => {
  const mockUser = { id: 'user-uuid-1234', email: 'test@example.com', role: 'user' };
  const passthrough = (app: Elysia) => app.derive(() => ({ user: mockUser }));
  return {
    withRequiredAuth: passthrough,
    withOptionalAuth: passthrough,
    attachAuth: passthrough,
    requireAuth: (app: Elysia) => app,
  };
});

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
  },
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
  },
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, msg: string, public code?: string) { super(msg); }
  },
}));

vi.mock('@uaip/shared-services', () => ({
  getIntelligenceDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'ki-uuid-1' }]),
      })),
    })),
  })),
  knowledgeItems: {},
  ServiceFactory: {
    getInstance: vi.fn(() => ({
      getToolGraphDatabase: vi.fn().mockResolvedValue({
        runQuery: vi.fn().mockResolvedValue({}),
      }),
    })),
  },
}));

vi.mock('@uaip/types', () => ({
  KnowledgeType: { REPO_CONTEXT: 'repo_context' },
  SourceType: { GIT_REPOSITORY: 'git_repository', FILE_SYSTEM: 'file_system' },
}));

vi.mock('../../services/repo_ingestion_service.js', () => ({
  RepoIngestionService: vi.fn().mockImplementation(() => ({
    ingest: vi.fn(),
  })),
}));

import { registerKnowledgeIngestRoutes } from '../../routes/knowledge_ingest_routes.js';
import { RepoIngestionService } from '../../services/repo_ingestion_service.js';

function buildApp() {
  return new Elysia().use(registerKnowledgeIngestRoutes());
}

function authHeader() {
  return { Authorization: 'Bearer test-token' };
}

describe('Knowledge Ingest Routes', () => {
  let mockIngest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIngest = vi.fn();
    vi.mocked(RepoIngestionService).mockImplementation(() => ({
      ingest: mockIngest,
    }) as never);
  });

  describe('POST /api/v1/knowledge/ingest', () => {
    it('returns 400 when source is missing', async () => {
      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/knowledge/ingest', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('source must be a non-empty string');
    });

    it('returns 400 when source is empty string', async () => {
      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/knowledge/ingest', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: '   ' }),
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns success when ingest completes', async () => {
      const repoContext = { id: 'repo-ctx-1', source: '/some/path', repoMode: 'brownfield' };
      mockIngest.mockResolvedValue(repoContext);

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/knowledge/ingest', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: '/some/path' }),
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ id: 'repo-ctx-1', repoMode: 'brownfield' });
    });

    it('returns 400 for client input errors (invalid path)', async () => {
      mockIngest.mockRejectedValue(new Error('Invalid source: local path does not exist (/bad/path)'));

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/knowledge/ingest', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: '/bad/path' }),
        })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 500 for server-side errors', async () => {
      mockIngest.mockRejectedValue(new Error('Internal processing error'));

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/knowledge/ingest', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: '/valid/path' }),
        })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 400 for git clone host resolution errors', async () => {
      mockIngest.mockRejectedValue(new Error('could not resolve host: fake.example.com'));

      const app = buildApp();
      const res = await app.handle(
        new Request('http://localhost/api/v1/knowledge/ingest', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'https://fake.example.com/repo.git' }),
        })
      );
      expect(res.status).toBe(400);
    });
  });
});
