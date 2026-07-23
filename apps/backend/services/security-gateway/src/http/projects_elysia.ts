import { Elysia } from 'elysia';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { ProjectManagementService } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/infra/event_bus';
import { withOptionalAuth } from '@uaip/middleware';
import { ProjectRole, ProjectStatus } from '@uaip/types';

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

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
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
  name: z.string().min(1).optional(),
  description: z.string().optional(),
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

export function registerProjectRoutes() {
  return new Elysia().group('/api/v1/projects', (app) => withOptionalAuth(app)
    // List projects
    .get('/', async ({ query, set, user }) => {
      try {
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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
    .get('/:projectId', async ({ params, set, user }) => {
      try {
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
        const service = await getProjectService();
        const project = await service.getProject(params.projectId, user?.id);
  
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
        const service = await getProjectService();
        const parsed = updateProjectSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: 'Validation Error', details: parsed.error.flatten() };
        }
  
        const project = await service.updateProject(params.projectId, {
          name: parsed.data.name,
          description: parsed.data.description,
          status: parsed.data.status,
          settings: parsed.data.settings,
          metadata: parsed.data.metadata,
        });
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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

    .get('/:projectId/members', async ({ params, set, user }) => {
      try {
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
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
        if (!user) {
          set.status = 401;
          return { error: 'Authentication required' };
        }
        const service = await getProjectService();
        const metrics = await service.getProjectMetrics(params.projectId);
        return { success: true, data: metrics };
      } catch (error) {
        logger.error('Failed to get project analytics', { error: describeError(error), projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to get project analytics' };
      }
    })
  );

}
