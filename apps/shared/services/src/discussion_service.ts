import {
  Discussion as DiscussionType,
  DiscussionParticipant as DiscussionParticipantType,
  DiscussionMessage,
  DiscussionSearchFilters,
  CreateDiscussionRequest,
  UpdateDiscussionRequest,
  DiscussionAnalytics,
  DiscussionSummary,
  DiscussionEvent,
  DiscussionStatus,
  TurnStrategy as _TurnStrategy,
  MessageType,
  ParticipantRole as _ParticipantRole,
  DiscussionEventType,
  MessageSentiment,
  DiscussionState,
} from '@uaip/types';
import { Persona as _Persona } from '@uaip/types';
import { DiscussionRepository } from './database/repositories/discussion_repository';

import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import { PersonaService } from './persona_service';
import { logger, NotFoundError, ValidationError, InternalServerError } from '@uaip/utils';

type ParticipantRoleValue = DiscussionParticipantType['role'];
const VALID_PARTICIPANT_ROLES = ['participant', 'moderator', 'observer', 'facilitator'] as const;
function toParticipantRole(role: string): ParticipantRoleValue {
  return VALID_PARTICIPANT_ROLES.find((r) => r === role) ?? 'participant';
}

export interface DiscussionServiceConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  personaService: PersonaService;
  enableRealTimeEvents?: boolean;
  enableAnalytics?: boolean;
  maxParticipants?: number;
  defaultTurnTimeout?: number;
  auditMode?: 'comprehensive' | 'standard' | 'minimal';
}

