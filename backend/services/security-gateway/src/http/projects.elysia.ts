import { z } from 'zod';
import { logger } from '@uaip/utils';
import { ProjectManagementService } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/eventBus';
import { withOptionalAuth } from '@uaip/middleware';
import type { OptionalAuthContext as _OptionalAuthContext } from './types/elysia-context.js';
import { ProjectStatus as _ProjectStatus } from '@uaip/types';

let projectService: ProjectManagementService | null = null;

async function getProjectService(): Promise<ProjectManagementService> {
  if (!projectService) {
    const databaseService = DatabaseService.getInstance();
    const eventBusService = EventBusService.getInstance();
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

export function registerProjectRoutes(elysiaApp: any): any {
  return elysiaApp.group('/api/v1/projects', (app: any) =>
    withOptionalAuth(app)
      // List projects
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
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
            status: parsed.data.status as unknown,
          });

          return { success: true, data: projects };
        } catch (error) {
          logger.error('Failed to list projects', { error });
          set.status = 500;
          return { success: false, error: 'Failed to list projects' };
        }
      })

      // Get project by ID
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
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
          logger.error('Failed to get project', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to get project' };
        }
      })

      // Create project
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
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
          logger.error('Failed to create project', { error });
          set.status = 500;
          return { success: false, error: 'Failed to create project' };
        }
      })

      // Update project
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
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
            status: parsed.data.status as unknown,
            settings: parsed.data.settings,
            metadata: parsed.data.metadata,
          });
          return { success: true, data: project };
        } catch (error) {
          logger.error('Failed to update project', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to update project' };
        }
      })

      // Delete project
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
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
          logger.error('Failed to delete project', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to delete project' };
        }
      })

      // Get project metrics
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
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
          logger.error('Failed to get project metrics', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to get project metrics' };
        }
      })

      // Get project analytics
      // @ts-expect-error - Elysia middleware injects user, but TypeScript cannot infer through nested groups
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
          logger.error('Failed to get project analytics', { error, projectId: params.projectId });
          set.status = 500;
          return { success: false, error: 'Failed to get project analytics' };
        }
      })
  );
}
