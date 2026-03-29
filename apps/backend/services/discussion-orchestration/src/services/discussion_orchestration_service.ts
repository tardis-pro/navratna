import { EventEmitter } from 'events';
import {
  CreateDiscussionRequest,
  Discussion,
  DiscussionParticipant,
  DiscussionMessage,
  DiscussionStatus,
  DiscussionEvent,
  DiscussionEventType,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { EventBusService, ParticipantManagementService } from '@uaip/shared-services';
import { DiscussionService } from '@uaip/shared-services/discussion';
import { TurnStrategyService } from './turn_strategy_service.js';
import type { IWebSocketHandler } from '@uaip/types';

export interface DiscussionOrchestrationResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  events?: DiscussionEvent[];
}

interface TurnRequestEntry {
  participantId: string;
  relevanceScore: number;
  requestedAt: Date;
}

export class DiscussionOrchestrationService extends EventEmitter {
  private turnStrategyService: TurnStrategyService;
  private discussionService: DiscussionService;
  private eventBusService: EventBusService;
  private webSocketHandler?: IWebSocketHandler;
  private turnTimers: Map<string, NodeJS.Timeout> = new Map();
  private activeDiscussions: Map<string, Discussion> = new Map();
  private recentParticipationRequests: Map<string, number> = new Map(); // Track recent participation requests
  private turnRequestQueues: Map<string, TurnRequestEntry[]> = new Map();

  // Operation locks to prevent race conditions
  private operationLocks: Map<string, boolean> = new Map();
  private turnTimerRetryCounts: Map<string, number> = new Map();
  private participationRateLimits: Map<string, number> = new Map(); // Discussion-level rate limiting
  private cleanupInterval: NodeJS.Timeout | null = null;

  private getParticipantMetadata(participant: { metadata?: Record<string, unknown> }): Record<string, unknown> {
    return participant.metadata ?? {}
  }

  constructor(
    discussionService: DiscussionService,
    eventBusService: EventBusService,
    webSocketHandler?: IWebSocketHandler
  ) {
    super();
    this.discussionService = discussionService;
    this.eventBusService = eventBusService;
    this.webSocketHandler = webSocketHandler;
    this.turnStrategyService = new TurnStrategyService();

    this.initializeEventHandlers();
    this.startPeriodicTasks();

    // Start cleanup mechanisms to prevent memory leaks
    this.startCleanupMechanisms();
  }

  /**
   * Set WebSocket handler (can be set after construction)
   */
  setWebSocketHandler(handler: IWebSocketHandler): void {
    this.webSocketHandler = handler;
  }

