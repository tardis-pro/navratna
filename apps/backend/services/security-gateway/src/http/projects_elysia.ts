import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger, ApiError } from '@uaip/utils';
import { ProjectManagementService } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
import {
  PROJECT_INSTRUCTIONS_MAX,
  readProjectChatSettings,
  writeProjectChatSettings,
} from '@uaip/shared-services';
import { EventBusService } from '@uaip/infra/event_bus';
import { withOptionalAuth } from '@uaip/middleware';
import { OAuthService } from '@uaip/shared-services';
import {
  ProjectRole,
  ProjectStatus,
  ProjectVisibility,
  type ProjectEntity,
} from '@uaip/types';
import { GitHubIntegrationService } from '../services/github_integration_service.js';
import { AuditService } from '../services/audit_service.js';
import { OAuthProviderService } from '../services/oauth_provider_service.js';
import { verifyServiceToken } from './project_provision_elysia.js';

const SERVICE_TOKEN_HEADER = 'x-navratna-service-token';

/**
 * A caller that is the platform rather than a person.
 *
 * `tardis init` mints a project through POST /api/v1/projects/provision and then
 * had nowhere else to go: every other route on this collection is gated on a
 * session, the provisioner has no user to be, and so `GET /api/v1/projects`
 * answered a flat 401 to the one caller that created the rows it lists. The
 * platform could create projects it was then unable to read back.
 *
 * `verifyServiceToken` is IMPORTED, not re-written. It is the reviewed check
 * from project_provision_elysia.ts in this same package — constant-time,
 * length-compared first because timingSafeEqual throws on a mismatch and the
 * throw itself leaks length, and closed when PROJECT_PROVISION_TOKEN is unset.
 * navratna-core reimplements the same twelve lines only because it must not
 * depend on security-gateway; inside this package there is no such excuse, and a
 * third copy would be a third thing to get wrong.
 *
 * The routes keep `withOptionalAuth`, which attaches a session when there is one
 * but refuses nobody, so the HANDLER is the wall — the shape knowledge ingest
 * uses. A service call is deliberately NOT turned into a synthetic user: nothing
 * downstream should be able to mistake the platform for a person.
 */
function isServiceCall(request: Request): boolean {
  return verifyServiceToken(
    request.headers.get(SERVICE_TOKEN_HEADER),
    process.env.PROJECT_PROVISION_TOKEN
  ).valid;
}

/**
 * Winston serializes a bare Error to `{}` (its fields are non-enumerable), so
 * `logger.error(msg, { error })` logged nothing useful and hid real 500s.
 */
function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { value: String(error) };
}

let projectService: ProjectManagementService | null = null;
let gitHubIntegrationService: GitHubIntegrationService | null = null;

async function getGitHubIntegrationService(): Promise<GitHubIntegrationService> {
  if (!gitHubIntegrationService) {
    const auditService = new AuditService();
    const oauthProviderService = new OAuthProviderService(auditService);
    gitHubIntegrationService = new GitHubIntegrationService(
      oauthProviderService,
      OAuthService.getInstance()
    );
  }
  return gitHubIntegrationService;
}

async function getProjectService(): Promise<ProjectManagementService> {
  if (!projectService) {
    const databaseService = DatabaseService.getInstance();

    // The gateway does not build the event-bus singleton at startup, so a bare
    // getInstance() throws and every /projects request 500s. Same approach as
    // approval_elysia: reuse the singleton if another module already created it,
    // otherwise construct it with config.
    let eventBusService: EventBusService;
    try {
      eventBusService = EventBusService.getInstance();
    } catch {
      const { config } = await import('@uaip/config');
      eventBusService = EventBusService.getInstance({ ...config, serviceName: 'navratna-gateway' }, logger);
    }

    projectService = new ProjectManagementService(databaseService, eventBusService);
    await projectService.initialize();
  }
  return projectService;
}

/**
 * Every :projectId route must prove the caller owns or belongs to the project.
 * Returns null when access is granted, otherwise the response body to return —
 * 404 rather than 403 so the endpoint is not an existence oracle.
 */
