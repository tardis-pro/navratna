import { describe, it, expect, vi } from 'vitest';
import { GitHubAppInstallationRepository } from '../../services/execution_mesh/github_app_installation_repository.js';

const NOW = new Date().toISOString();
const BASE_ROW = {
  id: 'b1000000-0000-0000-0000-000000000001',
  installationId: '98765432',
  accountLogin: 'acme-corp',
  userId: 'u1000000-0000-0000-0000-000000000001',
  tenantId: 'tenant-1',
  projectId: 'proj-1',
  repositoryId: '111222333',
  repositoryFullName: 'acme/my-repo',
  active: true,
  createdAt: new Date(NOW),
  updatedAt: new Date(NOW),
};

const BASE_PARAMS = {
  bindingId: BASE_ROW.id,
  userId: BASE_ROW.userId,
  tenantId: BASE_ROW.tenantId,
  projectId: BASE_ROW.projectId,
  repositoryId: BASE_ROW.repositoryId,
};

function makeRepo(row: typeof BASE_ROW | null): GitHubAppInstallationRepository {
  const mockSelect = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(row ? [row] : []),
  };
  const db = { select: vi.fn(() => mockSelect) };
  return new GitHubAppInstallationRepository(db as never);
}

describe('GitHubAppInstallationRepository', () => {
  it('returns binding for matching row', async () => {
    const repo = makeRepo(BASE_ROW);
    const result = await repo.findScopedBinding(BASE_PARAMS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.installationId).toBe(BASE_ROW.installationId);
      expect(result.value.repositoryFullName).toBe(BASE_ROW.repositoryFullName);
    }
  });

  it('returns BINDING_NOT_FOUND when no rows', async () => {
    const repo = makeRepo(null);
    const result = await repo.findScopedBinding(BASE_PARAMS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BINDING_NOT_FOUND');
  });

  it('returns BINDING_INACTIVE for inactive binding', async () => {
    const repo = makeRepo({ ...BASE_ROW, active: false });
    const result = await repo.findScopedBinding(BASE_PARAMS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BINDING_INACTIVE');
  });

  it('returns BINDING_OWNER_MISMATCH for wrong userId', async () => {
    const repo = makeRepo({ ...BASE_ROW, userId: 'u2000000-0000-0000-0000-000000000002' });
    const result = await repo.findScopedBinding(BASE_PARAMS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BINDING_OWNER_MISMATCH');
  });

  it('returns BINDING_OWNER_MISMATCH for wrong tenantId', async () => {
    const repo = makeRepo({ ...BASE_ROW, tenantId: 'other-tenant' });
    const result = await repo.findScopedBinding(BASE_PARAMS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BINDING_OWNER_MISMATCH');
  });

  it('returns BINDING_OWNER_MISMATCH for wrong projectId', async () => {
    const repo = makeRepo({ ...BASE_ROW, projectId: 'other-project' });
    const result = await repo.findScopedBinding(BASE_PARAMS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BINDING_OWNER_MISMATCH');
  });

  it('returns BINDING_OWNER_MISMATCH for wrong repositoryId', async () => {
    const repo = makeRepo({ ...BASE_ROW, repositoryId: '999888777' });
    const result = await repo.findScopedBinding(BASE_PARAMS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BINDING_OWNER_MISMATCH');
  });

  it('returns DB_ERROR for invalid repositoryFullName', async () => {
    const repo = makeRepo({ ...BASE_ROW, repositoryFullName: '../../../etc/passwd' });
    const result = await repo.findScopedBinding(BASE_PARAMS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DB_ERROR');
  });

  it('cross-tenant: same bindingId different tenant is rejected before GitHub call', async () => {
    const repo = makeRepo(BASE_ROW);
    const result = await repo.findScopedBinding({ ...BASE_PARAMS, tenantId: 'attacker-tenant' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BINDING_OWNER_MISMATCH');
  });
});
