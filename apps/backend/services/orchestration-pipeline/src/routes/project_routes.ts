import { Elysia, t } from 'elysia';
import { ProjectManagementService } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services/database';
import { EventBusService } from '@uaip/shared-services/event-bus';
import { logger } from '@uaip/utils';
import { z } from 'zod';
import { ProjectStatus, ProjectPriority, ProjectVisibility } from '@uaip/types';
import { SetupProjectWorkspaceWorkflow } from '../workflows/setup_project_workspace_workflow.js';

// Request validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  priority: z.nativeEnum(ProjectPriority).optional(),
  visibility: z.nativeEnum(ProjectVisibility).optional(),
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
  priority: z.nativeEnum(ProjectPriority).optional(),
  visibility: z.nativeEnum(ProjectVisibility).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().min(0).optional(),
  settings: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  priority: z.nativeEnum(ProjectPriority).optional(),
  assignedAgentId: z.string().optional(),
  assignedUserId: z.string().optional(),
  requirements: z.record(z.any()).optional(),
  tools: z.array(z.string()).optional(),
  estimatedCost: z.number().min(0).optional(),
  estimatedDuration: z.number().min(0).optional(),
  dueDate: z.string().datetime().optional(),
});

const addAgentSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const recordToolUsageSchema = z.object({
  toolId: z.string().min(1, 'Tool ID is required'),
  usage: z.object({
    duration: z.number().min(0).optional(),
    inputTokens: z.number().min(0).optional(),
    outputTokens: z.number().min(0).optional(),
    cost: z.number().min(0).optional(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
});

const setupWorkspaceSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  projectName: z.string().min(1, 'Project name is required'),
  githubToken: z.string().min(1, 'GitHub token is required'),
  repoName: z.string().min(1, 'Repo name is required'),
  repoVisibility: z.enum(['public', 'private']),
});

const ProjectErrorSchema = t.Object({ error: t.String(), details: t.Optional(t.Any()) })
const ProjectSchema = t.Any()
const TaskSchema = t.Any()

// Initialize services
let projectService: ProjectManagementService;
let eventBusService: EventBusService;
let databaseService: DatabaseService;

const initServices = async () => {
  if (!projectService) {
    databaseService = DatabaseService.getInstance();
    eventBusService = EventBusService.getInstance();
    projectService = new ProjectManagementService(databaseService, eventBusService);
    await projectService.initialize();
  }
};

export function registerProjectRoutes() {
  return new Elysia()
    .post('/api/v1/projects', async ({ body, headers, set }) => {
      try {
        await initServices();
        const userId = headers['x-user-id'];
        if (!userId) {
          set.status = 401;
          return { error: 'User not authenticated' };
        }

        const validatedBody = createProjectSchema.parse(body);
        const project = await projectService.createProject({
          name: validatedBody.name!,
          ownerId: userId,
          description: validatedBody.description,
          category: validatedBody.category,
          tags: validatedBody.tags,
          priority: validatedBody.priority,
          visibility: validatedBody.visibility,
          startDate: validatedBody.startDate ? new Date(validatedBody.startDate) : undefined,
          endDate: validatedBody.endDate ? new Date(validatedBody.endDate) : undefined,
          budget: validatedBody.budget,
          settings: validatedBody.settings,
          metadata: validatedBody.metadata,
        });

        set.status = 201;
        return project;
      } catch (error) {
        if (error instanceof z.ZodError) {
          set.status = 400;
          return { error: 'Validation error', details: error.errors };
        }
        logger.error('Error creating project', { error });
        set.status = 500;
        return { error: 'Failed to create project' };
      }
    }, {
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        category: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
        priority: t.Optional(t.String()),
        visibility: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        budget: t.Optional(t.Number()),
        settings: t.Optional(t.Any()),
        metadata: t.Optional(t.Any()),
      }),
      response: { 201: ProjectSchema, 400: ProjectErrorSchema, 401: ProjectErrorSchema, 500: ProjectErrorSchema },
    })

    .get('/api/v1/projects', async ({ headers, set }) => {
      try {
        await initServices();
        const userId = headers['x-user-id'];
        if (!userId) {
          set.status = 401;
          return { error: 'User not authenticated' };
        }

        const projects = await projectService.getProjects({ ownerId: userId });
        return projects;
      } catch (error) {
        logger.error('Error fetching projects', { error });
        set.status = 500;
        return { error: 'Failed to fetch projects' };
      }
    }, {
      response: { 200: t.Array(ProjectSchema), 401: ProjectErrorSchema, 500: ProjectErrorSchema },
    })

    .get('/api/v1/projects/analytics', async ({ headers, query, set }) => {
      try {
        await initServices();
        const userId = headers['x-user-id'];
        const _timeRange = query?.timeRange || '30d';

        const analytics = await projectService.getProjectAnalytics({ ownerId: userId });
        return analytics;
      } catch (error) {
        logger.error('Error fetching project analytics', { error });
        set.status = 500;
        return { error: 'Failed to fetch project analytics' };
      }
    }, {
      query: t.Object({ timeRange: t.Optional(t.String()) }),
      response: { 200: t.Any(), 500: ProjectErrorSchema },
    })

    .get('/api/v1/projects/:projectId', async ({ params, headers, set }) => {
      try {
        await initServices();
        const userId = headers['x-user-id'];
        const projectId = params.projectId;

        const project = await projectService.getProject(projectId, userId);
        if (!project) {
          set.status = 404;
          return { error: 'Project not found' };
        }

        return project;
      } catch (error) {
        logger.error('Error fetching project', { error });
        set.status = 500;
        return { error: 'Failed to fetch project' };
      }
    }, {
      response: { 200: ProjectSchema, 404: ProjectErrorSchema, 500: ProjectErrorSchema },
    })

    .post(
      '/api/v1/projects/:projectId/setup-workspace',
      async ({ params, body, headers, set }) => {
        try {
          await initServices();

          const validatedBody = setupWorkspaceSchema.parse(body);
          const headerUserId = headers['x-user-id'];
          const userId = headerUserId || validatedBody.userId;

          if (!userId) {
            set.status = 401;
            return { error: 'User not authenticated' };
          }

          if (headerUserId && headerUserId !== validatedBody.userId) {
            set.status = 403;
            return { error: 'User ID mismatch' };
          }

          const projectId = params.projectId;
          const workflow = new SetupProjectWorkspaceWorkflow(eventBusService);
          const result = await workflow.execute({
            projectId,
            userId,
            projectName: validatedBody.projectName,
            githubToken: validatedBody.githubToken,
            repoName: validatedBody.repoName,
            repoVisibility: validatedBody.repoVisibility,
          });

          return result;
        } catch (error) {
          if (error instanceof z.ZodError) {
            set.status = 400;
            return { error: 'Validation error', details: error.errors };
          }

          logger.error('Error setting up project workspace', { error });
          set.status = 500;
          return { error: 'Failed to set up project workspace' };
        }
      },
      {
        body: t.Object({
          userId: t.String(),
          projectName: t.String(),
          githubToken: t.String(),
          repoName: t.String(),
          repoVisibility: t.Union([t.Literal('public'), t.Literal('private')]),
        }),
        response: { 200: t.Any(), 400: ProjectErrorSchema, 401: ProjectErrorSchema, 403: ProjectErrorSchema, 500: ProjectErrorSchema },
      }
    )

    .put('/api/v1/projects/:projectId', async ({ params, body, headers, set }) => {
      try {
        await initServices();
        const _userId = headers['x-user-id'];
        const projectId = params.projectId;

        const validatedBody = updateProjectSchema.parse(body);
        const updateData: Record<string, unknown> = {
          ...validatedBody,
          ...(validatedBody.startDate ? { startDate: new Date(validatedBody.startDate) } : {}),
          ...(validatedBody.endDate ? { endDate: new Date(validatedBody.endDate) } : {}),
        };
        const project = await projectService.updateProject(projectId, updateData);
        return project;
      } catch (error) {
        if (error instanceof z.ZodError) {
          set.status = 400;
          return { error: 'Validation error', details: error.errors };
        }
        logger.error('Error updating project', { error });
        set.status = 500;
        return { error: 'Failed to update project' };
      }
    }, {
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        category: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
        priority: t.Optional(t.String()),
        visibility: t.Optional(t.String()),
        status: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        budget: t.Optional(t.Number()),
        settings: t.Optional(t.Any()),
        metadata: t.Optional(t.Any()),
      }),
      response: { 200: ProjectSchema, 400: ProjectErrorSchema, 500: ProjectErrorSchema },
    })

    .delete('/api/v1/projects/:projectId', async ({ params, headers, set }) => {
      try {
        await initServices();
        const _userId = headers['x-user-id'];
        const projectId = params.projectId;

        await projectService.deleteProject(projectId);
        set.status = 204;
        return '';
      } catch (error) {
        logger.error('Error deleting project', { error });
        set.status = 500;
        return { error: 'Failed to delete project' };
      }
    }, {
      response: { 204: t.String(), 500: ProjectErrorSchema },
    })

    .post('/api/v1/projects/:projectId/tasks', async ({ params, body, headers, set }) => {
      try {
        await initServices();
        const _userId = headers['x-user-id'];
        const projectId = params.projectId;

        const validatedBody = createTaskSchema.parse(body);
        const task = await projectService.createTask({
          title: validatedBody.title!,
          projectId,
          description: validatedBody.description,
          priority: validatedBody.priority,
          assignedAgentId: validatedBody.assignedAgentId,
          assignedUserId: validatedBody.assignedUserId,
          requirements: validatedBody.requirements,
          tools: validatedBody.tools,
          estimatedCost: validatedBody.estimatedCost,
          estimatedDuration: validatedBody.estimatedDuration,
          dueDate: validatedBody.dueDate ? new Date(validatedBody.dueDate) : undefined,
        });
        set.status = 201;
        return task;
      } catch (error) {
        if (error instanceof z.ZodError) {
          set.status = 400;
          return { error: 'Validation error', details: error.errors };
        }
        logger.error('Error creating task', { error });
        set.status = 500;
        return { error: 'Failed to create task' };
      }
    }, {
      body: t.Object({
        title: t.String(),
        description: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        assignedAgentId: t.Optional(t.String()),
        assignedUserId: t.Optional(t.String()),
        requirements: t.Optional(t.Any()),
        tools: t.Optional(t.Array(t.String())),
        estimatedCost: t.Optional(t.Number()),
        estimatedDuration: t.Optional(t.Number()),
        dueDate: t.Optional(t.String()),
      }),
      response: { 201: TaskSchema, 400: ProjectErrorSchema, 500: ProjectErrorSchema },
    })

    .put('/api/v1/projects/:projectId/tasks/:taskId', async ({ params, body, headers, set }) => {
      try {
        await initServices();
        const _userId = headers['x-user-id'];
        const _projectId = params.projectId;
        const taskId = params.taskId;

        const task = await projectService.updateTask(taskId, body);
        return task;
      } catch (error) {
        logger.error('Error updating task', { error });
        set.status = 500;
        return { error: 'Failed to update task' };
      }
    }, {
      body: t.Any(),
      response: { 200: TaskSchema, 500: ProjectErrorSchema },
    })

    .post('/api/v1/projects/:projectId/agents', async ({ params, body, headers, set }) => {
      try {
        await initServices();
        const userId = headers['x-user-id'];
        const projectId = params.projectId;

        if (!userId) {
          set.status = 401;
          return { error: 'User not authenticated' };
        }

        const validatedBody = addAgentSchema.parse(body);

        logger.info('Assigning agent to project', {
          projectId,
          requestedBy: userId,
          agentId: validatedBody.agentId,
          role: validatedBody.role,
        });

        const assignment = await projectService.addProjectAgent(
          projectId,
          validatedBody.agentId,
          validatedBody.role
        );

        set.status = 201;
        return {
          success: true,
          message: 'Agent assigned to project',
          assignment,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          set.status = 400;
          return { error: 'Validation error', details: error.errors };
        }
        logger.error('Error adding agent to project', { error });
        set.status = 500;
        return { error: 'Failed to add agent to project' };
      }
    }, {
      body: t.Object({
        agentId: t.String(),
        role: t.Optional(t.String()),
        permissions: t.Optional(t.Array(t.String())),
      }),
      response: {
        201: t.Object({ success: t.Boolean(), message: t.String(), assignment: t.Any() }),
        400: ProjectErrorSchema,
        401: ProjectErrorSchema,
        500: ProjectErrorSchema,
      },
    })

    .post('/api/v1/projects/:projectId/tool-usage', async ({ params, body, headers, set }) => {
      try {
        await initServices();
        const _userId = headers['x-user-id'];
        const projectId = params.projectId;

        const validatedBody = recordToolUsageSchema.parse(body);
        const toolUsage = {
          projectId,
          toolId: validatedBody.toolId,
          toolName: validatedBody.toolId,
          success: validatedBody.usage.success,
          executionTime: validatedBody.usage.duration || 0,
          cost: validatedBody.usage.cost,
          errorMessage: validatedBody.usage.error,
        };
        await projectService.recordToolUsage(toolUsage);
        set.status = 201;
        return { message: 'Tool usage recorded' };
      } catch (error) {
        if (error instanceof z.ZodError) {
          set.status = 400;
          return { error: 'Validation error', details: error.errors };
        }
        logger.error('Error recording tool usage', { error });
        set.status = 500;
        return { error: 'Failed to record tool usage' };
      }
    }, {
      body: t.Object({
        toolId: t.String(),
        usage: t.Object({
          success: t.Boolean(),
          duration: t.Optional(t.Number()),
          inputTokens: t.Optional(t.Number()),
          outputTokens: t.Optional(t.Number()),
          cost: t.Optional(t.Number()),
          error: t.Optional(t.String()),
        }),
      }),
      response: { 201: t.Object({ message: t.String() }), 400: ProjectErrorSchema, 500: ProjectErrorSchema },
    })

    .get('/api/v1/projects/:projectId/metrics', async ({ params, headers, set }) => {
      try {
        await initServices();
        const _userId = headers['x-user-id'];
        const projectId = params.projectId;

        const metrics = await projectService.getProjectMetrics(projectId);
        return metrics;
      } catch (error) {
        logger.error('Error fetching project metrics', { error });
        set.status = 500;
        return { error: 'Failed to fetch project metrics' };
      }
    }, {
      response: { 200: t.Any(), 500: ProjectErrorSchema },
    })
}
