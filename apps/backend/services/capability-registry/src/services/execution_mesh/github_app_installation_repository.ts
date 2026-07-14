import { eq } from '@uaip/shared-services';
import type { ControlDB } from '@uaip/shared-services';
import { githubAppInstallations } from '@uaip/shared-services';
import type { GitHubAppInstallationRow } from '@uaip/shared-services';
import type { InstallationBinding } from './github_app_token_broker.js';

export type { GitHubAppInstallationRow };

export type BindingLookupError =
  | { code: 'BINDING_NOT_FOUND' }
  | { code: 'BINDING_INACTIVE' }
  | { code: 'BINDING_OWNER_MISMATCH'; field: string }
  | { code: 'DB_ERROR'; message: string };

export type BindingResult<T> = { ok: true; value: T } | { ok: false; error: BindingLookupError };

export type BindingLookupParams = {
  bindingId: string;
  userId: string;
  tenantId: string;
  projectId: string;
  repositoryId: string;
};

export type CreateBindingParams = {
  installationId: string;
  accountLogin: string;
  userId: string;
  tenantId: string;
  projectId: string;
  repositoryId: string;
  repositoryFullName: string;
};

export class GitHubAppInstallationRepository {
  constructor(
    private readonly db: ControlDB,
  ) {}

  async createVerifiedBinding(params: CreateBindingParams): Promise<BindingResult<GitHubAppInstallationRow>> {
    try {
      const rows = await this.db
        .insert(githubAppInstallations)
        .values({ ...params, active: true })
        .returning();
      const row = rows[0];
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Binding insert returned no row' } };
      return { ok: true, value: row };
    } catch (error) {
      return { ok: false, error: { code: 'DB_ERROR', message: error instanceof Error ? error.message : String(error) } };
    }
  }

  async findScopedBinding(params: BindingLookupParams): Promise<BindingResult<InstallationBinding>> {
    const { bindingId, userId, tenantId, projectId, repositoryId } = params;

    let row: GitHubAppInstallationRow | undefined;
    try {
      const rows = await this.db
        .select()
        .from(githubAppInstallations)
        .where(eq(githubAppInstallations.id, bindingId))
        .limit(1);
      row = rows[0];
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: err instanceof Error ? err.message : String(err) } };
    }

    if (row === undefined) {
      return { ok: false, error: { code: 'BINDING_NOT_FOUND' } };
    }

    if (!row.active) {
      return { ok: false, error: { code: 'BINDING_INACTIVE' } };
    }

    if (row.userId !== userId) {
      return { ok: false, error: { code: 'BINDING_OWNER_MISMATCH', field: 'userId' } };
    }

    if (row.tenantId !== tenantId) {
      return { ok: false, error: { code: 'BINDING_OWNER_MISMATCH', field: 'tenantId' } };
    }

    if (row.projectId !== projectId) {
      return { ok: false, error: { code: 'BINDING_OWNER_MISMATCH', field: 'projectId' } };
    }

    if (row.repositoryId !== repositoryId) {
      return { ok: false, error: { code: 'BINDING_OWNER_MISMATCH', field: 'repositoryId' } };
    }

    const REPO_FULL_NAME_RE = /^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/;
    if (!REPO_FULL_NAME_RE.test(row.repositoryFullName)) {
      return { ok: false, error: { code: 'DB_ERROR', message: 'Binding has invalid repositoryFullName in database' } };
    }

    return {
      ok: true,
      value: {
        installationId: row.installationId,
        repositoryId: row.repositoryId,
        repositoryFullName: row.repositoryFullName,
        userId: row.userId,
        tenantId: row.tenantId,
        projectId: row.projectId,
      },
    };
  }
}