async function assertProjectAccess(
  projectId: string,
  userId: string | undefined,
  set: { status?: number | string }
): Promise<{ success: false; error: string } | null> {
  if (!userId) {
    set.status = 401;
    return { success: false, error: 'Authentication required' };
  }
  const service = await getProjectService();
  const project = await service.getProject(projectId, userId);
  if (!project) {
    set.status = 404;
    return { success: false, error: 'Project not found' };
  }
  return null;
}

// Lengths mirror the DB columns (projects.name is varchar(255)). Without them an
// oversized value reached Postgres and came back as 22001 'value too long', which
// the route could only report as a 500 for what is really a client error.
const PROJECT_NAME_MAX = 255;
const PROJECT_TEXT_MAX = 10_000;

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(PROJECT_NAME_MAX, `Project name must be at most ${PROJECT_NAME_MAX} characters`),
  description: z.string().max(PROJECT_TEXT_MAX).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  visibility: z.enum(['private', 'team', 'public']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().min(0).optional(),
  settings: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  organizationId: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(PROJECT_NAME_MAX).optional(),
  description: z.string().max(PROJECT_TEXT_MAX).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  visibility: z.enum(['private', 'team', 'public']).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().min(0).optional(),
  settings: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

function toProjectUpdates(
  data: z.infer<typeof updateProjectSchema>,
  current: ProjectEntity
): Partial<ProjectEntity> {
  const updates: Partial<ProjectEntity> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.tags !== undefined) updates.tags = data.tags;
  if (data.status !== undefined) updates.status = data.status;
  if (data.settings !== undefined) updates.settings = data.settings;
  if (data.visibility !== undefined) {
    updates.visibility = data.visibility === 'team'
      ? ProjectVisibility.INTERNAL
      : data.visibility === 'public'
        ? ProjectVisibility.PUBLIC
        : ProjectVisibility.PRIVATE;
  }

  const metadataUpdates = {
    ...(data.metadata ?? {}),
    ...(data.category !== undefined ? { category: data.category } : {}),
    ...(data.priority !== undefined ? { priority: data.priority } : {}),
    ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
    ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
    ...(data.budget !== undefined ? { budget: data.budget } : {}),
  };
  if (Object.keys(metadataUpdates).length > 0) {
    updates.metadata = { ...(current.metadata ?? {}), ...metadataUpdates };
  }
  return updates;
}

const projectQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(ProjectStatus).optional(),
  search: z.string().max(100).optional(),
});

const projectMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(ProjectRole).default(ProjectRole.MEMBER),
});

const projectMemberRoleSchema = z.object({
  role: z.nativeEnum(ProjectRole),
});

const projectToolsSchema = z.object({
  toolIds: z.array(z.string().min(1)).min(1),
});

const linkGitHubRepoSchema = z.object({
  repoFullName: z.string().min(1),
});

const linkGitRepoSchema = z.object({
  provider: z.enum(['github', 'gitea']),
  repoFullName: z.string().min(1),
  repoId: z.string().min(1),
  cloneUrl: z.string().url(),
});

/**
 * Both fields are nullable AND optional, and the two mean different things:
 * omitted leaves the stored value alone, explicit null clears it. Without the
 * nullable half there would be no way to remove instructions or unpin an agent
 * once set.
 */
const chatSettingsSchema = z.object({
  instructions: z.string().max(PROJECT_INSTRUCTIONS_MAX).nullable().optional(),
  defaultAgentId: z.string().uuid().nullable().optional(),
});

