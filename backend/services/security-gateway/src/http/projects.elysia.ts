import { z } from 'zod';
import { logger } from '@uaip/utils';
import { ProjectManagementService, DatabaseService, EventBusService } from '@uaip/shared-services';
import { withRequiredAuth } from './middleware/auth.plugin.js';
import type { Elysia } from 'elysia';

let projectService: ProjectManagementService | null = null;

async function getProjectService(): Promise<ProjectManagementService> {
  if (!projectService) {
    const databaseService = DatabaseService.getInstance();
    const eventBusService = EventBusService.getInstance();
    projectService = new ProjectManagementService({
      databaseService,
      eventBusService,
    });
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
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  visibility: z.enum(['private', 'team', 'public']).optional(),
  status: z.enum(['active', 'paused', 'completed', 'cancelled', 'archived']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().min(0).optional(),
  settings: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const projectQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'paused', 'completed', 'cancelled', 'archived']).optional(),
  search: z.string().max(100).optional(),
});

export function registerProjectRoutes(app: Elysia<any, any, any, any, any, any, any, any>) {
  // List projects
  app.get(
    '/api/v1/projects',
    async ({ query, set }) => {
      try {
        const service = await getProjectService();
        const parsed = projectQuerySchema.parse(query);

        const projects = await service.listProjects({
          page: parsed.page,
          limit: parsed.limit,
          status: parsed.status,
          search: parsed.search,
        });

        return { success: true, data: projects };
      } catch (error) {
        logger.error('Failed to list projects', { error });
        set.status = 500;
        return { success: false, error: 'Failed to list projects' };
      }
    },
    withRequiredAuth()
  );

  // Get project by ID
  app.get(
    '/api/v1/projects/:projectId',
    async ({ params, set, user }) => {
      try {
        const service = await getProjectService();
        const project = await service.getProject(params.projectId, user?.id);

        if (!project) {
          set.status = 404;
          return { success: false, error: 'Project not found' };
        }

        return { success: true, data: project };
      } catch (error) {
        logger.error('Failed to get project', { error, projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to get project' };
      }
    },
    withRequiredAuth()
  );

  // Create project
  app.post(
    '/api/v1/projects',
    async ({ body, set, user }) => {
      try {
        const service = await getProjectService();
        const parsed = createProjectSchema.parse(body);

        const project = await service.createProject({
          ...parsed,
          ownerId: user?.id || 'system',
        });

        set.status = 201;
        return { success: true, data: project };
      } catch (error) {
        logger.error('Failed to create project', { error });
        if (error instanceof z.ZodError) {
          set.status = 400;
          return { success: false, error: 'Validation failed', details: error.errors };
        }
        set.status = 500;
        return { success: false, error: 'Failed to create project' };
      }
    },
    withRequiredAuth()
  );

  // Update project
  app.put(
    '/api/v1/projects/:projectId',
    async ({ params, body, set }) => {
      try {
        const service = await getProjectService();
        const parsed = updateProjectSchema.parse(body);

        const project = await service.updateProject(params.projectId, parsed);
        return { success: true, data: project };
      } catch (error) {
        logger.error('Failed to update project', { error, projectId: params.projectId });
        if (error instanceof z.ZodError) {
          set.status = 400;
          return { success: false, error: 'Validation failed', details: error.errors };
        }
        set.status = 500;
        return { success: false, error: 'Failed to update project' };
      }
    },
    withRequiredAuth()
  );

  // Delete project
  app.delete(
    '/api/v1/projects/:projectId',
    async ({ params, set }) => {
      try {
        const service = await getProjectService();
        await service.deleteProject(params.projectId);
        set.status = 204;
        return null;
      } catch (error) {
        logger.error('Failed to delete project', { error, projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to delete project' };
      }
    },
    withRequiredAuth()
  );

  // Get project metrics
  app.get(
    '/api/v1/projects/:projectId/metrics',
    async ({ params, set }) => {
      try {
        const service = await getProjectService();
        const metrics = await service.getProjectMetrics(params.projectId);
        return { success: true, data: metrics };
      } catch (error) {
        logger.error('Failed to get project metrics', { error, projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to get project metrics' };
      }
    },
    withRequiredAuth()
  );

  // Get project analytics
  app.get(
    '/api/v1/projects/:projectId/analytics',
    async ({ params, set }) => {
      try {
        const service = await getProjectService();
        const analytics = await service.getProjectAnalytics(params.projectId);
        return { success: true, data: analytics };
      } catch (error) {
        logger.error('Failed to get project analytics', { error, projectId: params.projectId });
        set.status = 500;
        return { success: false, error: 'Failed to get project analytics' };
      }
    },
    withRequiredAuth()
  );

  logger.info('Project routes registered');
}
