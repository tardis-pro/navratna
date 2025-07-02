/**
 * Event-Driven Discussion Service
 * Replaces direct API calls with event bus communication
 * Zero Trust Architecture Implementation
 */

import { EventEmitter } from 'events';
import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/shared-services';
import { Discussion, Message, TurnStrategy, DiscussionStatus } from '@uaip/types';

interface EventDrivenConfig {
  eventBusService: EventBusService;
  serviceName: string;
  securityLevel: number;
  complianceFlags: string[];
}

export class EventDrivenDiscussionService extends EventEmitter {
  private eventBusService: EventBusService;
  private serviceName: string;
  private securityLevel: number;
  private complianceFlags: string[];
  private pendingRequests = new Map<string, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }>();

  constructor(config: EventDrivenConfig) {
    super();
    this.eventBusService = config.eventBusService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
    this.complianceFlags = config.complianceFlags;

    this.setupEventSubscriptions();
  }

  /**
   * Setup event bus subscriptions for discussion operations
   */
  private setupEventSubscriptions(): void {
    // Subscribe to discussion response events
    this.eventBusService.subscribe('discussion.response', this.handleDiscussionResponse.bind(this));
    this.eventBusService.subscribe('discussion.error', this.handleDiscussionError.bind(this));

    // Subscribe to real-time discussion events
    this.eventBusService.subscribe('discussion.updated', this.handleDiscussionUpdate.bind(this));
    this.eventBusService.subscribe('discussion.message.added', this.handleMessageAdded.bind(this));
    this.eventBusService.subscribe('discussion.turn.changed', this.handleTurnChanged.bind(this));

    // Subscribe to agent events
    this.eventBusService.subscribe('agent.joined', this.handleAgentJoined.bind(this));
    this.eventBusService.subscribe('agent.left', this.handleAgentLeft.bind(this));
    this.eventBusService.subscribe('agent.response', this.handleAgentResponse.bind(this));

    logger.info('Event-driven discussion service subscriptions configured', {
      service: this.serviceName,
      subscriptions: [
        'discussion.response',
        'discussion.error',
        'discussion.updated',
        'discussion.message.added',
        'discussion.turn.changed',
        'agent.joined',
        'agent.left',
        'agent.response'
      ]
    });
  }

  /**
   * Create a discussion through event bus
   */
  async createDiscussion(data: any, userId: string): Promise<Discussion> {
    const requestId = this.generateRequestId();

    const event = {
      requestId,
      operation: 'create_discussion',
      data,
      userId,
      source: this.serviceName,
      timestamp: new Date().toISOString(),
      securityLevel: this.securityLevel
    };

    return this.publishAndWait('discussion.command.create', event, requestId);
  }

  /**
   * Get a discussion through event bus
   */
  async getDiscussion(discussionId: string, userId: string): Promise<Discussion | null> {
    const requestId = this.generateRequestId();

    const event = {
      requestId,
      operation: 'get_discussion',
      discussionId,
      userId,
      source: this.serviceName,
      timestamp: new Date().toISOString(),
      securityLevel: this.securityLevel
    };

    return this.publishAndWait('discussion.query.get', event, requestId);
  }

  /**
   * Update discussion status through event bus
   */
  async updateDiscussionStatus(discussionId: string, status: DiscussionStatus, userId: string): Promise<void> {
    const event = {
      operation: 'update_status',
      discussionId,
      status,
      userId,
      source: this.serviceName,
      timestamp: new Date().toISOString(),
      securityLevel: this.securityLevel
    };

    await this.eventBusService.publish('discussion.command.update_status', event);

    this.auditLog('DISCUSSION_STATUS_UPDATED', {
      discussionId,
      status,
      userId
    });
  }

  /**
   * Start a discussion through event bus
   */
  async startDiscussion(discussionId: string, userId: string): Promise<void> {
    const event = {
      operation: 'start_discussion',
      discussionId,
      userId,
      source: this.serviceName,
      timestamp: new Date().toISOString(),
      securityLevel: this.securityLevel
    };

    await this.eventBusService.publish('discussion.command.start', event);

    this.auditLog('DISCUSSION_STARTED', {
      discussionId,
      userId
    });
  }

  /**
   * End a discussion through event bus
   */
  async endDiscussion(discussionId: string, userId: string): Promise<void> {
    const event = {
      operation: 'end_discussion',
      discussionId,
      userId,
      source: this.serviceName,
      timestamp: new Date().toISOString(),
      securityLevel: this.securityLevel
    };

    await this.eventBusService.publish('discussion.command.end', event);

    this.auditLog('DISCUSSION_ENDED', {
      discussionId,
      userId
    });
  }

  /**
   * Add message to discussion through event bus
   */
  async addMessage(discussionId: string, message: Partial<Message>, userId: string): Promise<Message> {
    const requestId = this.generateRequestId();

    const event = {
      requestId,
      operation: 'add_message',
      discussionId,
      message,
      userId,
      source: this.serviceName,
      timestamp: new Date().toISOString(),
      securityLevel: this.securityLevel
    };

    return this.publishAndWait('discussion.command.add_message', event, requestId);
  }

  /**
   * Update turn strategy through event bus
   */
  async updateTurnStrategy(discussionId: string, strategy: TurnStrategy, userId: string): Promise<void> {
    const event = {
      operation: 'update_turn_strategy',
      discussionId,
      strategy,
      userId,
      source: this.serviceName,
      timestamp: new Date().toISOString(),
      securityLevel: this.securityLevel
    };

    await this.eventBusService.publish('discussion.command.update_turn_strategy', event);

    this.auditLog('TURN_STRATEGY_UPDATED', {
      discussionId,
      strategy: strategy,
      userId
    });
  }

  /**
   * Add agent to discussion through event bus
   */
  async addAgentToDiscussion(discussionId: string, agentId: string, userId: string): Promise<void> {
    const event = {
      operation: 'add_agent',
      discussionId,
      agentId,
      userId,
      source: this.serviceName,
      timestamp: new Date().toISOString(),
      securityLevel: this.securityLevel
    };

    await this.eventBusService.publish('discussion.command.add_agent', event);

    this.auditLog('AGENT_ADDED_TO_DISCUSSION', {
      discussionId,
      agentId,
      userId
    });
  }

  /**
   * Remove agent from discussion through event bus
   */
  async removeAgentFromDiscussion(discussionId: string, agentId: string, userId: string): Promise<void> {
    const event = {
      operation: 'remove_agent',
      discussionId,
      agentId,
      userId,
      source: this.serviceName,
      timestamp: new Date().toISOString(),
      securityLevel: this.securityLevel
    };

    await this.eventBusService.publish('discussion.command.remove_agent', event);

    this.auditLog('AGENT_REMOVED_FROM_DISCUSSION', {
      discussionId,
      agentId,
      userId
    });
  }

  /**
   * Publish event and wait for response with timeout
   */
  private async publishAndWait<T>(channel: string, event: any, requestId: string, timeout = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${requestId}`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });

      // Publish event
      this.eventBusService.publish(channel, event).catch(error => {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(requestId);
        reject(error);
      });
    });
  }

  /**
   * Handle discussion response events
   */
  private handleDiscussionResponse(event: any): void {
    const { requestId, data, error } = event;
    const pending = this.pendingRequests.get(requestId);

    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(data);
      }
    }
  }

  /**
   * Handle discussion error events
   */
  private handleDiscussionError(event: any): void {
    const { requestId, error } = event;
    const pending = this.pendingRequests.get(requestId);

    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.reject(new Error(error));
    }
  }

  /**
   * Handle real-time discussion updates
   */
  private handleDiscussionUpdate(event: any): void {
    this.emit('discussion_updated', event);
  }

  /**
   * Handle message added events
   */
  private handleMessageAdded(event: any): void {
    this.emit('message_added', event);
  }

  /**
   * Handle turn changed events
   */
  private handleTurnChanged(event: any): void {
    this.emit('turn_changed', event);
  }

  /**
   * Handle agent joined events
   */
  private handleAgentJoined(event: any): void {
    this.emit('agent_joined', event);
  }

  /**
   * Handle agent left events
   */
  private handleAgentLeft(event: any): void {
    this.emit('agent_left', event);
  }

  /**
   * Handle agent response events
   */
  private handleAgentResponse(event: any): void {
    this.emit('agent_response', event);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Compliance audit logging
   */
  private auditLog(event: string, data: any): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true,
      complianceFlags: this.complianceFlags
    });
  }

  /**
   * Cleanup pending requests
   */
  public cleanup(): void {
    // Clear all pending requests
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Service shutting down'));
    }
    this.pendingRequests.clear();

    // Remove all listeners
    this.removeAllListeners();

    logger.info('Event-driven discussion service cleaned up');
  }
}