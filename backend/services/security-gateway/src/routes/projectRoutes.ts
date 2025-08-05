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

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.nativeEnum(ProjectPriority).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
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
  role: z.string().min(1, 'Role is required')
});

const recordToolUsageSchema = z.object({
  taskId: z.string().optional(),
  toolId: z.string().min(1, 'Tool ID is required'),
  toolName: z.string().min(1, 'Tool name is required'),
  agentId: z.string().optional(),
  operation: z.string().optional(),
  success: z.boolean(),
  executionTime: z.number().min(0),
  cost: z.number().min(0).optional(),
  input: z.record(z.any()).optional(),
  output: z.record(z.any()).optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

// Initialize services
let projectService: ProjectManagementService;

const initializeServices = async () => {
  if (!projectService) {
    const databaseService = DatabaseService.getInstance();
    const eventBusService = EventBusService.getInstance();
    
    projectService = new ProjectManagementService(databaseService, eventBusService);
    await projectService.initialize();
  }
};

// Project CRUD operations
router.post('/', 
  authMiddleware,
  validateRequest({ body: createProjectSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const projectData = {
        ...req.body,
        ownerId: userId,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
      };

      const project = await projectService.createProject(projectData);
      
      logger.info('Project created successfully', { 
        projectId: project.id, 
        userId, 
        name: project.name 
      });

      res.status(201).json({
        success: true,
        data: project,
        message: 'Project created successfully'
      });
    } catch (error) {
      logger.error('Failed to create project', { error, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create project',
        message: error.message 
      });
    }
  }
);

router.get('/', 
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const filters = {
        ownerId: userId,
        status: req.query.status as ProjectStatus,
        category: req.query.category as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const result = await projectService.listProjects(filters);
      
      res.json({
        success: true,
        data: result.projects,
        pagination: {
          total: result.total,
          limit: filters.limit,
          offset: filters.offset
        }
      });
    } catch (error) {
      logger.error('Failed to list projects', { error, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to list projects',
        message: error.message 
      });
    }
  }
);

router.get('/:id', 
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const project = await projectService.getProject(req.params.id, userId);
      
      if (!project) {
        res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
        return;
      }

      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      logger.error('Failed to get project', { error, projectId: req.params.id, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get project',
        message: error.message 
      });
    }
  }
);

router.put('/:id', 
  authMiddleware,
  validateRequest({ body: updateProjectSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user owns the project
      const existingProject = await projectService.getProject(req.params.id, userId);
      if (!existingProject) {
        res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
        return;
      }

      const updates = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined
      };

      const project = await projectService.updateProject(req.params.id, updates);
      
      logger.info('Project updated successfully', { 
        projectId: req.params.id, 
        userId, 
        updates: Object.keys(updates)
      });

      res.json({
        success: true,
        data: project,
        message: 'Project updated successfully'
      });
    } catch (error) {
      logger.error('Failed to update project', { error, projectId: req.params.id, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update project',
        message: error.message 
      });
    }
  }
);

router.delete('/:id', 
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user owns the project
      const existingProject = await projectService.getProject(req.params.id, userId);
      if (!existingProject) {
        res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
        return;
      }

      await projectService.deleteProject(req.params.id);
      
      logger.info('Project deleted successfully', { 
        projectId: req.params.id, 
        userId 
      });

      res.json({
        success: true,
        message: 'Project deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete project', { error, projectId: req.params.id, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete project',
        message: error.message 
      });
    }
  }
);

// Task management endpoints
router.post('/:id/tasks', 
  authMiddleware,
  validateRequest({ body: createTaskSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user owns the project
      const existingProject = await projectService.getProject(req.params.id, userId);
      if (!existingProject) {
        res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
        return;
      }

      const taskData = {
        ...req.body,
        projectId: req.params.id,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined
      };

      const task = await projectService.createTask(taskData);
      
      logger.info('Task created successfully', { 
        taskId: task.id, 
        projectId: req.params.id, 
        userId 
      });

      res.status(201).json({
        success: true,
        data: task,
        message: 'Task created successfully'
      });
    } catch (error) {
      logger.error('Failed to create task', { error, projectId: req.params.id, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create task',
        message: error.message 
      });
    }
  }
);

router.put('/:id/tasks/:taskId', 
  authMiddleware,
  validateRequest({ body: updateTaskSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user owns the project
      const existingProject = await projectService.getProject(req.params.id, userId);
      if (!existingProject) {
        res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
        return;
      }

      const updates = {
        ...req.body,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined
      };

      const task = await projectService.updateTask(req.params.taskId, updates);
      
      logger.info('Task updated successfully', { 
        taskId: req.params.taskId, 
        projectId: req.params.id, 
        userId 
      });

      res.json({
        success: true,
        data: task,
        message: 'Task updated successfully'
      });
    } catch (error) {
      logger.error('Failed to update task', { error, taskId: req.params.taskId, projectId: req.params.id, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update task',
        message: error.message 
      });
    }
  }
);

// Agent management endpoints
router.post('/:id/agents', 
  authMiddleware,
  validateRequest({ body: addAgentSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user owns the project
      const existingProject = await projectService.getProject(req.params.id, userId);
      if (!existingProject) {
        res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
        return;
      }

      const { agentId, role } = req.body;
      const agent = await projectService.addProjectAgent(req.params.id, agentId, role);
      
      logger.info('Agent added to project successfully', { 
        agentId, 
        projectId: req.params.id, 
        role, 
        userId 
      });

      res.status(201).json({
        success: true,
        data: agent,
        message: 'Agent added to project successfully'
      });
    } catch (error) {
      logger.error('Failed to add agent to project', { error, projectId: req.params.id, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to add agent to project',
        message: error.message 
      });
    }
  }
);

// Tool usage tracking
router.post('/:id/tool-usage', 
  authMiddleware,
  validateRequest({ body: recordToolUsageSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user owns the project
      const existingProject = await projectService.getProject(req.params.id, userId);
      if (!existingProject) {
        res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
        return;
      }

      const usageData = {
        ...req.body,
        projectId: req.params.id,
        userId
      };

      const usage = await projectService.recordToolUsage(usageData);
      
      logger.info('Tool usage recorded successfully', { 
        toolId: req.body.toolId, 
        projectId: req.params.id, 
        userId 
      });

      res.status(201).json({
        success: true,
        data: usage,
        message: 'Tool usage recorded successfully'
      });
    } catch (error) {
      logger.error('Failed to record tool usage', { error, projectId: req.params.id, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to record tool usage',
        message: error.message 
      });
    }
  }
);

// Analytics endpoints
router.get('/:id/metrics', 
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if user owns the project
      const existingProject = await projectService.getProject(req.params.id, userId);
      if (!existingProject) {
        res.status(404).json({ 
          success: false, 
          error: 'Project not found' 
        });
        return;
      }

      const metrics = await projectService.getProjectMetrics(req.params.id);
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Failed to get project metrics', { error, projectId: req.params.id, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get project metrics',
        message: error.message 
      });
    }
  }
);

router.get('/analytics', 
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await initializeServices();
      
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const filters = {
        ownerId: userId,
        dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
        dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined
      };

      const analytics = await projectService.getProjectAnalytics(filters);
      
      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      logger.error('Failed to get project analytics', { error, userId: req.user?.id });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get project analytics',
        message: error.message 
      });
    }
  }
);

export default router;