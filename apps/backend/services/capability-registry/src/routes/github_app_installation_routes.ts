import { Elysia, t } from 'elysia';
import { getNginxUser, withNginxAuth } from '@uaip/middleware';
import type { GitHubAppInstallationRepository } from '../services/execution_mesh/github_app_installation_repository.js';
import type { GitHubAppTokenBroker, InstallationBinding } from '../services/execution_mesh/github_app_token_broker.js';

export function registerGitHubAppInstallationRoutes(
  repository: GitHubAppInstallationRepository,
  broker: GitHubAppTokenBroker,
) {
  return withNginxAuth(new Elysia({ prefix: '/api/v1/github-app/installations' }))
    .post('/bindings', async ({ body, set, ...context }) => {
      const actor = getNginxUser(context);
      if (actor.role.toLowerCase() !== 'admin') {
        set.status = 403;
        return { success: false as const, error: { code: 'FORBIDDEN', message: 'Admin role required' } };
      }

      const candidate: InstallationBinding = {
        installationId: body.installationId,
        repositoryId: body.repositoryId,
        repositoryFullName: body.repositoryFullName,
        userId: body.userId,
        tenantId: body.tenantId,
        projectId: body.projectId,
      };
      const verified = await broker.verifyInstallationBinding(candidate);
      if (!verified.ok) {
        set.status = verified.error.code === 'GITHUB_API_ERROR' ? 502 : 400;
        return { success: false as const, error: { code: verified.error.code, message: verified.error.message } };
      }

      const inserted = await repository.createVerifiedBinding({
        ...candidate,
        accountLogin: verified.value.accountLogin,
      });
      if (!inserted.ok) {
        set.status = 409;
        return { success: false as const, error: { code: inserted.error.code, message: 'GitHub App binding could not be created' } };
      }
      set.status = 201;
      return {
        success: true as const,
        data: {
          id: inserted.value.id,
          installationId: inserted.value.installationId,
          repositoryId: inserted.value.repositoryId,
          repositoryFullName: inserted.value.repositoryFullName,
          accountLogin: inserted.value.accountLogin,
        },
      };
    }, {
      body: t.Object({
        installationId: t.String({ pattern: '^[1-9]\\d*$' }),
        repositoryId: t.String({ pattern: '^[1-9]\\d*$' }),
        repositoryFullName: t.String({ pattern: '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$' }),
        userId: t.String({
          pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
        }),
        tenantId: t.String({ minLength: 1 }),
        projectId: t.String({ minLength: 1 }),
      }),
    });
}
