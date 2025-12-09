import { Server, Socket } from 'socket.io';
import { EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { authenticateConnection } from './websocket-security-utils.js';

interface TaskNotification {
  type:
    | 'task_created'
    | 'task_updated'
    | 'task_assigned'
    | 'task_completed'
    | 'task_deleted'
    | 'task_status_changed'
    | 'task_progress_updated';
  taskId: string;
  projectId: string;
  task: any;
  changes?: Record<string, { old: any; new: any }>;
  actor: {
    id: string;
    name: string;
    type: 'user' | 'agent' | 'system';
  };
  timestamp: Date;
  message: string;
}

interface TaskProgressUpdate {
  taskId: string;
  projectId: string;
  completionPercentage: number;
  timeSpent?: number;
  actor: {
    id: string;
    name: string;
    type: 'user' | 'agent';
  };
  timestamp: Date;
}

interface ProjectTaskStats {
  projectId: string;
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byAssigneeType: Record<string, number>;
  completionRate: number;
  lastUpdated: Date;
}

export class TaskNotificationHandler {
  private io: Server;
  private eventBusService: EventBusService;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private projectSubscriptions: Map<string, Set<string>> = new Map(); // projectId -> Set of socketIds
  private taskSubscriptions: Map<string, Set<string>> = new Map(); // taskId -> Set of socketIds

  constructor(io: Server, eventBusService: EventBusService) {
    this.io = io;
    this.eventBusService = eventBusService;
    this.setupNamespace();
    this.setupEventListeners();
  }

  private setupNamespace(): void {
    const taskNamespace = this.io.of('/task-notifications');

    taskNamespace.use(async (socket, next) => {
      try {
        // Simple authentication for now - could be enhanced later
        const auth = authenticateConnection(socket.request, socket.id);
        if (auth.authenticated) {
          socket.data.user = { id: auth.userId, name: 'User' };
          next();
        } else {
          next(new Error(auth.reason || 'Authentication failed'));
        }
      } catch (error) {
        logger.error('Task notification socket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });

    taskNamespace.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  private handleConnection(socket: Socket): void {
    const userId = socket.data.user?.id;
    if (!userId) {
      logger.error('Task notification socket connected without user data');
      socket.disconnect();
      return;
    }

    logger.info(`Task notification handler connected for user: ${userId}`);

    // Track user connection
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socket.id);

    // Setup event handlers
    this.setupSocketEventHandlers(socket, userId);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket, userId);
    });
  }

  private setupSocketEventHandlers(socket: Socket, userId: string): void {
    // Subscribe to project task updates
    socket.on('subscribe_project', (projectId: string) => {
      this.subscribeToProject(socket, projectId);
    });

    // Unsubscribe from project task updates
    socket.on('unsubscribe_project', (projectId: string) => {
      this.unsubscribeFromProject(socket, projectId);
    });

    // Subscribe to specific task updates
    socket.on('subscribe_task', (taskId: string) => {
      this.subscribeToTask(socket, taskId);
    });

    // Unsubscribe from specific task updates
    socket.on('unsubscribe_task', (taskId: string) => {
      this.unsubscribeFromTask(socket, taskId);
    });

    // Send real-time progress update
    socket.on('task_progress_update', (data: Partial<TaskProgressUpdate>) => {
      this.handleProgressUpdate(socket, userId, data);
    });

    // Request current project stats
    socket.on('get_project_stats', (projectId: string) => {
      this.sendProjectStats(socket, projectId);
    });

    // Send typing indicator for task comments
    socket.on('task_typing_start', (data: { taskId: string; projectId: string }) => {
      this.broadcastTyping(socket, userId, data.taskId, data.projectId, true);
    });

    socket.on('task_typing_stop', (data: { taskId: string; projectId: string }) => {
      this.broadcastTyping(socket, userId, data.taskId, data.projectId, false);
    });
  }

  private subscribeToProject(socket: Socket, projectId: string): void {
    socket.join(`project:${projectId}`);

    if (!this.projectSubscriptions.has(projectId)) {
      this.projectSubscriptions.set(projectId, new Set());
    }
    this.projectSubscriptions.get(projectId)!.add(socket.id);

    logger.debug(`Socket ${socket.id} subscribed to project ${projectId} task updates`);

    // Send current project stats
    this.sendProjectStats(socket, projectId);
  }

  private unsubscribeFromProject(socket: Socket, projectId: string): void {
    socket.leave(`project:${projectId}`);

    const subscriptions = this.projectSubscriptions.get(projectId);
    if (subscriptions) {
      subscriptions.delete(socket.id);
      if (subscriptions.size === 0) {
        this.projectSubscriptions.delete(projectId);
      }
    }

    logger.debug(`Socket ${socket.id} unsubscribed from project ${projectId} task updates`);
  }

  private subscribeToTask(socket: Socket, taskId: string): void {
    socket.join(`task:${taskId}`);

    if (!this.taskSubscriptions.has(taskId)) {
      this.taskSubscriptions.set(taskId, new Set());
    }
    this.taskSubscriptions.get(taskId)!.add(socket.id);

    logger.debug(`Socket ${socket.id} subscribed to task ${taskId} updates`);
  }

  private unsubscribeFromTask(socket: Socket, taskId: string): void {
    socket.leave(`task:${taskId}`);

    const subscriptions = this.taskSubscriptions.get(taskId);
    if (subscriptions) {
      subscriptions.delete(socket.id);
      if (subscriptions.size === 0) {
        this.taskSubscriptions.delete(taskId);
      }
    }

    logger.debug(`Socket ${socket.id} unsubscribed from task ${taskId} updates`);
  }

  private handleProgressUpdate(
    socket: Socket,
    userId: string,
    data: Partial<TaskProgressUpdate>
  ): void {
    if (!data.taskId || !data.projectId || data.completionPercentage === undefined) {
      socket.emit('error', { message: 'Invalid progress update data' });
      return;
    }

    const progressUpdate: TaskProgressUpdate = {
      ...(data as TaskProgressUpdate),
      actor: {
        id: userId,
        name: socket.data.user?.name || 'Unknown User',
        type: 'user',
      },
      timestamp: new Date(),
    };

    // Broadcast to project subscribers
    this.io
      .of('/task-notifications')
      .to(`project:${data.projectId}`)
      .emit('task_progress_updated', progressUpdate);

    // Broadcast to specific task subscribers
    this.io
      .of('/task-notifications')
      .to(`task:${data.taskId}`)
      .emit('task_progress_updated', progressUpdate);

    logger.debug(
      `Progress update broadcast for task ${data.taskId}: ${data.completionPercentage}%`
    );
  }

  private broadcastTyping(
    socket: Socket,
    userId: string,
    taskId: string,
    projectId: string,
    isTyping: boolean
  ): void {
    const typingData = {
      taskId,
      projectId,
      user: {
        id: userId,
        name: socket.data.user?.name || 'Unknown User',
      },
      isTyping,
      timestamp: new Date(),
    };

    // Broadcast to all subscribers except the sender
    socket.to(`task:${taskId}`).emit('task_typing', typingData);
    socket.to(`project:${projectId}`).emit('task_typing', typingData);
  }

  private async sendProjectStats(socket: Socket, projectId: string): Promise<void> {
    try {
      // This would typically fetch from the TaskService
      // For now, we'll emit a request for stats
      socket.emit('project_stats_requested', { projectId });
    } catch (error) {
      logger.error(`Error sending project stats for ${projectId}:`, error);
      socket.emit('error', { message: 'Failed to fetch project stats' });
    }
  }

  private handleDisconnection(socket: Socket, userId: string): void {
    logger.info(`Task notification handler disconnected for user: ${userId}`);

    // Remove from user connections
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);
      }
    }

    // Remove from project subscriptions
    for (const [projectId, subscriptions] of this.projectSubscriptions.entries()) {
      subscriptions.delete(socket.id);
      if (subscriptions.size === 0) {
        this.projectSubscriptions.delete(projectId);
      }
    }

    // Remove from task subscriptions
    for (const [taskId, subscriptions] of this.taskSubscriptions.entries()) {
      subscriptions.delete(socket.id);
      if (subscriptions.size === 0) {
        this.taskSubscriptions.delete(taskId);
      }
    }
  }

  private setupEventListeners(): void {
    // Listen for task events from the event bus
    this.eventBusService.subscribe('task.created', async (data) => {
      this.handleTaskNotification('task_created', data.data);
    });

    this.eventBusService.subscribe('task.updated', async (data) => {
      this.handleTaskNotification('task_updated', data.data);
    });

    this.eventBusService.subscribe('task.assigned', async (data) => {
      this.handleTaskNotification('task_assigned', data.data);
    });

    this.eventBusService.subscribe('task.status_changed', async (data) => {
      this.handleTaskNotification('task_status_changed', data.data);
    });

    this.eventBusService.subscribe('task.completed', async (data) => {
      this.handleTaskNotification('task_completed', data.data);
    });

    this.eventBusService.subscribe('task.deleted', async (data) => {
      this.handleTaskNotification('task_deleted', data.data);
    });

    this.eventBusService.subscribe('project.stats_updated', async (data) => {
      this.handleProjectStatsUpdate(data.data);
    });
  }

  private handleTaskNotification(type: TaskNotification['type'], data: any): void {
    const notification: TaskNotification = {
      type,
      taskId: data.taskId,
      projectId: data.projectId,
      task: data.task,
      changes: data.changes,
      actor: data.actor || { id: 'system', name: 'System', type: 'system' },
      timestamp: new Date(),
      message: this.generateNotificationMessage(type, data),
    };

    // Broadcast to project subscribers
    this.io
      .of('/task-notifications')
      .to(`project:${data.projectId}`)
      .emit('task_notification', notification);

    // Broadcast to specific task subscribers
    this.io
      .of('/task-notifications')
      .to(`task:${data.taskId}`)
      .emit('task_notification', notification);

    // Send personal notifications to assignees
    this.sendPersonalNotifications(notification);

    logger.debug(`Task notification broadcast: ${type} for task ${data.taskId}`);
  }

  private handleProjectStatsUpdate(data: ProjectTaskStats): void {
    this.io
      .of('/task-notifications')
      .to(`project:${data.projectId}`)
      .emit('project_stats_updated', data);

    logger.debug(`Project stats updated for project ${data.projectId}`);
  }

  private sendPersonalNotifications(notification: TaskNotification): void {
    const { task } = notification;

    // Notify assigned user
    if (task.assignedToUserId) {
      const userSockets = this.connectedUsers.get(task.assignedToUserId);
      if (userSockets) {
        userSockets.forEach((socketId) => {
          this.io
            .of('/task-notifications')
            .to(socketId)
            .emit('personal_task_notification', {
              ...notification,
              personal: true,
              reason: 'assigned_to_you',
            });
        });
      }
    }

    // Notify task creator
    if (task.createdBy && task.createdBy !== notification.actor.id) {
      const creatorSockets = this.connectedUsers.get(task.createdBy);
      if (creatorSockets) {
        creatorSockets.forEach((socketId) => {
          this.io
            .of('/task-notifications')
            .to(socketId)
            .emit('personal_task_notification', {
              ...notification,
              personal: true,
              reason: 'task_you_created',
            });
        });
      }
    }
  }

  private generateNotificationMessage(type: TaskNotification['type'], data: any): string {
    const actorName = data.actor?.name || 'Someone';
    const taskTitle = data.task?.title || 'a task';

    switch (type) {
      case 'task_created':
        return `${actorName} created "${taskTitle}"`;
      case 'task_updated':
        return `${actorName} updated "${taskTitle}"`;
      case 'task_assigned':
        const assigneeName =
          data.task.assigneeType === 'human'
            ? data.task.assignedToUser?.name
            : data.task.assignedToAgent?.name;
        return `${actorName} assigned "${taskTitle}" to ${assigneeName}`;
      case 'task_status_changed':
        const newStatus = data.changes?.status?.new?.replace('_', ' ') || 'unknown';
        return `${actorName} moved "${taskTitle}" to ${newStatus}`;
      case 'task_completed':
        return `${actorName} completed "${taskTitle}"`;
      case 'task_deleted':
        return `${actorName} deleted "${taskTitle}"`;
      case 'task_progress_updated':
        const percentage = data.completionPercentage || 0;
        return `${actorName} updated progress on "${taskTitle}" to ${percentage}%`;
      default:
        return `${actorName} updated "${taskTitle}"`;
    }
  }

  // Public methods for triggering notifications
  public broadcastTaskCreated(taskId: string, projectId: string, task: any, actor: any): void {
    this.handleTaskNotification('task_created', { taskId, projectId, task, actor });
  }

  public broadcastTaskUpdated(
    taskId: string,
    projectId: string,
    task: any,
    changes: any,
    actor: any
  ): void {
    this.handleTaskNotification('task_updated', { taskId, projectId, task, changes, actor });
  }

  public broadcastTaskAssigned(taskId: string, projectId: string, task: any, actor: any): void {
    this.handleTaskNotification('task_assigned', { taskId, projectId, task, actor });
  }

  public broadcastTaskStatusChanged(
    taskId: string,
    projectId: string,
    task: any,
    changes: any,
    actor: any
  ): void {
    this.handleTaskNotification('task_status_changed', { taskId, projectId, task, changes, actor });
  }

  public broadcastTaskCompleted(taskId: string, projectId: string, task: any, actor: any): void {
    this.handleTaskNotification('task_completed', { taskId, projectId, task, actor });
  }

  public broadcastTaskDeleted(taskId: string, projectId: string, task: any, actor: any): void {
    this.handleTaskNotification('task_deleted', { taskId, projectId, task, actor });
  }

  public broadcastProjectStatsUpdate(stats: ProjectTaskStats): void {
    this.handleProjectStatsUpdate(stats);
  }

  // Get connection statistics
  public getConnectionStats(): {
    connectedUsers: number;
    projectSubscriptions: number;
    taskSubscriptions: number;
    totalSockets: number;
  } {
    const totalSockets = Array.from(this.connectedUsers.values()).reduce(
      (total, sockets) => total + sockets.size,
      0
    );

    return {
      connectedUsers: this.connectedUsers.size,
      projectSubscriptions: this.projectSubscriptions.size,
      taskSubscriptions: this.taskSubscriptions.size,
      totalSockets,
    };
  }
}
