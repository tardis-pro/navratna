import { EventBusService } from '../eventBusService.js';
import { logger } from '@uaip/utils';

export interface ProjectCreatedEvent {
  projectId: string;
  ownerId: string;
  name: string;
  description?: string;
  agents?: string[];
  timestamp: Date;
}

export interface ProjectTaskAssignedEvent {
  projectId: string;
  taskId: string;
  assignedAgentId?: string;
  assignedUserId?: string;
  timestamp: Date;
}

export interface ProjectToolUsedEvent {
  projectId: string;
  toolId: string;
  agentId?: string;
  userId: string;
  usage: {
    duration?: number;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    success: boolean;
    error?: string;
  };
  timestamp: Date;
}

export class ProjectEventPublisher {
  constructor(private eventBus: EventBusService) {}

  async publishProjectCreated(event: ProjectCreatedEvent): Promise<void> {
    try {
      await this.eventBus.publish('project.created', event);
      logger.info('Published project created event', { projectId: event.projectId });
    } catch (error) {
      logger.error('Failed to publish project created event', {
        error,
        projectId: event.projectId,
      });
      throw error;
    }
  }

  async publishTaskAssigned(event: ProjectTaskAssignedEvent): Promise<void> {
    try {
      await this.eventBus.publish('project.task.assigned', event);
      logger.info('Published task assigned event', { taskId: event.taskId });
    } catch (error) {
      logger.error('Failed to publish task assigned event', { error, taskId: event.taskId });
      throw error;
    }
  }

  async publishToolUsed(event: ProjectToolUsedEvent): Promise<void> {
    try {
      await this.eventBus.publish('project.tool.used', event);
      logger.info('Published tool used event', {
        projectId: event.projectId,
        toolId: event.toolId,
      });
    } catch (error) {
      logger.error('Failed to publish tool used event', { error, projectId: event.projectId });
      throw error;
    }
  }
}

export class ProjectEventSubscriber {
  constructor(private eventBus: EventBusService) {}

  async subscribeToProjectEvents(handlers: {
    onProjectCreated?: (event: ProjectCreatedEvent) => Promise<void>;
    onTaskAssigned?: (event: ProjectTaskAssignedEvent) => Promise<void>;
    onToolUsed?: (event: ProjectToolUsedEvent) => Promise<void>;
  }): Promise<void> {
    if (handlers.onProjectCreated) {
      await this.eventBus.subscribe('project.created', async (message) => {
        await handlers.onProjectCreated!(message.data as ProjectCreatedEvent);
      });
    }

    if (handlers.onTaskAssigned) {
      await this.eventBus.subscribe('project.task.assigned', async (message) => {
        await handlers.onTaskAssigned!(message.data as ProjectTaskAssignedEvent);
      });
    }

    if (handlers.onToolUsed) {
      await this.eventBus.subscribe('project.tool.used', async (message) => {
        await handlers.onToolUsed!(message.data as ProjectToolUsedEvent);
      });
    }
  }
}
