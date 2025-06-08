import { 
  Discussion, 
  DiscussionParticipant, 
  DiscussionMessage,
  DiscussionStatus,
  DiscussionEvent,
  DiscussionEventType,
  CreateDiscussionRequest,
  UpdateDiscussionRequest,
  TurnStrategyConfig
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { DiscussionService, EventBusService } from '@uaip/shared-services';
import { TurnStrategyService } from './turnStrategyService.js';
import { DiscussionWebSocketHandler } from '../websocket/discussionWebSocketHandler.js';

export interface DiscussionOrchestrationResult {
  success: boolean;
  data?: any;
  error?: string;
  events?: DiscussionEvent[];
}

export class DiscussionOrchestrationService {
  private turnStrategyService: TurnStrategyService;
  private discussionService: DiscussionService;
  private eventBusService: EventBusService;
  private webSocketHandler?: DiscussionWebSocketHandler;
  private turnTimers: Map<string, NodeJS.Timeout> = new Map();
  private activeDiscussions: Map<string, Discussion> = new Map();

  constructor(
    discussionService: DiscussionService,
    eventBusService: EventBusService,
    webSocketHandler?: DiscussionWebSocketHandler
  ) {
    this.discussionService = discussionService;
    this.eventBusService = eventBusService;
    this.webSocketHandler = webSocketHandler;
    this.turnStrategyService = new TurnStrategyService();
    
    this.initializeEventHandlers();
    this.startPeriodicTasks();
  }

  /**
   * Set WebSocket handler (can be set after construction)
   */
  setWebSocketHandler(handler: DiscussionWebSocketHandler): void {
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
        participantCount: request.initialParticipants?.length || 0
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
            error: `Invalid turn strategy configuration: ${validation.errors.join(', ')}`
          };
        }
      }

      // Create discussion through shared service
      const discussion = await this.discussionService.createDiscussion({
        ...request,
        createdBy,
        status: DiscussionStatus.DRAFT
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
          createdBy
        },
        timestamp: new Date(),
        metadata: {
          source: 'orchestration-service'
        }
      };

      await this.emitEvent(creationEvent);

      logger.info('Discussion created successfully', {
        discussionId: discussion.id,
        title: discussion.title,
        status: discussion.status
      });

      return {
        success: true,
        data: discussion,
        events: [creationEvent]
      };
    } catch (error) {
      logger.error('Error creating discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request,
        createdBy
      });
      
      return {
        success: false,
        error: 'Failed to create discussion'
      };
    }
  }

  /**
   * Start a discussion
   */
  async startDiscussion(
    discussionId: number,
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
      const activeParticipants = discussion.participants.filter(p => p.isActive);
      if (activeParticipants.length < 2) {
        return { success: false, error: 'At least 2 active participants required to start discussion' };
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
            turnNumber: turnResult.turnNumber
          },
          phase: 'discussion',
          lastActivity: new Date()
        }
      });

      // Update cache
      this.activeDiscussions.set(discussionId, updatedDiscussion);

      // Set turn timer
      if (turnResult.nextParticipant) {
        this.setTurnTimer(discussionId, turnResult.estimatedDuration);
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
            startedBy
          },
          timestamp: new Date(),
          metadata: { source: 'orchestration-service' }
        }
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
            estimatedDuration: turnResult.estimatedDuration
          },
          timestamp: new Date(),
          metadata: { source: 'orchestration-service' }
        });
      }

      await this.emitEvents(events);

      logger.info('Discussion started successfully', {
        discussionId,
        firstParticipantId: turnResult.nextParticipant?.id,
        turnNumber: turnResult.turnNumber,
        estimatedDuration: turnResult.estimatedDuration
      });

      return {
        success: true,
        data: updatedDiscussion,
        events
      };
    } catch (error) {
      logger.error('Error starting discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        startedBy
      });
      
      return {
        success: false,
        error: 'Failed to start discussion'
      };
    }
  }

  /**
   * Add participant to discussion
   */
  async addParticipant(
    discussionId: number,
    participant: Omit<DiscussionParticipant, 'id' | 'discussionId' | 'joinedAt' | 'lastActiveAt' | 'messageCount'>,
    addedBy: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Adding participant to discussion', {
        discussionId,
        participantAgentId: participant.agentId,
        participantRole: participant.role,
        addedBy
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
      if (!participant.personaId || !participant.agentId) {
        return { success: false, error: 'personaId and agentId are required' };
      }

      // Add participant through shared service - only pass the fields it expects
      const newParticipant = await this.discussionService.addParticipant(discussionId, {
        personaId: participant.personaId,
        agentId: participant.agentId,
        role: participant.role,
        userId: participant.userId
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
          addedBy
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' }
      };

      await this.emitEvent(joinEvent);

      logger.info('Participant added successfully', {
        discussionId,
        participantId: newParticipant.id,
        addedBy
      });

      return {
        success: true,
        data: newParticipant,
        events: [joinEvent]
      };
    } catch (error) {
      logger.error('Error adding participant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        participant,
        addedBy
      });
      
      return {
        success: false,
        error: 'Failed to add participant'
      };
    }
  }

  /**
   * Send a message to a discussion
   */
  async sendMessage(
    discussionId: number,
     participantId: number,
    content: string,
    messageType?: string,
    metadata?: any
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Sending message', {
        discussionId,
        participantId,
        messageType,
        contentLength: content.length
      });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      const participant = discussion.participants.find(p => p.id === participantId);
      if (!participant) {
        return { success: false, error: 'Participant not found' };
      }

      if (!participant.isActive) {
        return { success: false, error: 'Participant is not active' };
      }

      // Check if it's the participant's turn (for turn-based strategies)
      if (discussion.turnStrategy.strategy !== 'free_form') {
        const currentTurnParticipant = discussion.state.currentTurn.participantId;
        if (currentTurnParticipant && currentTurnParticipant !== participantId) {
          return { success: false, error: 'It is not your turn to speak' };
        }
      }

      // Send message through shared service
      const message = await this.discussionService.sendMessage(
        discussionId,
        participantId,
        content,
        messageType as any
      );

      // Update discussion state (the service handles participant updates internally)
      await this.discussionService.updateDiscussion(discussionId, {
        state: {
          ...discussion.state,
          messageCount: discussion.state.messageCount + 1,
          lastActivity: new Date()
        }
      });

      // Emit message event
      const messageEvent: DiscussionEvent = {
        id: this.generateEventId(),
        type: DiscussionEventType.MESSAGE_SENT,
        discussionId,
        data: {
          message,
          participantId
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' }
      };

      await this.emitEvent(messageEvent);

      logger.info('Message sent successfully', {
        discussionId,
        messageId: message.id,
        participantId,
        messageType
      });

      return {
        success: true,
        data: message,
        events: [messageEvent]
      };
    } catch (error) {
      logger.error('Error sending message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        participantId,
        content: content.substring(0, 100) + '...'
      });
      
      return {
        success: false,
        error: 'Failed to send message'
      };
    }
  }

  /**
   * Advance turn manually
   */
  async advanceTurn(discussionId: string, advancedBy?: string): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Advancing turn', { discussionId, advancedBy });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      if (discussion.status !== DiscussionStatus.ACTIVE) {
        return { success: false, error: 'Discussion is not active' };
      }

      const activeParticipants = discussion.participants.filter(p => p.isActive);
      const currentParticipantId = discussion.state.currentTurn.participantId;

      // Clear existing turn timer
      this.clearTurnTimer(discussionId);

      // Get next turn
      const turnResult = await this.turnStrategyService.advanceTurn(
        discussion,
        activeParticipants,
        discussion.turnStrategy
      );

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
            turnNumber: turnResult.turnNumber
          },
          lastActivity: new Date()
        }
      });

      // Update cache
      this.activeDiscussions.set(discussionId, updatedDiscussion);

      // Set new turn timer
      if (turnResult.nextParticipant) {
        this.setTurnTimer(discussionId, turnResult.estimatedDuration);
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
          advancedBy
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' }
      };

      await this.emitEvent(turnEvent);

      logger.info('Turn advanced successfully', {
        discussionId,
        previousParticipantId: currentParticipantId,
        nextParticipantId: turnResult.nextParticipant?.id,
        turnNumber: turnResult.turnNumber
      });

      return {
        success: true,
        data: {
          nextParticipant: turnResult.nextParticipant,
          turnNumber: turnResult.turnNumber,
          estimatedDuration: turnResult.estimatedDuration
        },
        events: [turnEvent]
      };
    } catch (error) {
      logger.error('Error advancing turn', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        advancedBy
      });
      
      return {
        success: false,
        error: 'Failed to advance turn'
      };
    }
  }

  /**
   * Pause discussion
   */
  async pauseDiscussion(
    discussionId: number,
    pausedBy: string,
    reason?: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Pausing discussion', { discussionId, pausedBy, reason });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      if (discussion.status !== DiscussionStatus.ACTIVE) {
        return { success: false, error: 'Discussion is not active' };
      }

      // Clear turn timer
      this.clearTurnTimer(discussionId);

      // Update discussion status
      const updatedDiscussion = await this.discussionService.updateDiscussion(discussionId, {
        status: DiscussionStatus.PAUSED,
        metadata: {
          ...discussion.metadata,
          pausedBy,
          pausedAt: new Date(),
          pauseReason: reason
        }
      });

      // Update cache
      this.activeDiscussions.set(discussionId, updatedDiscussion);

      // Emit event
      const pauseEvent: DiscussionEvent = {
        id: this.generateEventId(),
        type: DiscussionEventType.STATUS_CHANGED,
        discussionId,
        data: {
          oldStatus: DiscussionStatus.ACTIVE,
          newStatus: DiscussionStatus.PAUSED,
          pausedBy,
          reason
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' }
      };

      await this.emitEvent(pauseEvent);

      logger.info('Discussion paused successfully', { discussionId, pausedBy });

      return {
        success: true,
        data: updatedDiscussion,
        events: [pauseEvent]
      };
    } catch (error) {
      logger.error('Error pausing discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        pausedBy
      });
      
      return {
        success: false,
        error: 'Failed to pause discussion'
      };
    }
  }

  /**
   * Resume discussion
   */
  async resumeDiscussion(
    discussionId: number,
    resumedBy: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Resuming discussion', { discussionId, resumedBy });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      if (discussion.status !== DiscussionStatus.PAUSED) {
        return { success: false, error: 'Discussion is not paused' };
      }

      // Update discussion status
      const updatedDiscussion = await this.discussionService.updateDiscussion(discussionId, {
        status: DiscussionStatus.ACTIVE,
        state: {
          ...discussion.state,
          lastActivity: new Date()
        }
      });

      // Update cache
      this.activeDiscussions.set(discussionId, updatedDiscussion);

      // Restart turn timer if there's a current participant
      if (discussion.state.currentTurn.participantId && discussion.state.currentTurn.expectedEndAt) {
        const remainingTime = Math.max(
          0,
          new Date(discussion.state.currentTurn.expectedEndAt).getTime() - Date.now()
        ) / 1000;
        
        if (remainingTime > 0) {
          this.setTurnTimer(discussionId, remainingTime);
        } else {
          // Turn has expired, advance immediately
          await this.advanceTurn(discussionId, 'system');
        }
      }

      // Emit event
      const resumeEvent: DiscussionEvent = {
        id: this.generateEventId(),
        type: DiscussionEventType.STATUS_CHANGED,
        discussionId,
        data: {
          oldStatus: DiscussionStatus.PAUSED,
          newStatus: DiscussionStatus.ACTIVE,
          resumedBy
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' }
      };

      await this.emitEvent(resumeEvent);

      logger.info('Discussion resumed successfully', { discussionId, resumedBy });

      return {
        success: true,
        data: updatedDiscussion,
        events: [resumeEvent]
      };
    } catch (error) {
      logger.error('Error resuming discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        resumedBy
      });
      
      return {
        success: false,
        error: 'Failed to resume discussion'
      };
    }
  }

  /**
   * End discussion
   */
  async endDiscussion(
    discussionId: number,
    endedBy: string,
    reason?: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      logger.info('Ending discussion', { discussionId, endedBy, reason });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      if (![DiscussionStatus.ACTIVE, DiscussionStatus.PAUSED].includes(discussion.status)) {
        return { success: false, error: 'Discussion cannot be ended from current status' };
      }

      // Clear turn timer
      this.clearTurnTimer(discussionId);

      // Update discussion status
      const updatedDiscussion = await this.discussionService.updateDiscussion(discussionId, {
        status: DiscussionStatus.COMPLETED,
        state: {
          ...discussion.state,
          phase: 'conclusion',
          lastActivity: new Date()
        },
        metadata: {
          ...discussion.metadata,
          endedBy,
          endedAt: new Date(),
          endReason: reason
        }
      });

      // Remove from active discussions cache
      this.activeDiscussions.delete(discussionId);

      // Emit event
      const endEvent: DiscussionEvent = {
        id: this.generateEventId(),
        type: DiscussionEventType.STATUS_CHANGED,
        discussionId,
        data: {
          oldStatus: discussion.status,
          newStatus: DiscussionStatus.COMPLETED,
          endedBy,
          reason
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' }
      };

      await this.emitEvent(endEvent);

      logger.info('Discussion ended successfully', { discussionId, endedBy });

      return {
        success: true,
        data: updatedDiscussion,
        events: [endEvent]
      };
    } catch (error) {
      logger.error('Error ending discussion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        endedBy
      });
      
      return {
        success: false,
        error: 'Failed to end discussion'
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
        discussionId
      });
      return null;
    }
  }

  /**
   * Verify if a user has access to participate in a discussion
   */
  async verifyParticipantAccess(discussionId: string, userId: number): Promise<boolean> {
    try {
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return false;
      }

      // Check if user is a participant
      const participant = discussion.participants.find(p => p.userId === userId);
      if (!participant) {
        return false;
      }

      // Check if participant is active
      if (!participant.isActive) {
        return false;
      }

      // Check discussion status
      if (discussion.status === DiscussionStatus.CANCELLED || discussion.status === DiscussionStatus.ARCHIVED) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error verifying participant access', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        userId
      });
      return false;
    }
  }

  /**
   * Get participant by user ID
   */
  async getParticipantByUserId(discussionId: string, userId: number): Promise<DiscussionParticipant | null> {
    try {
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return null;
      }

      const participant = discussion.participants.find(p => p.userId === userId);
      return participant || null;
    } catch (error) {
      logger.error('Error getting participant by user ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        userId
      });
      return null;
    }
  }

  /**
   * Request turn for a participant
   */
  async requestTurn(discussionId: string,  participantId: number): Promise<DiscussionOrchestrationResult> {
    try {
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      const participant = discussion.participants.find(p => p.id === participantId);
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

      // For moderated discussions, add to queue
      if (discussion.turnStrategy.strategy === 'moderated') {
        // Add to turn request queue (this would be implemented in the moderated strategy)
        logger.info('Turn requested in moderated discussion', {
          discussionId,
          participantId,
          currentTurn: discussion.state.currentTurn.participantId
        });

        return {
          success: true,
          data: {
            status: 'queued',
            message: 'Turn request added to queue for moderator approval'
          }
        };
      }

      // For other strategies, check if it's their turn
      if (discussion.state.currentTurn.participantId === participantId) {
        return {
          success: true,
          data: {
            status: 'active',
            message: 'It is already your turn'
          }
        };
      }

      return {
        success: false,
        error: 'Turn request not applicable for current strategy'
      };
    } catch (error) {
      logger.error('Error requesting turn', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        participantId
      });
      return { success: false, error: 'Failed to request turn' };
    }
  }

  /**
   * End turn for a participant
   */
  async endTurn(discussionId: string,  participantId: number): Promise<DiscussionOrchestrationResult> {
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
            nextParticipant: result.data?.nextParticipant
          }
        };
      }

      return result;
    } catch (error) {
      logger.error('Error ending turn', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        participantId
      });
      return { success: false, error: 'Failed to end turn' };
    }
  }

  /**
   * Add reaction to a message
   */
  async addReaction(
    discussionId: number,
    messageId: string,
     participantId: number,
    emoji: string
  ): Promise<DiscussionOrchestrationResult> {
    try {
      // Verify participant access
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return { success: false, error: 'Discussion not found' };
      }

      const participant = discussion.participants.find(p => p.id === participantId);
      if (!participant || !participant.isActive) {
        return { success: false, error: 'Participant not found or inactive' };
      }

      // For now, we'll just emit the reaction event without persisting it
      // This would need to be implemented in the DiscussionService
      const reaction = {
        id: this.generateEventId(),
        participantId,
        emoji,
        createdAt: new Date()
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
          reaction
        },
        timestamp: new Date(),
        metadata: { source: 'orchestration-service' }
      };

      await this.emitEvent(reactionEvent);

      logger.info('Reaction added successfully', {
        discussionId,
        messageId,
        participantId,
        emoji
      });

      return {
        success: true,
        data: reaction,
        events: [reactionEvent]
      };
    } catch (error) {
      logger.error('Error adding reaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        messageId,
        participantId,
        emoji
      });
      return { success: false, error: 'Failed to add reaction' };
    }
  }

  /**
   * Make the service an event emitter for websocket integration
   */
  on(event: string, listener: (...args: any[]) => void): void {
    // This would integrate with Node.js EventEmitter if needed
    // For now, we'll handle events through the event bus
  }

  private async getDiscussionInternal(discussionId: string, forceRefresh = false): Promise<Discussion | null> {
    // This is the old private method, now we use the public one
    return this.getDiscussion(discussionId, forceRefresh);
  }

  // Private helper methods

  private setTurnTimer(discussionId: string, durationSeconds: number): void {
    try {
      // Clear existing timer
      this.clearTurnTimer(discussionId);

      // Set new timer
      const timer = setTimeout(async () => {
        logger.info('Turn timer expired, advancing turn', { discussionId, durationSeconds });
        await this.advanceTurn(discussionId, 'system');
      }, durationSeconds * 1000);

      this.turnTimers.set(discussionId, timer);

      logger.debug('Turn timer set', { discussionId, durationSeconds });
    } catch (error) {
      logger.error('Error setting turn timer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        durationSeconds
      });
    }
  }

  private clearTurnTimer(discussionId: string): void {
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
      
      // Broadcast to WebSocket connections
      if (this.webSocketHandler) {
        this.webSocketHandler.broadcastToDiscussion(event.discussionId, event);
      }
      
      logger.debug('Event emitted', { eventType: event.type, discussionId: event.discussionId });
    } catch (error) {
      logger.error('Error emitting event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event
      });
    }
  }

  private async emitEvents(events: DiscussionEvent[]): Promise<void> {
    for (const event of events) {
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
    }, 60000); // Every minute

    logger.info('Discussion orchestration periodic tasks started');
  }

  private cleanupExpiredTimers(): void {
    // Clean up any orphaned timers
    const now = Date.now();
    for (const [discussionId, timer] of this.turnTimers) {
      // Additional cleanup logic could go here
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
      uptime: process.uptime()
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up discussion orchestration service');
    
    // Clear all timers
    for (const timer of this.turnTimers.values()) {
      clearTimeout(timer);
    }
    this.turnTimers.clear();
    
    // Clear cache
    this.activeDiscussions.clear();
    
    logger.info('Discussion orchestration service cleanup completed');
  }
} 