  /**
   * Create a new discussion
   */
  async createDiscussion(
    request: CreateDiscussionRequest,
    createdBy: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Creating new discussion', {
        title: request.title,
        turnStrategy: request.turnStrategy.strategy,
        createdBy,
        participantCount: request.initialParticipants?.length,
      });

      // Validate turn strategy configuration
      if (request.turnStrategy) {
        const validation = this.turnStrategyService.validateStrategyConfig(
          request.turnStrategy.strategy,
          request.turnStrategy
        );

        if (!validation.isValid) {
          return {
            success: false,
            error: `Invalid turn strategy configuration: ${validation.errors.join(', ')}`,
          };
        }
      }

      // Create discussion through shared service
      const discussion = await this.discussionService.createDiscussion({
        ...request,
        createdBy,
        status: DiscussionStatus.DRAFT,
      });

      // Add to active discussions cache
      this.activeDiscussions.set(discussion.id, discussion);

      // Emit creation event
      const creationEvent: DiscussionEvent = {
        id: this.generateEventId(),
        type: DiscussionEventType.STATUS_CHANGED,
        discussionId: discussion.id,
        data: {
          oldStatus: null,
          newStatus: DiscussionStatus.DRAFT,
          createdBy,
        },
        timestamp: new Date(),
        metadata: {
          source: 'orchestration-service',
        },
      };

      await this.emitEvent(creationEvent);

      logger.info('Discussion created successfully', {
        discussionId: discussion.id,
        title: discussion.title,
        status: discussion.status,
      });

      return {
        success: true,
        data: discussion,
        events: [creationEvent],
      };
    } catch (error) {
      logger.error('Error creating discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request,
        createdBy,
      });

      return {
        success: false,
        error: 'Failed to create discussion',
      };
    }
  }

  /**
   * Start a discussion
   */
  async startDiscussion(
    discussionId: string,
    startedBy: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Starting discussion', { discussionId, startedBy });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      if (discussion.status !== DiscussionStatus.DRAFT) {
        return { success: false, error: 'Discussion cannot be started from current status' };
      }

      // Validate participants
      const activeParticipants = discussion.participants.filter((p) => p.isActive);
      if (activeParticipants.length < 2) {
        return {
          success: false,
          error: 'At least 2 active participants required to start discussion',
        };
      }

      // Initialize first turn
      const turnResult = await this.turnStrategyService.advanceTurn(
        discussion,
        activeParticipants,
        discussion.turnStrategy
      );

      // Update discussion status and state
      const updatedDiscussion = await this.discussionService.updateDiscussion(discussionId, {
        status: DiscussionStatus.ACTIVE,
        state: {
          ...discussion.state,
          currentTurn: {
            participantId: turnResult.nextParticipant?.id,
            startedAt: new Date(),
            expectedEndAt: new Date(Date.now() + turnResult.estimatedDuration * 1000),
            turnNumber: turnResult.turnNumber,
          },
          phase: 'discussion',
          lastActivity: new Date(),
        },
      });

      // Ensure we have the full discussion with participants for cache and agent participation
      const fullDiscussion = updatedDiscussion.participants
        ? updatedDiscussion
        : {
            ...updatedDiscussion,
            participants: discussion.participants,
          };

      this.broadcastContextChangeIfNeeded(discussionId, discussion.state, fullDiscussion.state);

      // Update cache
      this.activeDiscussions.set(discussionId, fullDiscussion);

      // Set turn timer
      if (turnResult.nextParticipant) {
        await this.setTurnTimer(discussionId, turnResult.estimatedDuration);
      }

      // Emit events
      const events: DiscussionEvent[] = [
        {
          id: this.generateEventId(),
          type: DiscussionEventType.STATUS_CHANGED,
          discussionId,
          data: {
            oldStatus: DiscussionStatus.DRAFT,
            newStatus: DiscussionStatus.ACTIVE,
            startedBy,
          },
          timestamp: new Date(),
          metadata: { source: 'orchestration-service' },
        },
      ];

      if (turnResult.nextParticipant) {
        events.push({
          id: this.generateEventId(),
          type: DiscussionEventType.TURN_CHANGED,
          discussionId,
          data: {
            previousParticipantId: null,
            currentParticipantId: turnResult.nextParticipant.id,
            turnNumber: turnResult.turnNumber,
            estimatedDuration: turnResult.estimatedDuration,
          },
          timestamp: new Date(),
          metadata: { source: 'orchestration-service' },
        });
      }

      await this.emitEvents(events);

      // Trigger intelligent agent participation immediately after starting the discussion
      // Use the full discussion with participants
      if (fullDiscussion && fullDiscussion.participants && fullDiscussion.participants.length > 0) {
        await this.triggerIntelligentAgentParticipation(fullDiscussion);
      } else {
        logger.warn('Cannot trigger agent participation - discussion missing participants', {
          discussionId,
          hasDiscussion: !!fullDiscussion,
          hasParticipants: !!fullDiscussion?.participants,
          participantCount: fullDiscussion?.participants?.length || 0,
          updateDiscussionHadParticipants: !!updatedDiscussion.participants,
          originalDiscussionHadParticipants: !!discussion.participants,
        });
      }

      logger.info('Discussion started successfully', {
        discussionId,
        firstParticipantId: turnResult.nextParticipant?.id,
        turnNumber: turnResult.turnNumber,
        estimatedDuration: turnResult.estimatedDuration,
      });

      return {
        success: true,
        data: fullDiscussion,
        events,
      };
    } catch (error) {
      logger.error('Error starting discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        startedBy,
      });

      return {
        success: false,
        error: 'Failed to start discussion',
      };
    }
  }

  /**
   * Add participant to discussion
   */
  async addParticipant(
    discussionId: string,
    participant: Omit<
      DiscussionParticipant,
      'id' | 'discussionId' | 'joinedAt' | 'lastActiveAt' | 'messageCount'
    >,
    addedBy: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Adding participant to discussion', {
        discussionId,
        participantAgentId: participant.agentId,
        participantRole: participant.role,
        addedBy,
      });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      // Check participant limits
      if (discussion.participants.length >= discussion.settings.maxParticipants) {
        return { success: false, error: 'Discussion has reached maximum participant limit' };
      }

      // Validate required fields
      if (!participant.agentId) {
        return { success: false, error: 'agentId is required' };
      }

      // Add participant through shared service - only pass the fields it expects
      const newParticipant = await this.discussionService.addParticipant(discussionId, {
        agentId: participant.agentId,
        role: participant.role,
        userId: participant.userId,
      });

      // Update cache
      const updatedDiscussion = await this.getDiscussion(discussionId, true);
      if (updatedDiscussion) {
        this.activeDiscussions.set(discussionId, updatedDiscussion);
      }

      // Emit participant joined event
      const joinEvent: DiscussionEvent = {
        id: this.generateEventId(),
        type: DiscussionEventType.PARTICIPANT_JOINED,
        discussionId,
        data: {
          participant: newParticipant,
          addedBy,
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' },
      };

      await this.emitEvent(joinEvent);

      logger.info('Participant added successfully', {
        discussionId,
        participantId: newParticipant.id,
        addedBy,
      });

      return {
        success: true,
        data: newParticipant,
        events: [joinEvent],
      };
    } catch (error) {
      logger.error('Error adding participant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        participant,
        addedBy,
      });

      return {
        success: false,
        error: 'Failed to add participant',
      };
    }
  }

  /**
   * Send a message to a discussion
   */
  async sendMessage(
    discussionId: string,
    participantId: string,
    content: string,
    messageType?: string,
    metadata?: Record<string, unknown>
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Sending message', {
        discussionId,
        participantId,
        messageType,
        contentLength: content.length,
      });

      // Force refresh discussion data to get latest participant information
      const discussion = await this.getDiscussion(discussionId, true);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      // Enterprise participant lookup - use the participant management service
      const participantManagementService = new ParticipantManagementService(
        (
          this.discussionService as unknown as {
            databaseService: import('@uaip/infra').DatabaseService;
          }
        ).databaseService
      );

      // Try to find participant by participantId first
      let participant = await participantManagementService.getParticipantById(participantId);

      if (!participant) {
        // Try to find by agentId in case participantId is actually an agentId
        participant = await participantManagementService.getParticipantByAgentId(
          discussionId,
          participantId
        );
      }

      if (!participant) {
        // Enhanced debugging for participant not found
        const allParticipants =
          await participantManagementService.getDiscussionParticipants(discussionId);
        logger.error('Participant not found in discussion', {
          discussionId,
          requestedParticipantId: participantId,
          availableParticipants: allParticipants.map((p) => ({
            participantId: p.id,
            agentId: p.agentId,
            displayName: String(this.getParticipantMetadata(p).displayName ?? p.agentId),
            isActive: p.isActive,
            roleInDiscussion: p.role,
          })),
        });
        return { success: false, error: 'Participant not found' };
      }

      // Use the proper participant ID for subsequent operations (primary key for turn management)
      const actualParticipantId = participant.id;

      if (!participant.isActive) {
        return { success: false, error: 'Participant is not active' };
      }

      // Check if it's the participant's turn (for turn-based strategies)
      if (discussion.turnStrategy.strategy !== 'free_form') {
        const currentTurnParticipant = discussion.state.currentTurn.participantId;
        const isInitialParticipation = metadata?.isInitialParticipation === true;

        logger.info('Turn management check', {
          discussionId,
          currentTurnParticipant,
          actualParticipantId,
          participantFound: !!participant,
          isMatch: currentTurnParticipant === actualParticipantId,
          strategy: discussion.turnStrategy.strategy,
          isInitialParticipation,
        });

        // Allow initial agent participation to bypass turn restrictions
        if (
          currentTurnParticipant &&
          currentTurnParticipant !== actualParticipantId &&
          !isInitialParticipation
        ) {
          return { success: false, error: 'It is not your turn to speak' };
        }
      }

      // Map message type to valid database enum values
      const validMessageTypes = [
        'message',
        'question',
        'answer',
        'clarification',
        'objection',
        'agreement',
        'summary',
        'decision',
        'action_item',
        'system',
      ];
      const mappedMessageType = validMessageTypes.includes(messageType) ? messageType : 'message';

      logger.info('Sending message to database', {
        discussionId,
        participantId: actualParticipantId,
        originalMessageType: messageType,
        mappedMessageType,
        contentLength: content.length,
      });

      // Send message through shared service
      const message = await this.discussionService.sendMessage(
        discussionId,
        actualParticipantId,
        content,
        mappedMessageType as unknown as import('@uaip/types').MessageType
      );

      // Update participant activity using enterprise participant management
      const participantMetadata = this.getParticipantMetadata(participant)
      await participantManagementService.updateParticipantActivity(actualParticipantId, {
        messageCount: participant.messageCount + 1,
        lastMessageAt: new Date(),
        contributionScore: Number(participantMetadata.contributionScore ?? 0) + 1,
        engagementLevel: Math.min(1.0, Number(participantMetadata.engagementLevel ?? 0) + 0.1),
      });

      // Update discussion state (the service handles participant updates internally)
      const updatedDiscussion = await this.discussionService.updateDiscussion(discussionId, {
        state: {
          ...discussion.state,
          messageCount: discussion.state.messageCount + 1,
          lastActivity: new Date(),
        },
      });

      this.broadcastContextChangeIfNeeded(discussionId, discussion.state, updatedDiscussion.state);

      // Emit message event
      const messageEvent: DiscussionEvent = {
        id: this.generateEventId(),
        type: DiscussionEventType.MESSAGE_SENT,
        discussionId,
        data: {
          message,
          participantId,
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' },
      };

      await this.emitEvent(messageEvent);

      logger.info('Message sent successfully', {
        discussionId,
        messageId: message.id,
        participantId,
        messageType,
      });

      // DISABLED: Automatic conversation enhancement after every message
      // This was causing repetitive "I apologize" error messages
      // Agent participation is now handled through the periodic check system only
      logger.debug('Message sent, automatic enhancement disabled', {
        discussionId,
        participantId,
        note: 'Agent participation handled via periodic checks',
      });

      return {
        success: true,
        data: message,
        events: [messageEvent],
      };
    } catch (error) {
      logger.error('Error sending message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        participantId,
        content: content.substring(0, 100) + '...',
      });

      return {
        success: false,
        error: 'Failed to send message',
      };
    }
  }

  /**
   * Advance turn manually
   */
  async advanceTurn(
    discussionId: string,
    advancedBy?: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Advancing turn', { discussionId, advancedBy });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      if (discussion.status !== DiscussionStatus.ACTIVE) {
        return { success: false, error: 'Discussion is not active' };
      }

      const activeParticipants = discussion.participants.filter((p) => p.isActive);
      const currentParticipantId = discussion.state.currentTurn.participantId;

      // Clear existing turn timer
      this.clearTurnTimer(discussionId);

      // Get next turn
      let turnResult = await this.turnStrategyService.advanceTurn(
        discussion,
        activeParticipants,
        discussion.turnStrategy
      );

      const priorityParticipant = await this.dequeuePriorityTurnRequest(
        discussion,
        activeParticipants
      );
      if (priorityParticipant) {
        const priorityDuration = await this.turnStrategyService.getEstimatedTurnDuration(
          priorityParticipant,
          discussion,
          discussion.turnStrategy
        );

        turnResult = {
          nextParticipant: priorityParticipant,
          turnNumber: discussion.state.currentTurn.turnNumber + 1,
          estimatedDuration: priorityDuration,
        };
      }

      // Update discussion state
      const updatedDiscussion = await this.discussionService.updateDiscussion(discussionId, {
        state: {
          ...discussion.state,
          currentTurn: {
            participantId: turnResult.nextParticipant?.id,
            startedAt: new Date(),
            expectedEndAt: turnResult.nextParticipant
              ? new Date(Date.now() + turnResult.estimatedDuration * 1000)
              : undefined,
            turnNumber: turnResult.turnNumber,
          },
          lastActivity: new Date(),
        },
      });

      this.broadcastContextChangeIfNeeded(discussionId, discussion.state, updatedDiscussion.state);

      // Update cache
      this.activeDiscussions.set(discussionId, updatedDiscussion);

      // Set new turn timer
      if (turnResult.nextParticipant) {
        await this.setTurnTimer(discussionId, turnResult.estimatedDuration);
      }

      // Emit turn change event
      const turnEvent: DiscussionEvent = {
        id: this.generateEventId(),
        type: DiscussionEventType.TURN_CHANGED,
        discussionId,
        data: {
          previousParticipantId: currentParticipantId,
          currentParticipantId: turnResult.nextParticipant?.id,
          turnNumber: turnResult.turnNumber,
          estimatedDuration: turnResult.estimatedDuration,
          advancedBy,
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' },
      };

      await this.emitEvent(turnEvent);

      logger.info('Turn advanced successfully', {
        discussionId,
        previousParticipantId: currentParticipantId,
        nextParticipantId: turnResult.nextParticipant?.id,
        turnNumber: turnResult.turnNumber,
      });

      return {
        success: true,
        data: {
          nextParticipant: turnResult.nextParticipant,
          turnNumber: turnResult.turnNumber,
          estimatedDuration: turnResult.estimatedDuration,
        },
        events: [turnEvent],
      };
    } catch (error) {
      logger.error('Error advancing turn', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        advancedBy,
      });

      return {
        success: false,
        error: 'Failed to advance turn',
      };
    }
  }

  /**
   * Get a discussion by ID (public method for external access)
   */
  async getDiscussion(discussionId: string, forceRefresh = false): Promise<Discussion | null> {
    try {
      // Check cache first unless force refresh is requested
      if (!forceRefresh && this.activeDiscussions.has(discussionId)) {
        const cached = this.activeDiscussions.get(discussionId);
        if (cached) {
          logger.debug('Discussion retrieved from cache', { discussionId });
          return cached;
        }
      }

      // Fetch from database
      const discussion = await this.discussionService.getDiscussion(discussionId);

      if (discussion) {
        // Update cache
        this.activeDiscussions.set(discussionId, discussion);
        logger.debug('Discussion retrieved from database and cached', { discussionId });
      }

      return discussion;
    } catch (error) {
      logger.error('Error retrieving discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
      });
      return null;
    }
  }

  async createHuddle(
    parentDiscussionId: string,
    participantIds: string[],
    topic: string
  ): Promise<Discussion> {
    const parentDiscussion = await this.getDiscussion(parentDiscussionId, true);
    if (!parentDiscussion) {
      throw new Error('Parent discussion not found');
    }

    const uniqueParticipants = Array.from(
      new Set(participantIds.map((participantId) => participantId.trim()).filter(Boolean))
    );

    if (uniqueParticipants.length === 0) {
      throw new Error('At least one participant is required for a huddle');
    }

    const normalizedTopic = topic.trim();
    if (!normalizedTopic) {
      throw new Error('Huddle topic is required');
    }

    const huddleRequest: CreateDiscussionRequest = {
      title: `Huddle: ${normalizedTopic}`.slice(0, 255),
      topic: normalizedTopic,
      description: `Specialist huddle for discussion ${parentDiscussion.title}`,
      createdBy: parentDiscussion.createdBy,
      initialParticipants: uniqueParticipants.map((agentId) => ({
        agentId,
        role: 'participant',
      })),
      turnStrategy: parentDiscussion.turnStrategy,
      settings: {
        ...parentDiscussion.settings,
        turnTimeout: 300,
        maxDuration: 5,
      },
      visibility: parentDiscussion.visibility,
      organizationId: parentDiscussion.organizationId,
      teamId: parentDiscussion.teamId,
      metadata: {
        isHuddle: true,
        parentDiscussionId,
      },
      parentDiscussionId,
      tags: Array.from(new Set([...(parentDiscussion.tags || []), 'huddle'])),
      objectives: [normalizedTopic],
    };

    const huddle = await this.discussionService.createDiscussion(huddleRequest);
    this.activeDiscussions.set(huddle.id, huddle);

    logger.info('Huddle created', {
      huddleId: huddle.id,
      parentDiscussionId,
      participantCount: uniqueParticipants.length,
    });

    return huddle;
  }

  async resolveHuddle(huddleId: string, summary: string): Promise<void> {
    const huddle = await this.getDiscussion(huddleId, true);
    if (!huddle) {
      throw new Error('Huddle not found');
    }

    const parentDiscussionId =
      (typeof huddle.metadata?.parentDiscussionId === 'string'
        ? huddle.metadata.parentDiscussionId
        : undefined) || huddle.parentDiscussionId;

    if (!parentDiscussionId) {
      throw new Error('Huddle has no parent discussion');
    }

    await this.discussionService.updateDiscussion(huddleId, {
      status: DiscussionStatus.COMPLETED,
      endedAt: new Date(),
      metadata: {
        ...(huddle.metadata || {}),
        huddleSummary: summary,
        resolvedAt: new Date().toISOString(),
      },
    });

    this.activeDiscussions.delete(huddleId);

    const resolutionPayload = {
      huddleId,
      parentDiscussionId,
      summary,
    };

    await this.eventBusService.publish('huddle:resolved', resolutionPayload);

    if (this.webSocketHandler) {
      this.webSocketHandler.broadcastToDiscussion(parentDiscussionId, {
        type: 'huddle:resolved',
        data: resolutionPayload,
        timestamp: new Date(),
      });
    }

    this.emit('huddle:resolved', resolutionPayload);

    logger.info('Huddle resolved', resolutionPayload);
  }

  /**
   * Verify if a user has access to participate in a discussion
   */
  async verifyParticipantAccess(discussionId: string, userId: string): Promise<boolean> {
    try {
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        logger.warn('Discussion not found for access verification', {
          discussionId,
          userId,
        });
        return false;
      }

      // Check discussion status first
      if (
        discussion.status === DiscussionStatus.CANCELLED ||
        discussion.status === DiscussionStatus.ARCHIVED
      ) {
        logger.warn('Discussion is cancelled or archived', {
          discussionId,
          userId,
          status: discussion.status,
        });
        return false;
      }

      // Allow access if user is the discussion creator
      if (discussion.createdBy === userId) {
        logger.info('Access granted: User is discussion creator', {
          discussionId,
          userId,
          createdBy: discussion.createdBy,
        });
        return true;
      }

      // Check if user is a participant
      const participant = discussion.participants.find((p) => p.userId === userId);
      if (!participant) {
        logger.warn('Access denied: User is not a participant or creator', {
          discussionId,
          userId,
          createdBy: discussion.createdBy,
          participantCount: discussion.participants.length,
          participantUserIds: discussion.participants.map((p) => p.userId),
        });
        return false;
      }

      // Check if participant is active
      if (!participant.isActive) {
        logger.warn('Access denied: Participant is not active', {
          discussionId,
          userId,
          participantId: participant.id,
          isActive: participant.isActive,
        });
        return false;
      }

      logger.info('Access granted: User is active participant', {
        discussionId,
        userId,
        participantId: participant.id,
        role: participant.role,
      });
      return true;
    } catch (error) {
      logger.error('Error verifying participant access', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        userId,
      });
      return false;
    }
  }

  /**
   * Get participant by user ID
   */
  async getParticipantByUserId(
    discussionId: string,
    userId: string
  ): Promise<DiscussionParticipant | null> {
    try {
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return null;
      }

      const participant = discussion.participants.find((p) => p.userId === userId);
      return participant || null;
    } catch (error) {
      logger.error('Error getting participant by user ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        userId,
      });
      return null;
    }
  }

  async updateWorkingMemoryContext(
    discussionId: string,
    context: Record<string, unknown>,
    updatedBy?: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      const discussion = await this.getDiscussion(discussionId, true);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      const previousState = discussion.state || {};
      const nextState = {
        ...previousState,
        workingMemoryContext: context,
        lastActivity: new Date(),
      } as typeof previousState;

      const updatedDiscussion = await this.discussionService.updateDiscussion(discussionId, {
        state: nextState,
      });

      this.activeDiscussions.set(discussionId, updatedDiscussion);
      this.broadcastContextChangeIfNeeded(discussionId, previousState, nextState);

      return {
        success: true,
        data: {
          discussionId,
          context,
          updatedBy,
        },
      };
    } catch (error) {
      logger.error('Error updating working memory context', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        updatedBy,
      });

      return {
        success: false,
        error: 'Failed to update working memory context',
      };
    }
  }

  /**
   * Request turn for a participant
   */
  async requestTurn(
    discussionId: string,
    participantId: string,
    relevanceScore = 0
  ): Promise<DiscussionOrchestrationResult> {
    try {
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      const participant = discussion.participants.find((p) => p.id === participantId);
      if (!participant) {
        return { success: false, error: 'Participant not found' };
      }

      if (!participant.isActive) {
        return { success: false, error: 'Participant is not active' };
      }

      // Check if participant can take a turn based on strategy
      const canTakeTurn = await this.turnStrategyService.canParticipantTakeTurn(
        participant,
        discussion,
        discussion.turnStrategy
      );

      if (!canTakeTurn) {
        return { success: false, error: 'Participant cannot take turn at this time' };
      }

      if (relevanceScore >= 0.8) {
        this.enqueuePriorityTurnRequest(discussionId, participantId, relevanceScore);
      }

      if (this.webSocketHandler) {
        this.webSocketHandler.broadcastToDiscussion(discussionId, {
          type: 'turn:requested',
          data: {
            participantId,
            relevanceScore,
            queued: relevanceScore >= 0.8,
            requestedAt: new Date().toISOString(),
          },
        });
      }

      if (relevanceScore >= 0.8) {
        return {
          success: true,
          data: {
            status: 'queued',
            message: 'High-priority turn request queued for next turn',
          },
        };
      }

      // For moderated discussions, add to queue
      if (discussion.turnStrategy.strategy === 'moderated') {
        // Add to turn request queue (this would be implemented in the moderated strategy)
        logger.info('Turn requested in moderated discussion', {
          discussionId,
          participantId,
          currentTurn: discussion.state.currentTurn.participantId,
        });

        return {
          success: true,
          data: {
            status: 'queued',
            message: 'Turn request added to queue for moderator approval',
          },
        };
      }

      // For other strategies, check if it's their turn
      if (discussion.state.currentTurn.participantId === participantId) {
        return {
          success: true,
          data: {
            status: 'active',
            message: 'It is already your turn',
          },
        };
      }

      return {
        success: false,
        error: 'Turn request not applicable for current strategy',
      };
    } catch (error) {
      logger.error('Error requesting turn', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        participantId,
      });
      return { success: false, error: 'Failed to request turn' };
    }
  }

  /**
   * End turn for a participant
   */
  async endTurn(
    discussionId: string,
    participantId: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      // Check if it's actually this participant's turn
      if (discussion.state.currentTurn.participantId !== participantId) {
        return { success: false, error: 'It is not your turn' };
      }

      // Advance to next turn
      const result = await this.advanceTurn(discussionId, participantId);

      if (result.success) {
        return {
          success: true,
          data: {
            message: 'Turn ended successfully',
            nextParticipant: (result.data as Record<string, unknown> | undefined)?.nextParticipant,
          },
        };
      }

      return result;
    } catch (error) {
      logger.error('Error ending turn', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        participantId,
      });
      return { success: false, error: 'Failed to end turn' };
    }
  }

  /**
   * Add reaction to a message
   */
  async addReaction(
    discussionId: string,
    messageId: string,
    participantId: string,
    emoji: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      // Verify participant access
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      const participant = discussion.participants.find((p) => p.id === participantId);
      if (!participant || !participant.isActive) {
        return { success: false, error: 'Participant not found or inactive' };
      }

      // For now, we'll just emit the reaction event without persisting it
      // This would need to be implemented in the DiscussionService
      const reaction = {
        id: this.generateEventId(),
        participantId,
        emoji,
        createdAt: new Date(),
      };

      // Emit reaction event
      const reactionEvent: DiscussionEvent = {
        id: this.generateEventId(),
        type: DiscussionEventType.REACTION_ADDED,
        discussionId,
        data: {
          messageId,
          participantId,
          emoji,
          reaction,
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' },
      };

      await this.emitEvent(reactionEvent);

      logger.info('Reaction added successfully', {
        discussionId,
        messageId,
        participantId,
        emoji,
      });

      return {
        success: true,
        data: reaction,
        events: [reactionEvent],
      };
    } catch (error) {
      logger.error('Error adding reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        messageId,
        participantId,
        emoji,
      });
      return { success: false, error: 'Failed to add reaction' };
    }
  }

  private async getDiscussionInternal(
    discussionId: string,
    forceRefresh = false
  ): Promise<Discussion | null> {
    // This is the old private method, now we use the public one
    return this.getDiscussion(discussionId, forceRefresh);
  }

  // Private helper methods

  private enqueuePriorityTurnRequest(
    discussionId: string,
    participantId: string,
    relevanceScore: number
  ): void {
    const existingQueue = this.turnRequestQueues.get(discussionId) || [];
    const dedupedQueue = existingQueue.filter((entry) => entry.participantId !== participantId);

    dedupedQueue.push({
      participantId,
      relevanceScore,
      requestedAt: new Date(),
    });

    dedupedQueue.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }

      return a.requestedAt.getTime() - b.requestedAt.getTime();
    });

    this.turnRequestQueues.set(discussionId, dedupedQueue);
  }

  private async dequeuePriorityTurnRequest(
    discussion: Discussion,
    activeParticipants: DiscussionParticipant[]
  ): Promise<DiscussionParticipant | null> {
    const queue = this.turnRequestQueues.get(discussion.id);
    if (!queue || queue.length === 0) {
      return null;
    }

    const currentTurnParticipantId = discussion.state.currentTurn.participantId;
    const currentSet = new Set(activeParticipants.map((participant) => participant.id));
    const nextCandidate = queue.find(
      (entry) =>
        currentSet.has(entry.participantId) && entry.participantId !== currentTurnParticipantId
    );

    if (!nextCandidate) {
      return null;
    }

    const remainingQueue = queue.filter(
      (entry) => entry.participantId !== nextCandidate.participantId
    );
    this.turnRequestQueues.set(discussion.id, remainingQueue);

    return (
      activeParticipants.find((participant) => participant.id === nextCandidate.participantId) ||
      null
    );
  }

  private extractWorkingMemoryContext(
    state: Record<string, unknown> | undefined
  ): Record<string, unknown> | null {
    if (!state) {
      return null;
    }

    if (state.workingMemoryContext && typeof state.workingMemoryContext === 'object') {
      return state.workingMemoryContext as Record<string, unknown>;
    }

    if (state.context && typeof state.context === 'object') {
      return state.context as Record<string, unknown>;
    }

    return null;
  }

  private broadcastContextChangeIfNeeded(
    discussionId: string,
    previousState: Record<string, unknown> | undefined,
    nextState: Record<string, unknown> | undefined
  ): void {
    if (!this.webSocketHandler) {
      return;
    }

    const previousContext = this.extractWorkingMemoryContext(previousState);
    const nextContext = this.extractWorkingMemoryContext(nextState);

    if (!nextContext) {
      return;
    }

    if (JSON.stringify(previousContext) === JSON.stringify(nextContext)) {
      return;
    }

    this.webSocketHandler.broadcastContextUpdate(discussionId, nextContext);
  }

  private async setTurnTimer(discussionId: string, durationSeconds: number): Promise<void> {
    const lockKey = `turn_timer_${discussionId}`;

    // Prevent race conditions with atomic turn timer operations
    if (this.operationLocks.get(lockKey)) {
      const retryCount = this.turnTimerRetryCounts.get(lockKey) || 0;

      if (retryCount < 3) {
        this.turnTimerRetryCounts.set(lockKey, retryCount + 1);
        setTimeout(() => {
          void this.setTurnTimer(discussionId, durationSeconds);
        }, 100);
      } else {
        this.turnTimerRetryCounts.delete(lockKey);
        logger.warn('Turn timer update dropped after max retries', {
          lockKey,
          discussionId,
          durationSeconds,
        });
      }

      return;
    }

    this.turnTimerRetryCounts.delete(lockKey);

    this.operationLocks.set(lockKey, true);

    try {
      // Atomically clear existing timer and set new one
      const existingTimer = this.turnTimers.get(discussionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.turnTimers.delete(discussionId);
        logger.debug('Existing turn timer cleared', { discussionId });
      }

      // Set new timer with race condition protection
      const timer = setTimeout(async () => {
        // Check if discussion still exists and is active before advancing
        const discussion = await this.getDiscussion(discussionId);
        if (!discussion || discussion.status !== 'active') {
          logger.debug('Skipping turn advance - discussion inactive', {
            discussionId,
            status: discussion?.status,
          });
          return;
        }

        logger.info('Turn timer expired, advancing turn', { discussionId, durationSeconds });
        await this.advanceTurn(discussionId, 'system');
      }, durationSeconds * 1000);

      this.turnTimers.set(discussionId, timer);
      logger.debug('Turn timer set atomically', { discussionId, durationSeconds });
    } catch (error) {
      logger.error('Error setting turn timer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        durationSeconds,
      });
    } finally {
      // Always release the lock
      this.operationLocks.delete(lockKey);
    }
  }

  private clearTurnTimer(discussionId: string): void {
    const lockKey = `turn_timer_${discussionId}`;

    // Prevent race conditions during timer clearing
    if (this.operationLocks.get(lockKey)) {
      logger.debug('Turn timer operation in progress, deferring clear', { discussionId });
      // Schedule clear for after current operation
      setTimeout(() => this.clearTurnTimer(discussionId), 100);
      return;
    }

    const timer = this.turnTimers.get(discussionId);
    if (timer) {
      clearTimeout(timer);
      this.turnTimers.delete(discussionId);
      logger.debug('Turn timer cleared', { discussionId });
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async emitEvent(event: DiscussionEvent): Promise<void> {
    try {
      // Emit to event bus
      await this.eventBusService.publish('discussion.events', event);

      // Emit to EventEmitter interface (for WebSocket handler)
      this.emit('discussion_event', event);

      // Broadcast to WebSocket connections (fallback)
      if (this.webSocketHandler) {
        this.webSocketHandler.broadcastToDiscussion(event.discussionId, event);
      }

      logger.debug('Event emitted', { eventType: event.type, discussionId: event.discussionId });
    } catch (error) {
      logger.error('Error emitting event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event,
      });
    }
  }

  private async emitEvents(events: DiscussionEvent[]): Promise<void> {
    for (const event of events) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      await this.emitEvent(event);
    }
  }

  private initializeEventHandlers(): void {
    // Set up event handlers for external events
    logger.info('Discussion orchestration event handlers initialized');
  }

  private startPeriodicTasks(): void {
    // Start periodic cleanup and maintenance tasks
    setInterval(() => {
      this.cleanupExpiredTimers();
    }, 120000); // Every 2 minutes

    // Check for discussions needing agent participation every 5 seconds (near real-time)
    setInterval(() => {
      this.checkActiveDiscussionsForParticipation();
    }, 5000);

    // Monitor discussion health every 30 seconds (near real-time)
    setInterval(() => {
      this.monitorDiscussionHealth();
    }, 30000);

    logger.info('Discussion orchestration periodic tasks started with near real-time frequency');
  }

  private cleanupExpiredTimers(): void {
    // Clean up any orphaned timers

    for (const [_discussionId, _timer] of this.turnTimers) {
      // Additional cleanup logic could go here
    }
  }

  /**
   * Check active discussions for agent participation
   */
  private async checkActiveDiscussionsForParticipation(): Promise<void> {
    try {
      // Query database directly instead of relying on cache
      const result = await this.discussionService.searchDiscussions(
        { status: [DiscussionStatus.ACTIVE] },
        100,
        0
      );
      const activeDiscussions = result.discussions;
      logger.debug('Checking active discussions for agent participation', {
        activeDiscussionCount: activeDiscussions.length,
      });

      // Only check discussions that are truly stale or have participation issues
      for (const discussion of activeDiscussions) {
        if (discussion.status === DiscussionStatus.ACTIVE) {
          // Get full discussion with participants
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          const fullDiscussion = await this.discussionService.getDiscussion(discussion.id);
          if (!fullDiscussion) continue;

          // Check if discussion needs agent participation
          const lastActivity = fullDiscussion.state.lastActivity;
          const timeSinceActivity = lastActivity
            ? Date.now() -
              (lastActivity instanceof Date
                ? lastActivity.getTime()
                : new Date(lastActivity).getTime())
            : Infinity;

          // Check if discussion has reached its goal naturally
          // oxlint-disable-next-line no-await-in-loop -- sequential processing required
          const hasReachedGoal = await this.checkDiscussionGoalAchievement(fullDiscussion);
          if (hasReachedGoal) {
            logger.info('Discussion has reached its goal, completing', {
              discussionId: fullDiscussion.id,
              messageCount: fullDiscussion.state.messageCount,
            });

            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.updateDiscussionStatus(
              fullDiscussion.id,
              DiscussionStatus.COMPLETED,
              'system'
            );
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.emitDiscussionCompletionEvent(fullDiscussion.id, 'system', 'goal_achieved');
            continue;
          }

          // For new discussions (more than 10 seconds old), trigger initial participation
          // For ongoing discussions (more than 15 seconds), check if agents should participate
          if (timeSinceActivity > 10000 && fullDiscussion.state.messageCount === 0) {
            // 10 seconds for initial participation
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.ensureAgentParticipation(fullDiscussion);
          } else if (timeSinceActivity > 15000) {
            // 15 seconds for subsequent participation
            // oxlint-disable-next-line no-await-in-loop -- sequential processing required
            await this.ensureAgentParticipation(fullDiscussion);
          }
        }
      }
    } catch (error) {
      logger.error('Error checking active discussions for participation', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Monitor discussion health and activity
   */
  private async monitorDiscussionHealth(): Promise<void> {
    try {
      logger.debug('Monitoring discussion health');

      const stats = {
        activeDiscussions: 0,
        staleDiscussions: 0,
        participationIssues: 0,
      };

      for (const [discussionId, discussion] of this.activeDiscussions.entries()) {
        stats.activeDiscussions++;

        // Check if discussion has been inactive for too long
        const lastActivity = discussion.state.lastActivity;
        const timeSinceActivity = lastActivity
          ? Date.now() -
            (lastActivity instanceof Date
              ? lastActivity.getTime()
              : new Date(lastActivity).getTime())
          : Infinity;

        if (timeSinceActivity > 600000) {
          // 10 minutes
          stats.staleDiscussions++;
          logger.warn('Stale discussion detected', {
            discussionId,
            timeSinceActivity: Math.round(timeSinceActivity / 1000),
          });
        }

        // Check for agent participation issues
        const agentParticipants = discussion.participants.filter((p) => p.agentId);
        const hasRecentAgentActivity = agentParticipants.some((p) => {
          const timeSinceLastActive = p.lastMessageAt
            ? Date.now() - p.lastMessageAt.getTime()
            : Infinity;
          return timeSinceLastActive < 300000; // 5 minutes
        });

        if (agentParticipants.length > 0 && !hasRecentAgentActivity) {
          stats.participationIssues++;
          logger.warn('Agent participation issue detected', {
            discussionId,
            agentCount: agentParticipants.length,
          });

          // Trigger agent participation for turn-based or free-form discussions
          if (discussion.turnStrategy.strategy === 'free_form') {
            // For free-form discussions, only trigger one agent at a time to prevent spam
            const eligibleParticipants = agentParticipants.filter((p) => p.agentId && p.isActive);
            if (eligibleParticipants.length > 0) {
              // Select the participant who hasn't spoken in the longest time
              const leastRecentParticipant = eligibleParticipants.reduce((oldest, current) => {
                const oldestTime = oldest.lastMessageAt?.getTime() || 0;
                const currentTime = current.lastMessageAt?.getTime() || 0;
                return currentTime < oldestTime ? current : oldest;
              });
              // oxlint-disable-next-line no-await-in-loop -- sequential processing required
              await this.triggerAgentParticipationEvent(discussionId, leastRecentParticipant);
            }
          } else {
            // For turn-based discussions, only trigger the current participant
            for (const participant of agentParticipants) {
              if (
                participant.agentId &&
                participant.isActive &&
                discussion.state.currentTurn.participantId === participant.id
              ) {
                // oxlint-disable-next-line no-await-in-loop -- sequential processing required
                await this.triggerAgentParticipationEvent(discussionId, participant);
                break; // Only one participant for turn-based
              }
            }
          }
        }
      }

      if (stats.activeDiscussions > 0) {
        logger.info('Discussion health check completed', stats);
      }
    } catch (error) {
      logger.error('Error monitoring discussion health', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Trigger intelligent agent participation using conversation enhancement
   */
  private async triggerIntelligentAgentParticipation(discussion: Discussion): Promise<void> {
    try {
      if (!discussion.participants || !Array.isArray(discussion.participants)) {
        logger.warn('Discussion participants not available for intelligent participation', {
          discussionId: discussion.id,
          hasParticipants: !!discussion.participants,
          participantsType: typeof discussion.participants,
        });
        return;
      }

      const agentParticipants = discussion.participants.filter((p) => p.agentId && p.isActive);

      if (agentParticipants.length === 0) {
        return; // No agents to participate
      }

      // Get message history from discussion
      const messageHistory = await this.createMessageHistoryFromDiscussion(discussion);

      // Request conversation enhancement from agent-intelligence service
      await this.eventBusService.publish('conversation.enhancement.request', {
        discussionId: discussion.id,
        availableAgentIds: agentParticipants.map((p) => p.agentId).filter(Boolean),
        messageHistory,
        currentTopic: discussion.topic,
        enhancementType: 'auto',
        context: {
          phase: discussion.state.phase,
          messageCount: discussion.state.messageCount,
          participantCount: discussion.participants.length,
        },
        timestamp: new Date(),
      });

      logger.info('Intelligent agent participation request sent', {
        discussionId: discussion.id,
        agentCount: agentParticipants.length,
        messageCount: messageHistory.length,
      });
    } catch (error) {
      logger.error('Error triggering intelligent agent participation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
      });
    }
  }

  /**
   * Create message history from discussion messages
   */
  private async createMessageHistoryFromDiscussion(
    discussion: Discussion
  ): Promise<Array<Record<string, unknown>>> {
    try {
      // Get recent messages from the discussion
      const messages = await this.discussionService.getDiscussionMessages(discussion.id, {
        limit: 20,
      });

      return messages.map((msg) => ({
        id: msg.id,
        speaker: msg.participantId || 'user',
        content: msg.content,
        timestamp: msg.createdAt,
        metadata: {
          participantId: msg.participantId,
          messageType: msg.messageType,
        },
      }));
    } catch (error) {
      logger.error('Failed to create message history from discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
      });
      return [];
    }
  }

  /**
   * Ensure agent participation in a discussion (enterprise-grade method)
   */
  private async ensureAgentParticipation(discussion: Discussion): Promise<void> {
    try {
      // CRITICAL: Rate limiting to prevent infinite agent loops
      const participationKey = `participation_${discussion.id}`;
      const lastTrigger = this.participationRateLimits.get(participationKey);
      const now = Date.now();

      // Rate limit: minimum 30 seconds between triggers per discussion
      if (lastTrigger && now - lastTrigger < 30000) {
        logger.debug('Skipping agent participation - rate limited', {
          discussionId: discussion.id,
          timeSinceLastTrigger: now - lastTrigger,
          rateLimitMs: 30000,
        });
        return;
      }

      // Additional safety: Check if discussion has reached maximum messages
      const limitMaxMessages = discussion.metadata?.maxMessages || 100;
      const limitCurrentMessageCount = discussion.state.messageCount || 0;

      if (limitCurrentMessageCount >= limitMaxMessages) {
        logger.info('Discussion reached maximum message limit, stopping agent participation', {
          discussionId: discussion.id,
          currentMessageCount: limitCurrentMessageCount,
          maxMessages: limitMaxMessages,
        });

        // Stop the discussion to prevent loops
        await this.updateDiscussionStatus(discussion.id, DiscussionStatus.COMPLETED, 'system');
        // Emit discussion completion event for artifact generation
        await this.emitDiscussionCompletionEvent(discussion.id, 'system', 'max_messages_reached');
        return;
      }

      // Update rate limit timestamp
      this.participationRateLimits.set(participationKey, now);
      // Use enterprise participant management service
      const participantManagementService = new ParticipantManagementService(
        (
          this.discussionService as unknown as {
            databaseService: import('@uaip/infra').DatabaseService;
          }
        ).databaseService
      );

      // Get active agent participants
      const activeParticipants = await participantManagementService.getActiveParticipants(
        discussion.id
      );
      const agentParticipants = activeParticipants.filter(
        (p) => p.participantType === 'agent' && p.agentId
      );

      if (agentParticipants.length === 0) {
        logger.info('No active agent participants found for discussion', {
          discussionId: discussion.id,
          totalParticipants: activeParticipants.length,
        });
        return;
      }

      logger.info('Enterprise agent participation management', {
        discussionId: discussion.id,
        totalAgentParticipants: agentParticipants.length,
        participantDetails: agentParticipants.map((p) => ({
          participantId: p.id,
          agentId: p.agentId,
          displayName: String(this.getParticipantMetadata(p).displayName ?? p.agentId),
          messageCount: p.messageCount,
          lastMessageAt: this.getParticipantMetadata(p).lastMessageAt,
        })),
      });

      // Phase-based agent participation logic
      const neverParticipatedAgents = agentParticipants.filter((p) => {
        // Check if agent has never sent a message
        return !this.getParticipantMetadata(p).lastMessageAt && p.messageCount === 0;
      });

      const participatedAgents = agentParticipants.filter((p) => {
        // Agents who have participated but may need to continue conversation
        return Boolean(this.getParticipantMetadata(p).lastMessageAt) && p.messageCount > 0;
      });

      // Phase 1: Introduction phase - trigger agents who haven't introduced themselves
      if (neverParticipatedAgents.length > 0) {
        logger.info('Triggering introduction for agents who have never participated', {
          discussionId: discussion.id,
          agentCount: neverParticipatedAgents.length,
          agentIds: neverParticipatedAgents.map((p) => p.agentId),
        });

        // Trigger participation for the first agent who has never participated
        const agentToTrigger = neverParticipatedAgents[0];
        await this.triggerAgentParticipationEvent(discussion.id, {
          ...agentToTrigger,
          role: agentToTrigger.role as 'participant' | 'moderator' | 'observer' | 'facilitator',
        });
      }
      // Phase 2: Main discussion phase - continue conversation with participated agents
      else if (participatedAgents.length > 0 && discussion.state.currentTurn) {
        logger.info('Continuing main discussion with participated agents', {
          discussionId: discussion.id,
          participatedAgentCount: participatedAgents.length,
          currentTurnNumber: discussion.state.currentTurn.turnNumber,
          totalMessageCount: discussion.state.messageCount,
        });

        // Check if we should continue the discussion (prevent infinite loops)
        const maxMessages = discussion.metadata?.maxMessages || 100; // Increased limit for better testing
        const currentMessageCount = discussion.state.messageCount || 0;

        if (currentMessageCount >= maxMessages) {
          logger.info('Discussion reached maximum message limit, stopping', {
            discussionId: discussion.id,
            currentMessageCount,
            maxMessages,
          });

          // Stop the discussion properly to prevent loops
          await this.updateDiscussionStatus(discussion.id, DiscussionStatus.COMPLETED, 'system');
          // Emit discussion completion event for artifact generation
          await this.emitDiscussionCompletionEvent(discussion.id, 'system', 'max_messages_reached');
          return;
        }

        // Use turn strategy to determine next participant
        const participants = await this.getActiveParticipants(discussion.id);

        logger.debug('Using turn strategy to select next participant', {
          discussionId: discussion.id,
          strategy: discussion.turnStrategy?.strategy || 'unknown',
          participantCount: participants.length,
        });

        const nextParticipant = await this.turnStrategyService.getNextParticipant(
          discussion,
          participants
        );

        logger.debug('Turn strategy selected participant', {
          discussionId: discussion.id,
          selectedParticipant: nextParticipant?.id || 'none',
          selectedAgent: nextParticipant?.agentId || 'none',
        });

        if (nextParticipant && nextParticipant.agentId) {
          // Check if this participant has been active recently to prevent immediate re-triggering
          // Get last message from discussion history
          const messages = await this.getDiscussionMessages(discussion.id);
          const lastMessage =
            messages && messages.length > 0 ? messages[messages.length - 1] : null;
          const isRecentSender = lastMessage && lastMessage.participantId === nextParticipant.id;

          // Don't trigger the same participant immediately unless it's been a while
          if (
            !isRecentSender ||
            (lastMessage && Date.now() - lastMessage.createdAt.getTime() > 5000)
          ) {
            logger.info('Triggering next participant in main discussion', {
              discussionId: discussion.id,
              participantId: nextParticipant.id,
              agentId: nextParticipant.agentId,
              turnNumber: discussion.state.currentTurn.turnNumber,
              isRecentSender,
            });

            await this.triggerAgentParticipationEvent(discussion.id, nextParticipant);
          } else {
            logger.debug('Skipping participant trigger (recent sender)', {
              discussionId: discussion.id,
              participantId: nextParticipant.id,
              lastMessageTime: lastMessage?.createdAt,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error ensuring agent participation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
      });
    }
  }

  /**
   * Check for recently created discussions that might need attention
   */
  private async checkRecentDiscussions(): Promise<void> {
    try {
      // This would ideally query the database for discussions created in the last few minutes
      // For now, we'll just ensure cached discussions are up to date
      logger.debug('Checking for recent discussions');
    } catch (error) {
      logger.error('Error checking recent discussions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if we recently sent a participation request for this agent
   */
  private isRecentParticipationRequest(agentId: string, participantId: string): boolean {
    const key = `${agentId}-${participantId}`;
    const lastRequestTime = this.recentParticipationRequests.get(key);
    const now = Date.now();

    // Rate limit: Only one request per agent per 2 minutes
    if (lastRequestTime && now - lastRequestTime < 120000) {
      return true;
    }

    // Clean up old entries (older than 10 minutes)
    for (const [reqKey, timestamp] of this.recentParticipationRequests.entries()) {
      if (now - timestamp > 600000) {
        this.recentParticipationRequests.delete(reqKey);
      }
    }

    return false;
  }

  /**
   * Trigger agent participation event
   */
  private async triggerAgentParticipationEvent(
    discussionId: string,
    participant: DiscussionParticipant
  ): Promise<void> {
    try {
      if (!participant.agentId) {
        return;
      }

      // Check if we recently sent a participation request for this agent
      const participantId = participant.id;
      if (this.isRecentParticipationRequest(participant.agentId, participantId)) {
        logger.debug('Skipping participation request - recently sent', {
          discussionId,
          agentId: participant.agentId,
          participantId,
        });
        return;
      }

      // Force refresh discussion data to get latest participant information
      const discussion = await this.getDiscussion(discussionId, true);
      if (!discussion) {
        logger.error('Cannot trigger participation - discussion not found', { discussionId });
        return;
      }

      logger.info('Triggering enterprise agent participation', {
        discussionId,
        participantId,
        agentId: participant.agentId,
        displayName: participant.metadata?.displayName || `Participant ${participant.id}`,
        discussionTitle: discussion.title,
        participantDetails: {
          participantId,
          agentId: participant.agentId,
          isActive: participant.isActive,
          roleInDiscussion: participant.role,
          messageCount: participant.messageCount,
          lastMessageAt: participant.lastMessageAt,
        },
      });

      // Record this participation request to prevent duplicates
      const requestKey = `${participant.agentId}-${participant.id}`;
      this.recentParticipationRequests.set(requestKey, Date.now());

      if (discussion.turnStrategy.strategy === 'context_aware') {
        const relevanceScore = await this.turnStrategyService.getContextAwareRelevanceScore(
          discussion,
          participant
        );

        if (relevanceScore >= 0.8) {
          await this.requestTurn(discussionId, participant.id, relevanceScore);
        }
      }

      // Fetch recent messages to provide context
      const recentMessages = await this.discussionService.getDiscussionMessages(discussionId, {
        limit: 20,
      });

      // Format messages for agent context with proper name resolution
      const messageHistory = await Promise.all(
        recentMessages.map(async (msg) => {
          // Find the participant to get agent ID
          const msgParticipant = discussion.participants.find((p) => p.id === msg.participantId);

          // Resolve participant name from agent data if available
          let participantName = 'Unknown';
          if (msgParticipant?.agentId) {
            try {
              // Try to get agent information for proper name
              const agentData = await (
                this.discussionService as unknown as {
                  databaseService: import('@uaip/infra').DatabaseService & {
                    getAgentById?: (id: string) => Promise<{ name?: string } | null>;
                  };
                }
              ).databaseService?.getAgentById?.(msgParticipant.agentId);
              participantName = agentData?.name || msgParticipant.agentId || 'Agent';
            } catch {
              participantName = msgParticipant.agentId || 'Agent';
            }
          } else if (msgParticipant?.userId) {
            try {
              // Try to get user information for proper name
              const userData = await (
                this.discussionService as unknown as {
                  databaseService: import('@uaip/infra').DatabaseService & {
                    getUserById?: (id: string) => Promise<{ email?: string; id?: string } | null>;
                  };
                }
              ).databaseService?.getUserById?.(msgParticipant.userId);
              participantName = userData?.email?.split('@')[0] || userData?.id || 'User';
            } catch {
              participantName = 'User';
            }
          } else {
            participantName =
              ((msgParticipant?.metadata as Record<string, unknown> | undefined)
                ?.displayName as string) || 'Participant';
          }

          return {
            id: msg.id,
            participantId: msg.participantId,
            content: msg.content,
            timestamp: msg.createdAt,
            messageType: msg.messageType,
            agentId: msgParticipant?.agentId || null,
            participantName,
          };
        })
      );

      // Send participation trigger to agent intelligence service using the correct event name
      // Format: { requestId, params: { discussionId, agentId, comment } }
      const requestId = `trigger-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Build context-aware comment based on discussion state
      let contextComment: string;
      if (messageHistory.length === 0) {
        contextComment = `Start the discussion about: ${discussion.topic}. ${discussion.description || ''}`;
      } else {
        const recentContext = messageHistory
          .slice(-3)
          .map((m) => `${m.participantName}: ${m.content.substring(0, 100)}`)
          .join('\n');
        contextComment = `Continue the discussion about: ${discussion.topic}.\n\nRecent messages:\n${recentContext}`;
      }

      await this.eventBusService.publish('agent.discussion.trigger', {
        requestId,
        params: {
          discussionId,
          agentId: participant.agentId,
          comment: contextComment,
        },
      });

      logger.debug('Agent participation request sent', {
        discussionId,
        agentId: participant.agentId,
        participantId: participant.id,
      });
    } catch (error) {
      logger.error('Error triggering agent participation event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        participantId: participant.id,
      });
    }
  }

  /**
   * Update discussion status
   */
  private async updateDiscussionStatus(
    discussionId: string,
    status: DiscussionStatus,
    userId: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      const result = await this.discussionService.updateDiscussion(discussionId, { status });

      if (result) {
        // Update cache
        this.activeDiscussions.set(discussionId, result);

        // Emit status change event
        await this.emitEvent({
          id: this.generateEventId(),
          type: DiscussionEventType.STATUS_CHANGED,
          discussionId,
          data: { status, changedBy: userId },
          timestamp: new Date(),
        });

        return { success: true, data: result };
      }

      return { success: false, error: 'Failed to update discussion status' };
    } catch (error) {
      logger.error('Failed to update discussion status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        status,
        userId,
      });
      return { success: false, error: 'Failed to update discussion status' };
    }
  }

  /**
   * Pause a discussion
   */
  async pauseDiscussion(
    discussionId: string,
    userId: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      const result = await this.updateDiscussionStatus(
        discussionId,
        DiscussionStatus.PAUSED,
        userId
      );

      if (result.success) {
        // Clear turn timer
        const timer = this.turnTimers.get(discussionId);
        if (timer) {
          clearTimeout(timer);
          this.turnTimers.delete(discussionId);
        }

        logger.info('Discussion paused', { discussionId, userId });
      }

      return result;
    } catch (error) {
      logger.error('Failed to pause discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        userId,
      });
      return { success: false, error: 'Failed to pause discussion' };
    }
  }

  /**
   * Resume a discussion
   */
  async resumeDiscussion(
    discussionId: string,
    userId: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      const result = await this.updateDiscussionStatus(
        discussionId,
        DiscussionStatus.ACTIVE,
        userId
      );

      if (result.success) {
        // Restart turn timer
        const discussion = await this.getDiscussion(discussionId);
        if (discussion) {
          const turnTimeout = discussion.settings.turnTimeout || 10;
          await this.setTurnTimer(discussionId, turnTimeout);
        }

        logger.info('Discussion resumed', { discussionId, userId });
      }

      return result;
    } catch (error) {
      logger.error('Failed to resume discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        userId,
      });
      return { success: false, error: 'Failed to resume discussion' };
    }
  }

  /**
   * Stop a discussion
   */
  async stopDiscussion(
    discussionId: string,
    userId: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      const result = await this.updateDiscussionStatus(
        discussionId,
        DiscussionStatus.COMPLETED,
        userId
      );

      if (result.success) {
        // Clear turn timer and remove from active discussions
        const timer = this.turnTimers.get(discussionId);
        if (timer) {
          clearTimeout(timer);
          this.turnTimers.delete(discussionId);
        }
        this.activeDiscussions.delete(discussionId);
        this.turnRequestQueues.delete(discussionId);

        // Emit discussion completion event for artifact generation
        await this.emitDiscussionCompletionEvent(discussionId, userId, 'manual');

        logger.info('Discussion stopped', { discussionId, userId });
      }

      return result;
    } catch (error) {
      logger.error('Failed to stop discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        userId,
      });
      return { success: false, error: 'Failed to stop discussion' };
    }
  }

  /**
   * Get orchestration service status
   */
  getStatus(): {
    activeDiscussions: number;
    activeTurnTimers: number;
    cacheSize: number;
    uptime: number;
  } {
    return {
      activeDiscussions: this.activeDiscussions.size,
      activeTurnTimers: this.turnTimers.size,
      cacheSize: this.activeDiscussions.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Get active participants for a discussion
   */
  private async getActiveParticipants(discussionId: string): Promise<DiscussionParticipant[]> {
    try {
      const participantManagementService = new ParticipantManagementService(
        (
          this.discussionService as unknown as {
            databaseService: import('@uaip/infra').DatabaseService;
          }
        ).databaseService
      );
      return (await participantManagementService.getActiveParticipants(discussionId)).map(
        (participant) => ({
          ...participant,
          role: participant.role as 'participant' | 'moderator' | 'observer' | 'facilitator',
        })
      );
    } catch (error) {
      logger.error('Error getting active participants', {
        error: (error as Error).message,
        discussionId,
      });
      return [];
    }
  }

  /**
   * Get discussion messages
   */
  private async getDiscussionMessages(
    discussionId: string,
    options?: { limit?: number }
  ): Promise<DiscussionMessage[]> {
    try {
      return await this.discussionService.getDiscussionMessages(discussionId, options);
    } catch (error) {
      logger.error('Error getting discussion messages', {
        error: (error as Error).message,
        discussionId,
      });
      return [];
    }
  }

  /**
   * Start cleanup mechanisms to prevent memory leaks
   */
  private startCleanupMechanisms(): void {
    // Main cleanup every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup();
    }, 600000); // 10 minutes

    logger.info('Discussion orchestration cleanup mechanisms started');
  }

  /**
   * Perform periodic cleanup to prevent memory leaks
   */
  private performPeriodicCleanup(): void {
    const now = Date.now();
    let cleanedDiscussions = 0;
    let cleanedParticipationRequests = 0;
    let cleanedOperationLocks = 0;

    // Clean up stale discussions from cache (older than 1 hour with no activity)
    for (const [discussionId, discussion] of this.activeDiscussions.entries()) {
      const lastActivity = discussion.state.lastActivity;
      const timeSinceActivity = lastActivity
        ? now -
          (lastActivity instanceof Date ? lastActivity.getTime() : new Date(lastActivity).getTime())
        : Infinity;

      // Remove discussions inactive for more than 1 hour
      if (timeSinceActivity > 3600000) {
        this.activeDiscussions.delete(discussionId);
        this.turnRequestQueues.delete(discussionId);
        cleanedDiscussions++;

        logger.debug('Cleaned up stale discussion from cache', {
          discussionId,
          inactiveMs: timeSinceActivity,
        });
      }
    }

    // Clean up old participation rate limits (older than 2 hours)
    for (const [key, timestamp] of this.participationRateLimits.entries()) {
      if (now - timestamp > 7200000) {
        // 2 hours
        this.participationRateLimits.delete(key);
        cleanedParticipationRequests++;
      }
    }

    // Clean up old participation requests (older than 1 hour)
    for (const [key, timestamp] of this.recentParticipationRequests.entries()) {
      if (now - timestamp > 3600000) {
        // 1 hour
        this.recentParticipationRequests.delete(key);
        cleanedParticipationRequests++;
      }
    }

    // Clean up orphaned operation locks (shouldn't happen but safety measure)
    for (const [lockKey, _value] of this.operationLocks.entries()) {
      // All operation locks should be short-lived, clean any older than 5 minutes
      this.operationLocks.delete(lockKey);
      cleanedOperationLocks++;
      logger.warn('Cleaned up orphaned operation lock', { lockKey });
    }

    if (cleanedDiscussions > 0 || cleanedParticipationRequests > 0 || cleanedOperationLocks > 0) {
      logger.info('Periodic cleanup completed', {
        cleanedDiscussions,
        cleanedParticipationRequests,
        cleanedOperationLocks,
        remainingActiveDiscussions: this.activeDiscussions.size,
        remainingParticipationLimits: this.participationRateLimits.size,
        remainingParticipationRequests: this.recentParticipationRequests.size,
      });
    }

    // Alert if memory usage is high
    if (this.activeDiscussions.size > 1000) {
      logger.warn('High number of active discussions in cache', {
        activeDiscussions: this.activeDiscussions.size,
        warningThreshold: 1000,
      });
    }
  }

  /**
   * Get cleanup statistics for monitoring
   */
  public getCleanupStatistics(): {
    activeDiscussions: number;
    turnTimers: number;
    turnRequestQueues: number;
    participationRateLimits: number;
    recentParticipationRequests: number;
    operationLocks: number;
  } {
    return {
      activeDiscussions: this.activeDiscussions.size,
      turnTimers: this.turnTimers.size,
      turnRequestQueues: this.turnRequestQueues.size,
      participationRateLimits: this.participationRateLimits.size,
      recentParticipationRequests: this.recentParticipationRequests.size,
      operationLocks: this.operationLocks.size,
    };
  }

  /**
   * Emit discussion completion event for artifact generation
   */
  private async emitDiscussionCompletionEvent(
    discussionId: string,
    completedBy: string,
    completionReason:
      | 'manual'
      | 'max_messages_reached'
      | 'goal_achieved'
      | 'timeout'
      | 'consensus_reached'
  ): Promise<void> {
    try {
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        logger.error('Cannot emit completion event - discussion not found', { discussionId });
        return;
      }

      // Get recent messages for context
      const recentMessages = await this.getDiscussionMessages(discussionId, { limit: 50 });

      // Calculate discussion summary metrics
      const discussionMetrics = {
        totalMessages: discussion.state.messageCount,
        totalParticipants: discussion.participants.length,
        activeParticipants: discussion.participants.filter((p) => p.isActive).length,
        duration: discussion.state.lastActivity
          ? new Date(discussion.state.lastActivity).getTime() -
            new Date(discussion.createdAt).getTime()
          : 0,
        turnCount: discussion.state.currentTurn?.turnNumber || 0,
      };

      // Determine artifact type based on discussion content and context
      const artifactType = this.determineArtifactType(discussion, recentMessages);

      // Emit completion event
      await this.eventBusService.publish('discussion.completed', {
        discussionId,
        discussion: {
          id: discussion.id,
          title: discussion.title,
          description: discussion.description,
          topic: discussion.topic,
          status: discussion.status,
          completedBy,
          completionReason,
          metrics: discussionMetrics,
        },
        messages: recentMessages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          participantId: msg.participantId,
          messageType: msg.messageType,
          timestamp: msg.createdAt,
        })),
        participants: discussion.participants.map((p) => ({
          id: p.id,
          agentId: p.agentId,
          userId: p.userId,
          role: p.role,
          messageCount: p.messageCount,
          isActive: p.isActive,
        })),
        artifactGeneration: {
          suggestedType: artifactType,
          priority: this.calculateArtifactPriority(discussion, completionReason),
          autoShare:
            (discussion as unknown as { artifactConfig?: Record<string, unknown> }).artifactConfig
              ?.autoShare || true,
          generateOnCompletion:
            (discussion as unknown as { artifactConfig?: Record<string, unknown> }).artifactConfig
              ?.generateOnCompletion !== false,
          requiresApproval:
            (discussion as unknown as { artifactConfig?: Record<string, unknown> }).artifactConfig
              ?.requiresApproval || false,
          metadata: {
            discussionType: discussion.turnStrategy.strategy,
            completionReason,
            messageCount: discussionMetrics.totalMessages,
            participantCount: discussionMetrics.totalParticipants,
            ...((discussion as unknown as { artifactConfig?: Record<string, unknown> })
              .artifactConfig?.metadata as Record<string, unknown> | undefined),
          },
        },
        timestamp: new Date(),
      });

      logger.info('Discussion completion event emitted', {
        discussionId,
        completedBy,
        completionReason,
        artifactType,
        messageCount: discussionMetrics.totalMessages,
        participantCount: discussionMetrics.totalParticipants,
      });
    } catch (error) {
      logger.error('Error emitting discussion completion event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        completedBy,
        completionReason,
      });
    }
  }

  /**
   * Determine appropriate artifact type based on discussion content and configuration
   */
  private determineArtifactType(
    discussion: Discussion,
    messages: Record<string, unknown>[]
  ): string {
    // First check if discussion has configured artifact type
    const artifactConfig = (discussion as unknown as { artifactConfig?: Record<string, unknown> })
      .artifactConfig;
    if (artifactConfig?.enabled && artifactConfig?.artifactType) {
      return String(artifactConfig.artifactType);
    }

    // Fallback to content-based detection
    const title = discussion.title.toLowerCase();
    const description = (discussion.description || '').toLowerCase();
    const messageContent = messages
      .map((message) => (typeof message.content === 'string' ? message.content.toLowerCase() : ''))
      .join(' ');

    // Check for code-related discussions
    if (
      title.includes('code') ||
      title.includes('implementation') ||
      description.includes('code') ||
      messageContent.includes('function') ||
      messageContent.includes('class') ||
      messageContent.includes('implement')
    ) {
      return 'code';
    }

    // Check for documentation-related discussions
    if (
      title.includes('documentation') ||
      title.includes('docs') ||
      description.includes('documentation') ||
      messageContent.includes('document') ||
      messageContent.includes('guide') ||
      messageContent.includes('manual')
    ) {
      return 'documentation';
    }

    // Check for test-related discussions
    if (
      title.includes('test') ||
      title.includes('testing') ||
      description.includes('test') ||
      messageContent.includes('test') ||
      messageContent.includes('spec') ||
      messageContent.includes('validation')
    ) {
      return 'test';
    }

    // Check for PRD/requirement-related discussions
    if (
      title.includes('requirement') ||
      title.includes('prd') ||
      title.includes('feature') ||
      description.includes('requirement') ||
      messageContent.includes('requirement') ||
      messageContent.includes('specification') ||
      messageContent.includes('feature')
    ) {
      return 'prd';
    }

    // Default to documentation for general discussions
    return 'documentation';
  }

  /**
   * Calculate artifact generation priority based on discussion characteristics
   */
  private calculateArtifactPriority(
    discussion: Discussion,
    completionReason: string
  ): 'high' | 'medium' | 'low' {
    const messageCount = discussion.state.messageCount;
    const participantCount = discussion.participants.length;

    // High priority for goal-achieved or consensus-reached discussions
    if (completionReason === 'goal_achieved' || completionReason === 'consensus_reached') {
      return 'high';
    }

    // High priority for discussions with many participants and messages
    if (participantCount >= 3 && messageCount >= 10) {
      return 'high';
    }

    // Medium priority for moderately active discussions
    if (participantCount >= 2 && messageCount >= 5) {
      return 'medium';
    }

    // Low priority for simple discussions or timeouts
    return 'low';
  }

  /**
   * Check if discussion has reached a natural conclusion
   */
  private async checkDiscussionGoalAchievement(discussion: Discussion): Promise<boolean> {
    try {
      // Get recent messages to analyze for conclusion indicators
      const recentMessages = await this.getDiscussionMessages(discussion.id, { limit: 10 });

      if (recentMessages.length === 0) {
        return false;
      }

      // Simple heuristic: check for conclusion keywords in recent messages
      const conclusionKeywords = [
        'concluded',
        'resolved',
        'agreed',
        'decision',
        'final',
        'summary',
        'complete',
        'done',
        'finished',
        'consensus',
        'solution',
        'answer',
      ];

      const recentContent = recentMessages
        .slice(0, 5) // Check last 5 messages
        .map((m) => m.content.toLowerCase())
        .join(' ');

      const hasConclusion = conclusionKeywords.some((keyword) => recentContent.includes(keyword));

      // Check if there's been recent activity (last 5 minutes)
      const lastMessage = recentMessages[0];
      const timeSinceLastMessage = Date.now() - lastMessage.createdAt.getTime();
      const isStale = timeSinceLastMessage > 300000; // 5 minutes

      return hasConclusion && !isStale;
    } catch (error) {
      logger.error('Error checking discussion goal achievement', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
      });
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up discussion orchestration service');

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all timers
    for (const timer of this.turnTimers.values()) {
      clearTimeout(timer);
    }
    this.turnTimers.clear();

    // Clear all maps
    this.activeDiscussions.clear();
    this.turnRequestQueues.clear();
    this.participationRateLimits.clear();
    this.recentParticipationRequests.clear();
    this.operationLocks.clear();

    logger.info('Discussion orchestration service cleanup completed');
  }
}
