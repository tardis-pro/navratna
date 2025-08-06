import express, { Request, Response, Router } from '@uaip/shared-services';
import { ProjectManagementService, EventBusService, DatabaseService } from '@uaip/shared-services';
import { authMiddleware, validateRequest } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import { z } from 'zod';
import { ProjectStatus, ProjectPriority, ProjectVisibility } from '@uaip/types';

const router = Router();

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
  metadata: z.record(z.any()).optional()
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
  metadata: z.record(z.any()).optional()
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
  dueDate: z.string().datetime().optional()
});

const addAgentSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  role: z.string().optional(),
  permissions: z.array(z.string()).optional()
});

const recordToolUsageSchema = z.object({
  toolId: z.string().min(1, 'Tool ID is required'),
  usage: z.object({
    duration: z.number().min(0).optional(),
    inputTokens: z.number().min(0).optional(),
    outputTokens: z.number().min(0).optional(),
    cost: z.number().min(0).optional(),
    success: z.boolean(),
    error: z.string().optional()
  })
});

// Initialize services
let projectService: ProjectManagementService;
let eventBusService: EventBusService;
let databaseService: DatabaseService;

const initServices = async () => {
  if (!projectService) {
    databaseService = DatabaseService.getInstance();
    eventBusService = EventBusService.getInstance();
    projectService = new ProjectManagementService(databaseService, eventBusService);
  }
};

// Create project
router.post('/', authMiddleware, validateRequest({ body: createProjectSchema }), async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const project = await projectService.createProject({
      ...req.body,
      ownerId: userId,
      createdBy: userId
    });

    res.status(201).json(project);
  } catch (error) {
    logger.error('Error creating project', { error });
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get user's projects
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projects = await projectService.getProjects({ ownerId: userId });
    res.json(projects);
  } catch (error) {
    logger.error('Error fetching projects', { error });
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get project by ID
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    const projectId = req.params.id;

    const project = await projectService.getProject(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    logger.error('Error fetching project', { error });
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Update project
router.put('/:id', authMiddleware, validateRequest({ body: updateProjectSchema }), async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    const projectId = req.params.id;

    const project = await projectService.updateProject(projectId, req.body);
    res.json(project);
  } catch (error) {
    logger.error('Error updating project', { error });
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    const projectId = req.params.id;

    await projectService.deleteProject(projectId);
    res.status(204).send('');
  } catch (error) {
    logger.error('Error deleting project', { error });
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Create task
router.post('/:id/tasks', authMiddleware, validateRequest({ body: createTaskSchema }), async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    const projectId = req.params.id;

    const task = await projectService.createTask({ ...req.body, projectId });
    res.status(201).json(task);
  } catch (error) {
    logger.error('Error creating task', { error });
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.put('/:id/tasks/:taskId', authMiddleware, async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    const projectId = req.params.id;
    const taskId = req.params.taskId;

    const task = await projectService.updateTask(taskId, req.body);
    res.json(task);
  } catch (error) {
    logger.error('Error updating task', { error });
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Add agent to project
router.post('/:id/agents', authMiddleware, validateRequest({ body: addAgentSchema }), async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    const projectId = req.params.id;

    // Agent assignment functionality needs to be implemented in ProjectManagementService
    res.status(501).json({ error: 'Agent assignment not yet implemented' });
    res.status(201).json({ message: 'Agent added to project' });
  } catch (error) {
    logger.error('Error adding agent to project', { error });
    res.status(500).json({ error: 'Failed to add agent to project' });
  }
});

// Record tool usage
router.post('/:id/tool-usage', authMiddleware, validateRequest({ body: recordToolUsageSchema }), async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    const projectId = req.params.id;

    await projectService.recordToolUsage({ projectId, ...req.body });
    res.status(201).json({ message: 'Tool usage recorded' });
  } catch (error) {
    logger.error('Error recording tool usage', { error });
    res.status(500).json({ error: 'Failed to record tool usage' });
  }
});

// Get project metrics
router.get('/:id/metrics', authMiddleware, async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    const projectId = req.params.id;

    const metrics = await projectService.getProjectMetrics(projectId);
    res.json(metrics);
  } catch (error) {
    logger.error('Error fetching project metrics', { error });
    res.status(500).json({ error: 'Failed to fetch project metrics' });
  }
});

// Get project analytics
router.get('/analytics', authMiddleware, async (req: Request, res: Response) => {
  try {
    await initServices();
    const userId = (req as any).user?.id;
    const timeRange = req.query.timeRange as string || '30d';

    const analytics = await projectService.getProjectAnalytics({ ownerId: userId });
    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching project analytics', { error });
    res.status(500).json({ error: 'Failed to fetch project analytics' });
  }
});

export default router;