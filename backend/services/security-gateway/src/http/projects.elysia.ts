import { z } from 'zod';
import { logger } from '@uaip/utils';
import { ProjectManagementService, DatabaseService, EventBusService } from '@uaip/shared-services';
import { withOptionalAuth } from './middleware/auth.plugin.js';

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

export function registerProjectRoutes(app: any): any {
  return app.group('/api/v1/projects', (app: any) =>
    withOptionalAuth(app)
      // List projects
      .get('/', async ({ query, set, user }: any) => {
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

          const projects = await service.listProjects({
            page: parsed.data.page,
            limit: parsed.data.limit,
            status: parsed.data.status,
            search: parsed.data.search,
          });

          return { success: true, data: projects };
        } catch (error) {
          logger.error('Failed to list projects', { error });
          set.status = 500;
          return { success: false, error: 'Failed to list projects' };
        }
      })

      // Get project by ID
      .get('/:projectId', async ({ params, set, user }: any) => {
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
          logger.error('Failed to get project', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to get project' };
        }
      })

      // Create project
      .post('/', async ({ body, set, user }: any) => {
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
            ...parsed.data,
            ownerId: user?.id || 'system',
          });

          set.status = 201;
          return { success: true, data: project };
        } catch (error) {
          logger.error('Failed to create project', { error });
          set.status = 500;
          return { success: false, error: 'Failed to create project' };
        }
      })

      // Update project
      .put('/:projectId', async ({ params, body, set, user }: any) => {
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

          const project = await service.updateProject(params.projectId, parsed.data);
          return { success: true, data: project };
        } catch (error) {
          logger.error('Failed to update project', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to update project' };
        }
      })

      // Delete project
      .delete('/:projectId', async ({ params, set, user }: any) => {
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
          logger.error('Failed to delete project', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to delete project' };
        }
      })

      // Get project metrics
      .get('/:projectId/metrics', async ({ params, set, user }: any) => {
        try {
          if (!user) {
            set.status = 401;
            return { error: 'Authentication required' };
          }
          const service = await getProjectService();
          const metrics = await service.getProjectMetrics(params.projectId);
          return { success: true, data: metrics };
        } catch (error) {
          logger.error('Failed to get project metrics', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to get project metrics' };
        }
      })

      // Get project analytics
      .get('/:projectId/analytics', async ({ params, set, user }: any) => {
        try {
          if (!user) {
            set.status = 401;
            return { error: 'Authentication required' };
          }
          const service = await getProjectService();
          const analytics = await service.getProjectAnalytics(params.projectId);
          return { success: true, data: analytics };
        } catch (error) {
          logger.error('Failed to get project analytics', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to get project analytics' };
        }
      })
  );
}