export function registerProjectRoutes() {
  return new Elysia().group('/api/v1/projects', (app) => withOptionalAuth(app)
    // List projects
    .get('/', async ({ query, set, user, request }) => {
      try {
        /**
         * A caller must be either an authenticated person or the platform.
         * Neither is still 401 with the identical body it returned before, so
         * nothing that was refused yesterday is admitted today.
         */
        const serviceCall = isServiceCall(request);
        if (!user && !serviceCall) {
          set.status = 401;
          return { error: 'Authentication required' };
        }

        /**
         * SCOPING FOR A SERVICE CALL — explicitly unscoped, and deliberately so.
         *
         * The platform provisions every project on the box; a list it cannot see
         * all of is not an answer to the question it is asking. That is the
         * justification, and it is the only one: nowhere else in this file does
         * a service credential get to skip a check.
         *
         * Note what this does NOT widen. `listProjects()` below is passed no
         * ownerId, so this route has never scoped its result to the caller — a
         * signed-in person already receives rows from projects they do not
         * belong to. Admitting the platform therefore changes nothing about what
         * comes back; it only changes who may ask.
         *
         * That pre-existing hole for HUMAN callers is real and is left alone
         * here on purpose: `listProjects` can filter only by ownerId, and
         * filtering by owner would cut members off from projects they are
         * members of. Closing it properly needs a membership-aware query in
         * ProjectManagementService, not a patch at this handler.
         */
        const service = await getProjectService();
        const parsed = projectQuerySchema.safeParse(query);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Validation Error', details: parsed.error.flatten() };
        }
  
        const offset = (parsed.data.page - 1) * parsed.data.limit;
        const projects = await service.listProjects({
          offset,
          limit: parsed.data.limit,
          status: parsed.data.status,
        });
  
        return { success: true, data: projects };
      } catch (error) {
        logger.error('Failed to list projects', { error: describeError(error) });
        set.status = 500;
        return { success: false, error: 'Failed to list projects' };
      }
    })
  
    // Get project by ID
    .get('/:projectId', async ({ params, set, user, request }) => {
      try {
        const serviceCall = isServiceCall(request);
        if (!user && !serviceCall) {
          set.status = 401;
          return { success: false, error: 'Authentication required' };
        }

        /**
         * SCOPING FOR A SERVICE CALL — unscoped membership, but the row must
         * still exist.
         *
         * `getProject(id, undefined)` skips `userCanAccessProject`, which is
         * correct for the platform (it owns none of these projects and belongs
         * to none of them, yet provisioned all of them) and correct for nobody
         * else. The lookup itself still runs, so a service token cannot turn an
         * id that does not exist into a 200 — the same 404 a person gets, and
         * the same rule knowledge ingest applies before it will tag a repo onto
         * a project id.
         *
         * `assertProjectAccess` is intentionally NOT taught about service calls.
         * It also guards PUT, DELETE, member and tool mutation, and
         * `link-github`/`link-git`, which dereference `user!.id` and would throw
         * on a caller that has no user. Widening it would hand the platform
         * write access to every project as a side effect of wanting to read one.
         */
        const service = await getProjectService();
        const project = await service.getProject(
          params.projectId,
          serviceCall ? undefined : user?.id
        );

        if (!project) {
          set.status = 404;
          return { success: false, error: 'Project not found' };
        }

        return { success: true, data: project };
      } catch (error) {
        logger.error('Failed to get project', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to get project' };
      }
    })
  
    // Create project
    .post('/', async ({ body, set, user }) => {
      try {
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
        const service = await getProjectService();
        const parsed = createProjectSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Validation Error', details: parsed.error.flatten() };
        }
  
        const project = await service.createProject({
          name: parsed.data.name,
          description: parsed.data.description,
          ownerId: user?.id || 'system',
          settings: parsed.data.settings,
          metadata: parsed.data.metadata,
          organizationId: parsed.data.organizationId,
          category: parsed.data.category,
          tags: parsed.data.tags,
          budget: parsed.data.budget,
        });
  
        set.status = 201;
        return { success: true, data: project };
      } catch (error) {
        logger.error('Failed to create project', { error: describeError(error) });
        set.status = 500;
        return { success: false, error: 'Failed to create project' };
      }
    })
  
    // Update project
    .put('/:projectId', async ({ params, body, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const service = await getProjectService();
        const parsed = updateProjectSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Validation Error', details: parsed.error.flatten() };
        }
  
        const current = await service.getProject(params.projectId, user?.id);
        if (!current) {
          set.status = 404;
          return { success: false, error: 'Project not found' };
        }
        const project = await service.updateProject(
          params.projectId,
          toProjectUpdates(parsed.data, current)
        );
        return { success: true, data: project };
      } catch (error) {
        logger.error('Failed to update project', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to update project' };
      }
    })
  
    // Delete project
    .delete('/:projectId', async ({ params, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const service = await getProjectService();
        await service.deleteProject(params.projectId);
        set.status = 204;
        return null;
      } catch (error) {
        logger.error('Failed to delete project', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to delete project' };
      }
    })

    /**
     * The chat configuration every thread in the project inherits. Kept separate
     * from PUT /:projectId because that route's schema describes the project's
     * identity (name, visibility, repo) and a chat settings save must not have to
     * round-trip all of it.
     */
    .get('/:projectId/chat-settings', async ({ params, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const service = await getProjectService();
        const project = await service.getProject(params.projectId, user?.id);
        if (!project) {
          set.status = 404;
          return { success: false, error: 'Project not found' };
        }

        return { success: true, data: readProjectChatSettings(project.settings) };
      } catch (error) {
        logger.error('Failed to read project chat settings', {
          error: describeError(error),
          projectId: params.projectId,
        });
        set.status = 500;
        return { success: false, error: 'Failed to read project chat settings' };
      }
    })

    .put('/:projectId/chat-settings', async ({ params, body, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const parsed = chatSettingsSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Validation Error', details: parsed.error.flatten() };
        }

        const service = await getProjectService();
        const current = await service.getProject(params.projectId, user?.id);
        if (!current) {
          set.status = 404;
          return { success: false, error: 'Project not found' };
        }

        // Merged against what is stored, never replaced wholesale: `settings`
        // also holds configuration this route knows nothing about, and writing
        // only the chat key would drop the rest of the bag.
        const settings = writeProjectChatSettings(current.settings, parsed.data);
        await service.updateProject(params.projectId, { settings });

        return { success: true, data: readProjectChatSettings(settings) };
      } catch (error) {
        logger.error('Failed to update project chat settings', {
          error: describeError(error),
          projectId: params.projectId,
        });
        set.status = 500;
        return { success: false, error: 'Failed to update project chat settings' };
      }
    })

    .get('/:projectId/members', async ({ params, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const service = await getProjectService();
        return { success: true, data: await service.getProjectMembers(params.projectId) };
      } catch (error) {
        logger.error('Failed to list project members', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to list project members' };
      }
    })

    .post('/:projectId/members', async ({ params, body, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const parsed = projectMemberSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'Invalid project member', details: parsed.error.flatten() };
        }
        const service = await getProjectService();
        set.status = 201;
        return {
          success: true,
          data: await service.addProjectMember(params.projectId, parsed.data.userId, parsed.data.role),
        };
      } catch (error) {
        logger.error('Failed to add project member', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to add project member' };
      }
    })

    .patch('/:projectId/members/:userId', async ({ params, body, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const parsed = projectMemberRoleSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'Invalid project member role', details: parsed.error.flatten() };
        }
        const service = await getProjectService();
        const updated = await service.updateMemberRole(params.projectId, params.userId, parsed.data.role);
        if (!updated) {
          set.status = 404;
          return { success: false, error: 'Project member not found' };
        }
        return { success: true, data: await service.getProjectMembers(params.projectId) };
      } catch (error) {
        logger.error('Failed to update project member', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to update project member' };
      }
    })

    .get('/:projectId/tools', async ({ params, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const service = await getProjectService();
        return { success: true, data: await service.getProjectTools(params.projectId) };
      } catch (error) {
        logger.error('Failed to list project tools', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to list project tools' };
      }
    })

    .post('/:projectId/tools', async ({ params, body, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const parsed = projectToolsSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'Invalid tool assignment', details: parsed.error.flatten() };
        }
        const service = await getProjectService();
        return { success: true, data: await service.assignProjectTools(params.projectId, parsed.data.toolIds) };
      } catch (error) {
        logger.error('Failed to assign project tools', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to assign project tools' };
      }
    })

    .delete('/:projectId/tools', async ({ params, body, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const parsed = projectToolsSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'Invalid tool removal', details: parsed.error.flatten() };
        }
        const service = await getProjectService();
        return { success: true, data: await service.removeProjectTools(params.projectId, parsed.data.toolIds) };
      } catch (error) {
        logger.error('Failed to remove project tools', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to remove project tools' };
      }
    })

    .delete('/:projectId/members/:userId', async ({ params, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const service = await getProjectService();
        const removed = await service.removeProjectMember(params.projectId, params.userId);
        if (!removed) {
          set.status = 404;
          return { success: false, error: 'Project member not found' };
        }
        set.status = 204;
        return null;
      } catch (error) {
        logger.error('Failed to remove project member', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to remove project member' };
      }
    })
  
    // Get project metrics
    .get('/:projectId/metrics', async ({ params, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const service = await getProjectService();
        const metrics = await service.getProjectMetrics(params.projectId);
        return { success: true, data: metrics };
      } catch (error) {
        logger.error('Failed to get project metrics', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to get project metrics' };
      }
    })
  
    // Get project analytics
    .get('/:projectId/analytics', async ({ params, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const service = await getProjectService();
        const metrics = await service.getProjectMetrics(params.projectId);
        return { success: true, data: metrics };
      } catch (error) {
        logger.error('Failed to get project analytics', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to get project analytics' };
      }
    })

    // List accessible GitHub repositories for the current user
    .get('/:projectId/github/repos', async ({ params, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;
        const service = await getGitHubIntegrationService();
        const repos = await service.listUserRepos(user!.id);
        return { success: true, data: repos };
      } catch (error) {
        logger.error('Failed to list GitHub repos', { error: describeError(error), projectId: params.projectId });
        if (error instanceof ApiError) {
          set.status = error.statusCode;
          return { success: false, error: error.message, code: error.code };
        }
        set.status = 500;
        return { success: false, error: 'Failed to list GitHub repositories' };
      }
    })

    // Link a GitHub repository to the project
    .post('/:projectId/link-github', async ({ params, body, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;

        const parsed = linkGitHubRepoSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'Validation Error', details: parsed.error.flatten() };
        }

        const gitHubService = await getGitHubIntegrationService();
        const repo = await gitHubService.getUserRepo(user!.id, parsed.data.repoFullName);

        const projectService = await getProjectService();
        const updated = await projectService.linkGitHubRepo(params.projectId, user!.id, {
          projectId: params.projectId,
          repoFullName: repo.full_name,
          repoId: String(repo.id),
          cloneUrl: repo.clone_url,
        });

        return { success: true, data: updated };
      } catch (error) {
        logger.error('Failed to link GitHub repo', { error: describeError(error), projectId: params.projectId });
        if (error instanceof ApiError) {
          set.status = error.statusCode;
          return { success: false, error: error.message, code: error.code };
        }
        set.status = 500;
        return { success: false, error: 'Failed to link GitHub repository' };
      }
    })

    // Link any git repository (GitHub, Gitea, etc.) to the project
    .post('/:projectId/link-git', async ({ params, body, set, user }) => {
      try {
        const denied = await assertProjectAccess(params.projectId, user?.id, set);
        if (denied) return denied;

        const parsed = linkGitRepoSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { success: false, error: 'Validation Error', details: parsed.error.flatten() };
        }

        const projectService = await getProjectService();
        const updated = await projectService.linkGitRepo(params.projectId, user!.id, {
          projectId: params.projectId,
          provider: parsed.data.provider,
          repoFullName: parsed.data.repoFullName,
          repoId: parsed.data.repoId,
          cloneUrl: parsed.data.cloneUrl,
        });

        return { success: true, data: updated };
      } catch (error) {
        logger.error('Failed to link git repo', { error: describeError(error), projectId: params.projectId });
        if (error instanceof ApiError) {
          set.status = error.statusCode;
          return { success: false, error: error.message, code: error.code };
        }
        set.status = 500;
        return { success: false, error: 'Failed to link git repository' };
      }
    })
  );

}
