import { EventBusService } from '../event_bus_service';
import { logger } from '@uaip/utils';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isProjectCreatedEvent(v: unknown): v is ProjectCreatedEvent {
  return isRecord(v) && typeof v.projectId === 'string' && typeof v.ownerId === 'string';
}

function isProjectTaskAssignedEvent(v: unknown): v is ProjectTaskAssignedEvent {
  return isRecord(v) && typeof v.projectId === 'string' && typeof v.taskId === 'string';
}

function isProjectToolUsedEvent(v: unknown): v is ProjectToolUsedEvent {
  return isRecord(v) && typeof v.projectId === 'string' && typeof v.toolId === 'string';
}

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
        if (isProjectCreatedEvent(message.data)) {
          await handlers.onProjectCreated!(message.data);
        }
      });
    }

    if (handlers.onTaskAssigned) {
      await this.eventBus.subscribe('project.task.assigned', async (message) => {
        if (isProjectTaskAssignedEvent(message.data)) {
          await handlers.onTaskAssigned!(message.data);
        }
      });
    }

    if (handlers.onToolUsed) {
      await this.eventBus.subscribe('project.tool.used', async (message) => {
        if (isProjectToolUsedEvent(message.data)) {
          await handlers.onToolUsed!(message.data);
        }
      });
    }
  }
}