export class DiscussionService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private personaService: PersonaService;
  private discussionRepository: DiscussionRepository;
  private enableRealTimeEvents: boolean;
  private enableAnalytics: boolean;
  private maxParticipants: number;
  private defaultTurnTimeout: number;
  private activeDiscussions: Map<string, Record<string, unknown>>;
  private cacheTimestamps: Map<string, number>;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly MAX_CACHED = 1000;
  private static readonly STALE_MS = 2 * 60 * 60 * 1000;

  constructor(config: DiscussionServiceConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.personaService = config.personaService;
    this.discussionRepository = new DiscussionRepository();
    this.enableRealTimeEvents = config.enableRealTimeEvents ?? true;
    this.enableAnalytics = config.enableAnalytics ?? true;
    this.maxParticipants = config.maxParticipants ?? 20;
    this.defaultTurnTimeout = config.defaultTurnTimeout ?? 300;
    this.activeDiscussions = new Map();
    this.cacheTimestamps = new Map();
    this.cleanupInterval = setInterval(() => this.evictStaleEntries(), 5 * 60 * 1000);
  }

  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.activeDiscussions.clear();
    this.cacheTimestamps.clear();
  }

  private evictStaleEntries(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [key, ts] of this.cacheTimestamps) {
      if (now - ts > DiscussionService.STALE_MS) {
        this.activeDiscussions.delete(key);
        this.cacheTimestamps.delete(key);
        evicted++;
      }
    }
    if (this.activeDiscussions.size > DiscussionService.MAX_CACHED) {
      const sorted = [...this.cacheTimestamps.entries()].sort((a, b) => a[1] - b[1]);
      const excess = sorted.slice(0, sorted.length - DiscussionService.MAX_CACHED);
      for (const [key] of excess) {
        this.activeDiscussions.delete(key);
        this.cacheTimestamps.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      logger.info('Evicted stale discussions from cache', { evicted, remaining: this.activeDiscussions.size });
    }
  }

  private async hydrateDiscussionRelations(
    discussion: Record<string, unknown>
  ): Promise<DiscussionType> {
    const participantManagementService = new (
      await import('./participant_management_service')
    ).ParticipantManagementService(this.databaseService)

    const participants = await participantManagementService.getDiscussionParticipants(
      typeof discussion.id === 'string' ? discussion.id : String(discussion.id)
    )

    const hydrated = {
      ...discussion,
      participants: participants.map((participant) => ({ ...participant })),
    };
    // @ts-expect-error -- databaseService returns Record<string,unknown>; shape matches DiscussionType at runtime
    return hydrated;
  }

  // ===== DISCUSSION LIFECYCLE MANAGEMENT =====

  async createDiscussion(request: CreateDiscussionRequest): Promise<DiscussionType> {
    try {
      const normalizedTitle = request.title?.trim() ?? '';
      const normalizedTopic = request.topic?.trim() ?? '';

      logger.info('Creating discussion', {
        title: normalizedTitle,
        createdBy: request.createdBy,
        participantCount: request.initialParticipants?.length,
      });

      // Validate discussion request
      await this.validateDiscussionRequest({
        ...request,
        title: normalizedTitle,
        topic: normalizedTopic,
      });

      // Initialize discussion state
      const initialState: DiscussionState = {
        currentTurn: {
          turnNumber: 0,
        },
        phase: 'initialization',
        messageCount: 0,
        activeParticipants: 0,
        consensusLevel: 0,
        engagementScore: 0,
        topicDrift: 0,
        keyPoints: [],
        decisions: [],
        actionItems: [],
      };

      // Create discussion in database
      const discussionData = {
        title: normalizedTitle,
        topic: normalizedTopic,
        description: request.description,
        documentId: request.documentId,
        operationId: request.operationId,
        settings: request.settings,
        turnStrategy: request.turnStrategy,
        status: DiscussionStatus.DRAFT,
        visibility: request.visibility,
        createdBy: request.createdBy,
        organizationId: request.organizationId,
        teamId: request.teamId,
        scheduledFor: request.scheduledFor,
        estimatedDuration: request.estimatedDuration,
        tags: request.tags || [],
        objectives: request.objectives || [],
         outcomes: new Array<{ outcome: string; achievedAt: Date; confidence: number }>(),
        relatedDiscussions: request.relatedDiscussions || [],
        parentDiscussionId: request.parentDiscussionId,
        childDiscussions: request.childDiscussions || [],
        state: initialState,
        analytics: {
          totalMessages: 0,
          uniqueParticipants: 0,
          averageMessageLength: 0,
          participationDistribution: {},
          sentimentDistribution: {},
           topicProgression: new Array<{ topic: string; timestamp: Date; confidence: number }>(),
        },
        metadata: request.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdDiscussion = await this.databaseService.create<Record<string, unknown>>(
        'discussions',
        discussionData
      );
      const discussionId = typeof createdDiscussion.id === 'string' ? createdDiscussion.id : String(createdDiscussion.id);

      if (request.createdBy) {
        await this.addUserParticipant(discussionId, request.createdBy);
      }

      // Add initial participants
      if (request.initialParticipants) {
        logger.debug('Adding initial participants', {
          discussionId,
          participantCount: request.initialParticipants.length,
          discussionSettings: createdDiscussion.settings,
        });
        await Promise.all(
          request.initialParticipants
            .filter((participantRequest) => participantRequest && participantRequest.agentId)
            .map((participantRequest) =>
              this.addParticipant(discussionId, {
                agentId: participantRequest.agentId,
                role: participantRequest.role,
                userId: undefined,
              })
            )
        );
      }

      const discussion = await this.hydrateDiscussionRelations(createdDiscussion)

      // Cache active discussion
      this.activeDiscussions.set(discussionId, discussion);
      this.cacheTimestamps.set(discussionId, Date.now());

      // Emit creation event
      await this.emitDiscussionEvent(discussionId, DiscussionEventType.STATUS_CHANGED, {
        oldStatus: null,
        newStatus: DiscussionStatus.DRAFT,
        createdBy: discussion.createdBy,
      });

      logger.info('Discussion created successfully', { discussionId: discussion.id });
      return discussion;
    } catch (error) {
      logger.error('Failed to create discussion', { error: error instanceof Error ? error.message : String(error), request });
      throw error;
    }
  }

  async getDiscussion(id: string, forceRefresh = false): Promise<DiscussionType | null> {
    try {
      // Check active discussions cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = this.activeDiscussions.get(id);
        if (cached) {
          this.cacheTimestamps.set(id, Date.now());
          return cached;
        }
      }

      // Fetch from database with relations
      const discussion = await this.databaseService.findById<Record<string, unknown>>(
        'discussions',
        id
      );
      if (discussion) {
        const hydratedDiscussion = await this.hydrateDiscussionRelations(discussion)
        if (hydratedDiscussion.status === DiscussionStatus.ACTIVE) {
          this.activeDiscussions.set(id, hydratedDiscussion)
          this.cacheTimestamps.set(id, Date.now());
        }
        return hydratedDiscussion
      }

      return null;
    } catch (error) {
      logger.error('Failed to get discussion', { error: error instanceof Error ? error.message : String(error), discussionId: id, });
      throw error;
    }
  }

  async updateDiscussion(id: string, updates: UpdateDiscussionRequest): Promise<DiscussionType> {
    try {
      logger.info('Updating discussion', { discussionId: id, updates: Object.keys(updates) });

      const existingDiscussion = await this.getDiscussion(id);
      if (!existingDiscussion) {
        throw new NotFoundError(`Discussion not found: ${id}`);
      }

      // Update discussion in database
      // Exclude complex fields from updates - they should be managed separately
      const { participants, outcomes, analytics, ...discussionUpdates } = updates;
      void participants;
      void outcomes;
      void analytics;
      await this.databaseService.update<Record<string, unknown>>('discussions', id, {
        ...discussionUpdates,
        updatedAt: new Date(),
      });

      // Fetch the updated discussion with all relations (especially participants)
      const updatedDiscussion = await this.databaseService.findById<Record<string, unknown>>(
        'discussions',
        id
      );

      if (!updatedDiscussion) {
        throw new InternalServerError(`Failed to update discussion: ${id}`);
      }

      const discussion = await this.hydrateDiscussionRelations(updatedDiscussion)

      // Update cache
      if (discussion.status === DiscussionStatus.ACTIVE) {
        this.activeDiscussions.set(id, discussion);
        this.cacheTimestamps.set(id, Date.now());
      } else {
        this.activeDiscussions.delete(id);
        this.cacheTimestamps.delete(id);
      }

      // Emit update event
      await this.emitDiscussionEvent(id, DiscussionEventType.SETTINGS_UPDATED, {
        changes: Object.keys(updates),
        updatedBy: existingDiscussion.createdBy,
      });

      logger.info('Discussion updated successfully', { discussionId: id });
      return discussion;
    } catch (error) {
      logger.error('Failed to update discussion', { error: error instanceof Error ? error.message : String(error), discussionId: id, });
      throw error;
    }
  }

  async startDiscussion(id: string, startedBy: string): Promise<DiscussionType> {
    try {
      logger.info('Starting discussion', { discussionId: id, startedBy });

      const discussion = await this.getDiscussion(id, true); // Force refresh to get latest participants
      if (!discussion) {
        throw new NotFoundError(`Discussion not found: ${id}`);
      }

      if (discussion.status !== DiscussionStatus.DRAFT) {
        throw new ValidationError(`Discussion cannot be started from status: ${discussion.status}`);
      }

      // Validate minimum participants
      logger.debug('Validating participants for discussion start', {
        discussionId: id,
        participantsLength: discussion.participants?.length || 0,
        participants:
          discussion.participants?.map((p) => ({
            id: p.id,
            agentId: p.agentId,
            isActive: p.isActive,
          })) || [],
      });

      if (!discussion.participants || discussion.participants.length < 2) {
        throw new ValidationError('Discussion requires at least 2 participants to start');
      }

      // Update discussion status and state
      await this.updateDiscussion(id, {
        status: DiscussionStatus.ACTIVE,
        startedAt: new Date(),
        state: {
          ...discussion.state,
          phase: 'discussion',
          activeParticipants: (discussion.state?.activeParticipants || 0) + 1,
        },
      });

      // Initialize first turn
      await this.initializeFirstTurn(id);

      const refreshedDiscussion = await this.getDiscussion(id, true);
      if (!refreshedDiscussion) {
        throw new InternalServerError(`Failed to refresh discussion after start: ${id}`);
      }

      // Emit start event
      await this.emitDiscussionEvent(id, DiscussionEventType.STATUS_CHANGED, {
        oldStatus: DiscussionStatus.DRAFT,
        newStatus: DiscussionStatus.ACTIVE,
        startedBy,
      });

      logger.info('Discussion started successfully', { discussionId: id });
      return refreshedDiscussion;
    } catch (error) {
      logger.error('Failed to start discussion', { error: error instanceof Error ? error.message : String(error), discussionId: id, });
      throw error;
    }
  }

  async endDiscussion(id: string, endedBy: string, reason?: string): Promise<DiscussionType> {
    try {
      logger.info('Ending discussion', { discussionId: id, endedBy, reason });

      const discussion = await this.getDiscussion(id);
      if (!discussion) {
        throw new NotFoundError(`Discussion not found: ${id}`);
      }

      // Allow ending discussions in ACTIVE or DRAFT status
      // DRAFT discussions can be "cancelled" and ACTIVE discussions can be "completed"
      if (
        discussion.status !== DiscussionStatus.ACTIVE &&
        discussion.status !== DiscussionStatus.DRAFT
      ) {
        throw new ValidationError(`Discussion cannot be ended from status: ${discussion.status}`);
      }

      // Calculate final metrics (only for ACTIVE discussions)
      const finalAnalytics =
        discussion.status === DiscussionStatus.ACTIVE
          ? await this.calculateFinalAnalytics(id)
          : null;

      // Determine final status based on current status
      const finalStatus =
        discussion.status === DiscussionStatus.DRAFT
          ? DiscussionStatus.CANCELLED
          : DiscussionStatus.COMPLETED;

      // Update discussion status
      const updatedDiscussion = await this.updateDiscussion(id, {
        status: finalStatus,
        endedAt: new Date(),
        actualDuration: discussion.startedAt ? Date.now() - discussion.startedAt.getTime() : 0,
        state: {
          ...discussion.state,
          phase: 'conclusion',
        },
        analytics: finalAnalytics,
      });

      this.activeDiscussions.delete(id);
      this.cacheTimestamps.delete(id);

      // Generate discussion summary
      if (this.enableAnalytics) {
        await this.generateDiscussionSummary(id);
      }

      // Emit end event
      await this.emitDiscussionEvent(id, DiscussionEventType.STATUS_CHANGED, {
        oldStatus: DiscussionStatus.ACTIVE,
        newStatus: DiscussionStatus.COMPLETED,
        endedBy,
        reason,
      });

      logger.info('Discussion ended successfully', { discussionId: id });
      return updatedDiscussion;
    } catch (error) {
      logger.error('Failed to end discussion', { error: error instanceof Error ? error.message : String(error), discussionId: id, });
      throw error;
    }
  }

  // ===== PARTICIPANT MANAGEMENT =====

  async addParticipant(
    discussionId: string,
    participantRequest: {
      agentId: string;
      role?: 'participant' | 'moderator' | 'observer' | 'facilitator';
      userId?: string;
      displayName?: string;
      permissions?: string[];
      turnOrder?: number;
      turnWeight?: number;
      participationConfig?: Record<string, unknown>;
      behavioralConstraints?: Record<string, unknown>;
      contextAwareness?: Record<string, unknown>;
    }
  ): Promise<DiscussionParticipantType> {
    try {
      logger.info('Adding participant to discussion using enterprise participant management', {
        discussionId,
        agentId: participantRequest.agentId,
        role: participantRequest.role,
        displayName: participantRequest.displayName,
      });

      const discussion = await this.getDiscussion(discussionId, true);
      if (!discussion) {
        throw new NotFoundError(`Discussion not found: ${discussionId}`);
      }

      // Check participant limit - only count active participants
      const maxParticipants = discussion.settings?.maxParticipants || this.maxParticipants;
      const activeParticipants = discussion.participants?.filter((p) => p.isActive) || [];
      const currentParticipantCount = activeParticipants.length;

      logger.debug('Checking participant limit', {
        discussionId,
        totalParticipants: discussion.participants?.length || 0,
        activeParticipants: currentParticipantCount,
        maxParticipants,
      });

      if (currentParticipantCount >= maxParticipants) {
        throw new ValidationError(`Discussion has reached maximum participants limit: ${maxParticipants}`);
      }

      // Validate agent exists
      const agent = await this.databaseService.findById<{ name?: string }>(
        'agents',
        participantRequest.agentId
      );
      if (!agent) {
        throw new NotFoundError(`Agent not found: ${participantRequest.agentId}`);
      }

      // Use enterprise participant management service
      const participantManagementService = new (
        await import('./participant_management_service')
      ).ParticipantManagementService(this.databaseService);

      // Create participant using enterprise service
      const participant = await participantManagementService.createAgentParticipant({
        discussionId,
        agentId: participantRequest.agentId,
        displayName: participantRequest.displayName || agent.name,
        roleInDiscussion: participantRequest.role || 'participant',
        permissions: participantRequest.permissions,
        turnOrder: participantRequest.turnOrder,
        turnWeight: participantRequest.turnWeight,
        participationConfig: participantRequest.participationConfig,
        behavioralConstraints: participantRequest.behavioralConstraints,
        contextAwareness: participantRequest.contextAwareness,
      });

      // Update discussion participant count
      await this.updateDiscussion(discussionId, {
        state: {
          ...discussion.state,
          activeParticipants: (discussion.state?.activeParticipants || 0) + 1,
        },
      });

      // Emit participant joined event with proper participant ID
      await this.emitDiscussionEvent(discussionId, DiscussionEventType.PARTICIPANT_JOINED, {
        participantId: participant.id, // Use the unique participant ID
        agentId: participant.agentId,
        role: participant.role,
        displayName: participant.metadata?.displayName || 'Unknown',
      });

      logger.info('Enterprise participant added successfully', {
        discussionId,
        participantId: participant.id,
        agentId: participant.agentId,
        displayName: participant.metadata?.displayName || 'Unknown',
        role: participant.role,
      });

      return { ...participant, role: toParticipantRole(participant.role) };
    } catch (error) {
      logger.error('Failed to add participant', { error: error instanceof Error ? error.message : String(error), discussionId,
      agentId: participantRequest.agentId, });
      throw error;
    }
  }

  async addUserParticipant(
    discussionId: string,
    userId: string,
    options?: {
      role?: 'participant' | 'moderator' | 'observer' | 'facilitator';
      displayName?: string;
      permissions?: string[];
      turnOrder?: number;
      turnWeight?: number;
      participationConfig?: Record<string, unknown>;
      behavioralConstraints?: Record<string, unknown>;
      contextAwareness?: Record<string, unknown>;
    }
  ): Promise<DiscussionParticipantType> {
    try {
      logger.info('Adding user participant to discussion', {
        discussionId,
        userId,
        role: options?.role,
        displayName: options?.displayName,
      });

      const discussion = await this.getDiscussion(discussionId, true);
      if (!discussion) {
        throw new NotFoundError(`Discussion not found: ${discussionId}`);
      }

      const existingParticipant = discussion.participants?.find(
        (participant) => participant.userId === userId && participant.isActive
      );
      if (existingParticipant) {
        logger.info('User participant already active in discussion', {
          discussionId,
          userId,
          participantId: existingParticipant.id,
        });
        return existingParticipant;
      }

      const maxParticipants = discussion.settings?.maxParticipants || this.maxParticipants;
      const activeParticipants = discussion.participants?.filter((p) => p.isActive) || [];
      const currentParticipantCount = activeParticipants.length;

      logger.debug('Checking participant limit for user', {
        discussionId,
        totalParticipants: discussion.participants?.length || 0,
        activeParticipants: currentParticipantCount,
        maxParticipants,
      });

      if (currentParticipantCount >= maxParticipants) {
        throw new ValidationError(`Discussion has reached maximum participants limit: ${maxParticipants}`);
      }

      const user = await this.databaseService.findById<{ firstName?: string; email?: string }>('users', userId);
      if (!user) {
        throw new NotFoundError(`User not found: ${userId}`);
      }

      const participantManagementService = new (
        await import('./participant_management_service')
      ).ParticipantManagementService(this.databaseService);

      const displayName = options?.displayName || user.firstName || user.email;

      const participant = await participantManagementService.createUserParticipant({
        discussionId,
        userId,
        displayName,
        roleInDiscussion: options?.role || 'participant',
        permissions: options?.permissions,
        turnOrder: options?.turnOrder,
        turnWeight: options?.turnWeight,
        participationConfig: options?.participationConfig,
        behavioralConstraints: options?.behavioralConstraints,
        contextAwareness: options?.contextAwareness,
      });

      await this.updateDiscussion(discussionId, {
        state: {
          ...discussion.state,
          activeParticipants: (discussion.state?.activeParticipants || 0) + 1,
        },
      });

      await this.emitDiscussionEvent(discussionId, DiscussionEventType.PARTICIPANT_JOINED, {
        participantId: participant.id,
        userId: participant.userId,
        role: participant.role,
        displayName: participant.metadata?.displayName || 'Unknown',
      });

      logger.info('User participant added successfully', {
        discussionId,
        participantId: participant.id,
        userId: participant.userId,
        displayName: participant.metadata?.displayName || 'Unknown',
        role: participant.role,
      });

      return { ...participant, role: toParticipantRole(participant.role) };
    } catch (error) {
      logger.error('Failed to add user participant', { error: error instanceof Error ? error.message : String(error), discussionId,
      userId, });
      throw error;
    }
  }

  async removeParticipant(
    discussionId: string,
    participantId: string,
    removedBy: string
  ): Promise<void> {
    try {
      logger.info('Removing participant from discussion', {
        discussionId,
        participantId,
        removedBy,
      });

      const participant = await this.databaseService.findById<Record<string, unknown>>(
        'discussion_participants',
        participantId
      );
      if (!participant || participant.discussionId !== discussionId) {
        throw new NotFoundError(`Participant not found in discussion: ${participantId}`);
      }

      // Mark participant as inactive instead of deleting
      await this.databaseService.update('discussion_participants', participantId, {
        isActive: false,
        updatedAt: new Date(),
      });

      // Update discussion state
      const discussion = await this.getDiscussion(discussionId);
      if (discussion && discussion.state) {
        await this.updateDiscussion(discussionId, {
          state: {
            ...discussion.state,
            activeParticipants: Math.max(0, discussion.state.activeParticipants - 1),
          },
        });
      }

      // Emit participant left event
      await this.emitDiscussionEvent(discussionId, DiscussionEventType.PARTICIPANT_LEFT, {
        participantId,
        removedBy,
      });

      logger.info('Participant removed successfully', { discussionId, participantId });
    } catch (error) {
      logger.error('Failed to remove participant', { error: error instanceof Error ? error.message : String(error), discussionId,
      participantId, });
      throw error;
    }
  }

  // ===== MESSAGE MANAGEMENT =====

  async sendMessage(
    discussionId: string,
    participantId: string,
    content: string,
    messageType = MessageType.MESSAGE
  ): Promise<DiscussionMessage> {
    try {
      logger.debug('Sending message to discussion', {
        discussionId,
        participantId,
        messageType,
        contentLength: content.length,
      });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        throw new NotFoundError(`Discussion not found: ${discussionId}`);
      }

      if (discussion.status !== DiscussionStatus.ACTIVE) {
        throw new ValidationError(`Cannot send message to discussion with status: ${discussion.status}`);
      }

      // Validate participant
      const participant = await this.databaseService.findById<Record<string, unknown>>(
        'discussion_participants',
        participantId
      );
      if (!participant || participant.discussionId !== discussionId || !participant.isActive) {
        throw new ValidationError(`Invalid or inactive participant: ${participantId}`);
      }

      // Analyze message sentiment (if analytics enabled)
      let sentiment: MessageSentiment | undefined;
      let confidence: number | undefined;
      if (this.enableAnalytics) {
        const sentimentAnalysis = await this.analyzeMessageSentiment(content);
        sentiment = sentimentAnalysis.sentiment;
        confidence = sentimentAnalysis.confidence;
      }

      // Create message
      const message = await this.databaseService.create<DiscussionMessage>('discussion_messages', {
        discussionId,
        participantId,
        content,
        messageType,
        sentiment,
        confidence,
        tokens: this.estimateTokenCount(content),
        processingTime: 0, // Will be updated by processing service
        attachments: [],
        mentions: this.extractMentions(content, discussion.participants || []),
        tags: this.extractTags(content),
        reactions: [],
        editHistory: [],
        isEdited: false,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update participant message count
      await this.databaseService.update('discussion_participants', participantId, {
        messageCount: (typeof participant.messageCount === 'number' ? participant.messageCount : 0) + 1,
        lastMessageAt: new Date(),
      });

      // Update discussion state
      await this.updateDiscussion(discussionId, {
        state: {
          ...discussion.state,
          messageCount: discussion.state?.messageCount + 1,
          lastActivity: new Date(),
        },
      });

      // Update analytics
      if (this.enableAnalytics) {
        await this.updateDiscussionAnalytics(discussionId, message);
      }

      // Emit message sent event
      await this.emitDiscussionEvent(discussionId, DiscussionEventType.MESSAGE_SENT, {
        messageId: message.id,
        participantId,
        messageType,
        contentLength: content.length,
      });

      // Check if turn should advance
      await this.checkTurnAdvancement(discussionId);

      logger.debug('Message sent successfully', {
        discussionId,
        messageId: message.id,
      });
      return message;
    } catch (error) {
      logger.error('Failed to send message', { error: error instanceof Error ? error.message : String(error), discussionId,
      participantId, });
      throw error;
    }
  }

  async getMessages(
    discussionId: string,
    limit = 50,
    offset = 0
  ): Promise<{
    messages: DiscussionMessage[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const messages = await this.databaseService.findMany<DiscussionMessage>(
        'discussion_messages',
        { discussionId, isDeleted: false },
        {
          take: limit,
          skip: offset,
          order: { createdAt: 'ASC' as const } satisfies Record<string, 'ASC' | 'DESC'>,
        }
      );

      const total = await this.databaseService.count('discussion_messages', {
        discussionId,
        isDeleted: false,
      });

      return {
        messages,
        total,
        hasMore: offset + messages.length < total,
      };
    } catch (error) {
      logger.error('Failed to get messages', { error: error instanceof Error ? error.message : String(error), discussionId });
      throw error;
    }
  }

  // Alias method for backward compatibility
  async getDiscussionMessages(
    discussionId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<DiscussionMessage[]> {
    const { limit = 50, offset = 0 } = options;
    const result = await this.getMessages(discussionId, limit, offset);
    return result.messages;
  }

  // ===== TURN MANAGEMENT =====

  async advanceTurn(discussionId: string, forcedBy?: string): Promise<void> {
    try {
      logger.debug('Advancing turn', { discussionId, forcedBy });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        throw new NotFoundError(`Discussion not found: ${discussionId}`);
      }

      if (discussion.status !== DiscussionStatus.ACTIVE) {
        return;
      }

      // Determine next participant based on turn strategy
      const nextParticipantId = await this.determineNextParticipant(discussion);

      // Update discussion state
      await this.updateDiscussion(discussionId, {
        state: {
          ...discussion.state,
          currentTurn: {
            participantId: nextParticipantId,
            startedAt: new Date(),
            expectedEndAt: new Date(Date.now() + this.defaultTurnTimeout * 1000),
            turnNumber: (discussion.state?.currentTurn?.turnNumber || 0) + 1,
          },
        },
      });

      // Emit turn changed event
      await this.emitDiscussionEvent(discussionId, DiscussionEventType.TURN_CHANGED, {
        previousParticipantId: discussion.state?.currentTurn?.participantId,
        nextParticipantId,
        turnNumber: (discussion.state?.currentTurn?.turnNumber || 0) + 1,
        forcedBy,
      });

      logger.debug('Turn advanced successfully', { discussionId, nextParticipantId });
    } catch (error) {
      logger.error('Failed to advance turn', { error: error instanceof Error ? error.message : String(error), discussionId });
      throw error;
    }
  }

  // ===== SEARCH AND ANALYTICS =====

  async searchDiscussions(
    filters: DiscussionSearchFilters,
    limit = 20,
    offset = 0
  ): Promise<{
    discussions: DiscussionType[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      // Convert DiscussionSearchFilters to DatabaseService searchDiscussions format
      const searchFilters = {
        textQuery: filters.query,
        status: filters.status,
        visibility: filters.visibility,
        createdBy: filters.createdBy,
        organizationId: filters.organizationId,
        teamId: filters.teamId,
        createdAfter: filters.createdAfter,
        createdBefore: filters.createdBefore,
        limit,
        offset,
      };

      logger.info('Searching discussions with filters', { searchFilters });

      // Use DiscussionRepository directly for domain-based architecture
      const result = await this.discussionRepository.searchDiscussions(searchFilters);

      logger.info('Discussion search result', {
        total: result.total,
        count: result.discussions.length,
      });

      return {
        discussions: result.discussions,
        total: result.total,
        hasMore: offset + result.discussions.length < result.total,
      };
    } catch (error) {
      logger.error('Failed to search discussions', { error: error instanceof Error ? error.message : String(error), filters });
      throw error;
    }
  }

  async getDiscussionAnalytics(
    discussionId: string,
    timeframe?: {
      start: Date;
      end: Date;
    }
  ): Promise<DiscussionAnalytics | null> {
    if (!this.enableAnalytics) {
      return null;
    }

    try {
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        return null;
      }

      // Implementation would calculate comprehensive analytics
      // This is a placeholder structure
      return {
        discussionId,
        timeframe: timeframe || {
          start: discussion.createdAt,
          end: discussion.endedAt || new Date(),
        },
        overview: {
          totalMessages: discussion.analytics?.totalMessages,
          totalParticipants: discussion.participants?.length,
          averageMessageLength: discussion.analytics?.averageMessageLength,
          totalDuration: discussion.actualDuration,
          engagementScore: discussion.state?.engagementScore,
          consensusLevel: discussion.state?.consensusLevel,
          objectivesAchieved: discussion.outcomes?.length,
          actionItemsCreated: discussion.state?.actionItems?.length,
        },
        participation: {
          distribution: discussion.analytics?.participationDistribution || {},
          balance: discussion.state?.metrics?.participationBalance,
          dominanceIndex: 0,
          silenceRatio: 0,
        },
        communication: {
          averageResponseTime: discussion.state?.metrics?.averageResponseTime,
          messageFrequency: [],
          sentimentProgression: [],
          topicEvolution: [],
        },
        outcomes: {
          decisionsReached: discussion.state?.decisions?.length,
          consensusAchieved: discussion.state?.consensusLevel >= 0.8,
          actionItemsGenerated: discussion.state?.actionItems?.length,
          keyInsights:
            discussion.state?.keyPoints
              ?.map((kp: unknown) => {
                if (typeof kp === 'object' && kp !== null && 'point' in kp) {
                  return String(kp.point);
                }
                return null;
              })
              .filter((kp): kp is string => kp !== null) || [],
          unresolvedIssues: [],
        },
        quality: {
          coherenceScore: discussion.state?.metrics?.qualityScore,
          relevanceScore: 0,
          productivityScore: 0,
          satisfactionScore: undefined,
        },
      };
    } catch (error) {
      logger.error('Failed to get discussion analytics', { error: error instanceof Error ? error.message : String(error), discussionId, });
      return null;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private async validateDiscussionRequest(request: CreateDiscussionRequest): Promise<void> {
    if (!request.title || request.title.trim().length === 0) {
      throw new ValidationError('Discussion title is required');
    }

    if (!request.topic || request.topic.trim().length === 0) {
      throw new ValidationError('Discussion topic is required');
    }

    const titleLength = request.title.trim().length;
    const topicLength = request.topic.trim().length;
    const maxTitleLength = 255;
    const maxTopicLength = 1000;

    if (titleLength > maxTitleLength) {
      throw new ValidationError(`Discussion title must be ${maxTitleLength} characters or fewer`);
    }

    if (topicLength > maxTopicLength) {
      throw new ValidationError(`Discussion topic must be ${maxTopicLength} characters or fewer`);
    }

    if (!request.initialParticipants || request.initialParticipants.length < 1) {
      throw new ValidationError('Discussion requires at least 1 initial participant');
    }

    // Validate agents exist
    await Promise.all(
      request.initialParticipants.map(async (participant) => {
        if (!participant.agentId) {
          throw new ValidationError('Participant agentId is required');
        }

        const agent = await this.databaseService.findById('agents', participant.agentId);
        if (!agent) {
          throw new NotFoundError(`Agent not found: ${participant.agentId}`);
        }
      })
    );
  }

  private async initializeFirstTurn(discussionId: string): Promise<void> {
    const discussion = await this.getDiscussion(discussionId);
    if (!discussion) return;

    const firstParticipantId = await this.determineNextParticipant(discussion);

    await this.updateDiscussion(discussionId, {
      state: {
        ...discussion.state,
        currentTurn: {
          participantId: firstParticipantId,
          startedAt: new Date(),
          expectedEndAt: new Date(Date.now() + this.defaultTurnTimeout * 1000),
          turnNumber: 1,
        },
      },
    });
  }

  private async determineNextParticipant(discussion: DiscussionType): Promise<string | undefined> {
    const activeParticipants = (discussion.participants || []).filter(
      (p: DiscussionParticipantType) => p.isActive
    );
    if (activeParticipants.length === 0) return undefined;

    // Simple round-robin for now
    // In a full implementation, this would use the turn strategy configuration
    const currentIndex = discussion.state?.currentTurn?.participantId
      ? activeParticipants.findIndex(
          (p: DiscussionParticipantType) => p.id === discussion.state?.currentTurn?.participantId
        )
      : -1;

    const nextIndex = (currentIndex + 1) % activeParticipants.length;
    return activeParticipants[nextIndex]?.id;
  }

  private async checkTurnAdvancement(_discussionId: string): Promise<void> {
    // Check if turn should automatically advance based on strategy
    // This would implement various turn advancement rules
    // For now, this is a placeholder
  }

  private async analyzeMessageSentiment(_content: string): Promise<{
    sentiment: MessageSentiment;
    confidence: number;
  }> {
    // Placeholder sentiment analysis
    // In a real implementation, this would use NLP services
    return {
      sentiment: MessageSentiment.NEUTRAL,
      confidence: 0.5,
    };
  }

  private estimateTokenCount(content: string): number {
    // Simple token estimation
    return Math.ceil(content.split(/\s+/).length * 1.3);
  }

  private extractMentions(content: string, participants: DiscussionParticipantType[]): string[] {
    // Extract @mentions from content
    const mentions: string[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionedName = match[1];
      // Find participant by agent ID
      const participant = participants.find(
        (p: DiscussionParticipantType) =>
          p.agentId && p.agentId.includes(mentionedName.toLowerCase())
      );
      if (participant && participant.id) {
        mentions.push(participant.id);
      }
    }

    return mentions;
  }

  private extractTags(content: string): string[] {
    // Extract #tags from content
    const tags: string[] = [];
    const tagRegex = /#(\w+)/g;
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      tags.push(match[1].toLowerCase());
    }

    return tags;
  }

  private async updateDiscussionAnalytics(
    _discussionId: string,
    _message: DiscussionMessage
  ): Promise<void> {
    // Update real-time analytics based on new message
    // This would update various metrics and statistics
  }

  async pauseDiscussion(id: string, reason?: string): Promise<DiscussionType> {
    try {
      logger.info('Pausing discussion', { discussionId: id, reason });

      const discussion = await this.getDiscussion(id);
      if (!discussion) {
        throw new NotFoundError(`Discussion not found: ${id}`);
      }

      if (discussion.status !== DiscussionStatus.ACTIVE) {
        throw new ValidationError(`Discussion cannot be paused from status: ${discussion.status}`);
      }

      // Update discussion status
      const updatedDiscussion = await this.updateDiscussion(id, {
        status: DiscussionStatus.PAUSED,
        metadata: {
          ...discussion.metadata,
          pausedAt: new Date(),
          pauseReason: reason,
        },
      });

      // Emit pause event
      await this.emitDiscussionEvent(id, DiscussionEventType.STATUS_CHANGED, {
        oldStatus: DiscussionStatus.ACTIVE,
        newStatus: DiscussionStatus.PAUSED,
        reason,
      });

      logger.info('Discussion paused successfully', { discussionId: id });
      return updatedDiscussion;
    } catch (error) {
      logger.error('Failed to pause discussion', { error: error instanceof Error ? error.message : String(error), discussionId: id, });
      throw error;
    }
  }

  async resumeDiscussion(id: string): Promise<DiscussionType> {
    try {
      logger.info('Resuming discussion', { discussionId: id });

      const discussion = await this.getDiscussion(id);
      if (!discussion) {
        throw new NotFoundError(`Discussion not found: ${id}`);
      }

      if (discussion.status !== DiscussionStatus.PAUSED) {
        throw new ValidationError(`Discussion cannot be resumed from status: ${discussion.status}`);
      }

      // Update discussion status
      const updatedDiscussion = await this.updateDiscussion(id, {
        status: DiscussionStatus.ACTIVE,
        state: {
          ...discussion.state,
          lastActivity: new Date(),
        },
      });

      // Emit resume event
      await this.emitDiscussionEvent(id, DiscussionEventType.STATUS_CHANGED, {
        oldStatus: DiscussionStatus.PAUSED,
        newStatus: DiscussionStatus.ACTIVE,
      });

      logger.info('Discussion resumed successfully', { discussionId: id });
      return updatedDiscussion;
    } catch (error) {
      logger.error('Failed to resume discussion', { error: error instanceof Error ? error.message : String(error), discussionId: id, });
      throw error;
    }
  }

  private async calculateFinalAnalytics(discussionId: string): Promise<unknown> {
    // Calculate comprehensive final analytics for completed discussion
    const discussion = await this.getDiscussion(discussionId);
    if (!discussion) return {};

    return {
      ...discussion.analytics,
      totalMessages: discussion.state?.messageCount,
      uniqueParticipants: discussion.participants?.length,
      // Additional final calculations would go here
    };
  }

  private async generateDiscussionSummary(
    _discussionId: string
  ): Promise<DiscussionSummary | null> {
    // Generate AI-powered discussion summary
    // This would use LLM services to create comprehensive summaries
    return null;
  }

  private async emitDiscussionEvent(
    discussionId: string,
    type: DiscussionEventType,
    data: unknown,
    participantId?: string
  ): Promise<void> {
    if (!this.enableRealTimeEvents) return;

    try {
      const event: DiscussionEvent = {
        discussionId,
        type,
        participantId,
        data,
        timestamp: new Date(),
      };

      await this.eventBusService.publish('discussion.events', event);

      logger.info('Discussion event published successfully', {
        discussionId,
        type,
        eventData: data,
        hasEventBusService: !!this.eventBusService,
      });
    } catch (error) {
      logger.error('Failed to emit discussion event', { error: error instanceof Error ? error.message : String(error), discussionId,
      type, });
    }
  }
}
