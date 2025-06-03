import {
  Discussion,
  DiscussionParticipant,
  DiscussionMessage,
  DiscussionSearchFilters,
  CreateDiscussionRequest,
  UpdateDiscussionRequest,
  DiscussionAnalytics,
  DiscussionSummary,
  DiscussionEvent,
  DiscussionStatus,
  TurnStrategy,
  MessageType,
  ParticipantRole,
  DiscussionEventType,
  MessageSentiment
} from '@uaip/types';
import { Persona } from '@uaip/types';
import { DatabaseService } from './databaseService.js';
import { EventBusService } from './eventBusService.js';
import { PersonaService } from './personaService.js';
import { logger } from '@uaip/utils';

export interface DiscussionServiceConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  personaService: PersonaService;
  enableRealTimeEvents?: boolean;
  enableAnalytics?: boolean;
  maxParticipants?: number;
  defaultTurnTimeout?: number;
}

export class DiscussionService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private personaService: PersonaService;
  private enableRealTimeEvents: boolean;
  private enableAnalytics: boolean;
  private maxParticipants: number;
  private defaultTurnTimeout: number;
  private activeDiscussions: Map<string, Discussion>;

  constructor(config: DiscussionServiceConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.personaService = config.personaService;
    this.enableRealTimeEvents = config.enableRealTimeEvents ?? true;
    this.enableAnalytics = config.enableAnalytics ?? true;
    this.maxParticipants = config.maxParticipants ?? 20;
    this.defaultTurnTimeout = config.defaultTurnTimeout ?? 300; // 5 minutes
    this.activeDiscussions = new Map();
  }

  // ===== DISCUSSION LIFECYCLE MANAGEMENT =====

  async createDiscussion(request: CreateDiscussionRequest): Promise<Discussion> {
    try {
      logger.info('Creating discussion', { 
        title: request.title, 
        createdBy: request.createdBy,
        participantCount: request.initialParticipants?.length || 0
      });

      // Validate discussion request
      await this.validateDiscussionRequest(request);

      // Initialize discussion state
      const initialState = {
        currentTurn: {
          turnNumber: 0
        },
        phase: 'initialization' as const,
        messageCount: 0,
        activeParticipants: 0,
        consensusLevel: 0,
        engagementScore: 0,
        topicDrift: 0,
        keyPoints: [],
        decisions: [],
        actionItems: []
      };

      // Create discussion in database
      const discussion = await this.databaseService.create<Discussion>('discussions', {
        ...request,
        id: crypto.randomUUID(),
        participants: [],
        state: initialState,
        status: DiscussionStatus.DRAFT,
        analytics: {
          totalMessages: 0,
          uniqueParticipants: 0,
          averageMessageLength: 0,
          participationDistribution: {},
          sentimentDistribution: {},
          topicProgression: []
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Add initial participants
      if (request.initialParticipants) {
        for (const participantRequest of request.initialParticipants) {
          if (participantRequest && participantRequest.personaId && participantRequest.agentId) {
            await this.addParticipant(discussion.id!, participantRequest as {
              personaId: string;
              agentId: string;
              role?: ParticipantRole;
              userId?: string;
            });
          }
        }
      }

      // Cache active discussion
      this.activeDiscussions.set(discussion.id!, discussion);

      // Emit creation event
      await this.emitDiscussionEvent(discussion.id!, DiscussionEventType.STATUS_CHANGED, {
        oldStatus: null,
        newStatus: DiscussionStatus.DRAFT,
        createdBy: discussion.createdBy
      });

      logger.info('Discussion created successfully', { discussionId: discussion.id });
      return discussion;

    } catch (error) {
      logger.error('Failed to create discussion', { error: (error as Error).message, request });
      throw error;
    }
  }

  async getDiscussion(id: string): Promise<Discussion | null> {
    try {
      // Check active discussions cache first
      const cached = this.activeDiscussions.get(id);
      if (cached) {
        return cached;
      }

      // Fetch from database
      const discussion = await this.databaseService.findById<Discussion>('discussions', id);
      if (discussion && discussion.status === DiscussionStatus.ACTIVE) {
        this.activeDiscussions.set(id, discussion);
      }

      return discussion;

    } catch (error) {
      logger.error('Failed to get discussion', { error: (error as Error).message, discussionId: id });
      throw error;
    }
  }

  async updateDiscussion(id: string, updates: UpdateDiscussionRequest): Promise<Discussion> {
    try {
      logger.info('Updating discussion', { discussionId: id, updates: Object.keys(updates) });

      const existingDiscussion = await this.getDiscussion(id);
      if (!existingDiscussion) {
        throw new Error(`Discussion not found: ${id}`);
      }

      // Update discussion in database
      const discussion = await this.databaseService.update<Discussion>('discussions', id, {
        ...updates,
        updatedAt: new Date()
      });

      if (!discussion) {
        throw new Error(`Failed to update discussion: ${id}`);
      }

      // Update cache
      if (discussion.status === DiscussionStatus.ACTIVE) {
        this.activeDiscussions.set(id, discussion);
      } else {
        this.activeDiscussions.delete(id);
      }

      // Emit update event
      await this.emitDiscussionEvent(id, DiscussionEventType.SETTINGS_UPDATED, {
        changes: Object.keys(updates),
        updatedBy: existingDiscussion.createdBy
      });

      logger.info('Discussion updated successfully', { discussionId: id });
      return discussion;

    } catch (error) {
      logger.error('Failed to update discussion', { error: (error as Error).message, discussionId: id });
      throw error;
    }
  }

  async startDiscussion(id: string, startedBy: string): Promise<Discussion> {
    try {
      logger.info('Starting discussion', { discussionId: id, startedBy });

      const discussion = await this.getDiscussion(id);
      if (!discussion) {
        throw new Error(`Discussion not found: ${id}`);
      }

      if (discussion.status !== DiscussionStatus.DRAFT) {
        throw new Error(`Discussion cannot be started from status: ${discussion.status}`);
      }

      // Validate minimum participants
      if (!discussion.participants || discussion.participants.length < 2) {
        throw new Error('Discussion requires at least 2 participants to start');
      }

      // Update discussion status and state
      const updatedDiscussion = await this.updateDiscussion(id, {
        status: DiscussionStatus.ACTIVE,
        startedAt: new Date(),
        state: {
          ...discussion.state,
          phase: 'discussion',
          activeParticipants: (discussion.state?.activeParticipants || 0) + 1
        }
      });

      // Initialize first turn
      await this.initializeFirstTurn(id);

      // Emit start event
      await this.emitDiscussionEvent(id, DiscussionEventType.STATUS_CHANGED, {
        oldStatus: DiscussionStatus.DRAFT,
        newStatus: DiscussionStatus.ACTIVE,
        startedBy
      });

      logger.info('Discussion started successfully', { discussionId: id });
      return updatedDiscussion;

    } catch (error) {
      logger.error('Failed to start discussion', { error: (error as Error).message, discussionId: id });
      throw error;
    }
  }

  async endDiscussion(id: string, endedBy: string, reason?: string): Promise<Discussion> {
    try {
      logger.info('Ending discussion', { discussionId: id, endedBy, reason });

      const discussion = await this.getDiscussion(id);
      if (!discussion) {
        throw new Error(`Discussion not found: ${id}`);
      }

      if (discussion.status !== DiscussionStatus.ACTIVE) {
        throw new Error(`Discussion cannot be ended from status: ${discussion.status}`);
      }

      // Calculate final metrics
      const finalAnalytics = await this.calculateFinalAnalytics(id);

      // Update discussion status
      const updatedDiscussion = await this.updateDiscussion(id, {
        status: DiscussionStatus.COMPLETED,
        endedAt: new Date(),
        actualDuration: discussion.startedAt ? 
          Date.now() - discussion.startedAt.getTime() : 0,
        state: {
          ...discussion.state,
          phase: 'conclusion'
        },
        analytics: finalAnalytics
      });

      // Remove from active discussions
      this.activeDiscussions.delete(id);

      // Generate discussion summary
      if (this.enableAnalytics) {
        await this.generateDiscussionSummary(id);
      }

      // Emit end event
      await this.emitDiscussionEvent(id, DiscussionEventType.STATUS_CHANGED, {
        oldStatus: DiscussionStatus.ACTIVE,
        newStatus: DiscussionStatus.COMPLETED,
        endedBy,
        reason
      });

      logger.info('Discussion ended successfully', { discussionId: id });
      return updatedDiscussion;

    } catch (error) {
      logger.error('Failed to end discussion', { error: (error as Error).message, discussionId: id });
      throw error;
    }
  }

  // ===== PARTICIPANT MANAGEMENT =====

  async addParticipant(discussionId: string, participantRequest: {
    personaId: string;
    agentId: string;
    role?: ParticipantRole;
    userId?: string;
  }): Promise<DiscussionParticipant> {
    try {
      logger.info('Adding participant to discussion', { 
        discussionId, 
        personaId: participantRequest.personaId,
        agentId: participantRequest.agentId 
      });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        throw new Error(`Discussion not found: ${discussionId}`);
      }

      // Check participant limit
      if (!discussion.participants || discussion.participants.length >= this.maxParticipants) {
        throw new Error(`Discussion has reached maximum participants limit: ${this.maxParticipants}`);
      }

      // Check if participant already exists
      const existingParticipant = discussion.participants.find(
        (p: DiscussionParticipant) => p.personaId === participantRequest.personaId || p.agentId === participantRequest.agentId
      );
      if (existingParticipant) {
        throw new Error('Participant already exists in discussion');
      }

      // Validate persona exists
      const persona = await this.personaService.getPersona(participantRequest.personaId || '');
      if (!persona) {
        throw new Error(`Persona not found: ${participantRequest.personaId}`);
      }

      // Create participant
      const participant = await this.databaseService.create<DiscussionParticipant>('discussion_participants', {
        id: crypto.randomUUID(),
        discussionId,
        personaId: participantRequest.personaId,
        agentId: participantRequest.agentId,
        userId: participantRequest.userId,
        role: participantRequest.role || ParticipantRole.PARTICIPANT,
        joinedAt: new Date(),
        lastActiveAt: new Date(),
        messageCount: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Update discussion participant count
      await this.updateDiscussion(discussionId, {
        state: {
          ...discussion.state,
          activeParticipants: (discussion.state?.activeParticipants || 0) + 1
        }
      });

      // Emit participant joined event
      await this.emitDiscussionEvent(discussionId, DiscussionEventType.PARTICIPANT_JOINED, {
        participantId: participant.id,
        personaId: participant.personaId,
        agentId: participant.agentId,
        role: participant.role
      });

      logger.info('Participant added successfully', { 
        discussionId, 
        participantId: participant.id 
      });
      return participant;

    } catch (error) {
      logger.error('Failed to add participant', { error: (error as Error).message, discussionId });
      throw error;
    }
  }

  async removeParticipant(discussionId: string, participantId: string, removedBy: string): Promise<void> {
    try {
      logger.info('Removing participant from discussion', { discussionId, participantId, removedBy });

      const participant = await this.databaseService.findById<DiscussionParticipant>('discussion_participants', participantId);
      if (!participant || participant.discussionId !== discussionId) {
        throw new Error(`Participant not found in discussion: ${participantId}`);
      }

      // Mark participant as inactive instead of deleting
      await this.databaseService.update('discussion_participants', participantId, {
        isActive: false,
        updatedAt: new Date()
      });

      // Update discussion state
      const discussion = await this.getDiscussion(discussionId);
      if (discussion && discussion.state) {
        await this.updateDiscussion(discussionId, {
          state: {
            ...discussion.state,
            activeParticipants: Math.max(0, (discussion.state.activeParticipants || 0) - 1)
          }
        });
      }

      // Emit participant left event
      await this.emitDiscussionEvent(discussionId, DiscussionEventType.PARTICIPANT_LEFT, {
        participantId,
        removedBy
      });

      logger.info('Participant removed successfully', { discussionId, participantId });

    } catch (error) {
      logger.error('Failed to remove participant', { error: (error as Error).message, discussionId, participantId });
      throw error;
    }
  }

  // ===== MESSAGE MANAGEMENT =====

  async sendMessage(discussionId: string, participantId: string, content: string, messageType = MessageType.MESSAGE): Promise<DiscussionMessage> {
    try {
      logger.debug('Sending message to discussion', { 
        discussionId, 
        participantId, 
        messageType,
        contentLength: content.length 
      });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        throw new Error(`Discussion not found: ${discussionId}`);
      }

      if (discussion.status !== DiscussionStatus.ACTIVE) {
        throw new Error(`Cannot send message to discussion with status: ${discussion.status}`);
      }

      // Validate participant
      const participant = await this.databaseService.findById<DiscussionParticipant>('discussion_participants', participantId);
      if (!participant || participant.discussionId !== discussionId || !participant.isActive) {
        throw new Error(`Invalid or inactive participant: ${participantId}`);
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
        id: crypto.randomUUID(),
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
        updatedAt: new Date()
      });

      // Update participant message count
      await this.databaseService.update('discussion_participants', participantId, {
        messageCount: (participant.messageCount || 0) + 1,
        lastActiveAt: new Date()
      });

      // Update discussion state
      await this.updateDiscussion(discussionId, {
        state: {
          ...discussion.state,
          messageCount: (discussion.state?.messageCount || 0) + 1,
          lastActivity: new Date()
        }
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
        contentLength: content.length
      });

      // Check if turn should advance
      await this.checkTurnAdvancement(discussionId);

      logger.debug('Message sent successfully', { 
        discussionId, 
        messageId: message.id 
      });
      return message;

    } catch (error) {
      logger.error('Failed to send message', { error: (error as Error).message, discussionId, participantId });
      throw error;
    }
  }

  async getMessages(discussionId: string, limit = 50, offset = 0): Promise<{
    messages: DiscussionMessage[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const messages = await this.databaseService.findMany<DiscussionMessage>('discussion_messages', 
        { discussionId, isDeleted: false },
        {
          limit,
          offset,
          orderBy: 'createdAt ASC'
        }
      );

      const total = await this.databaseService.count('discussion_messages', { discussionId, isDeleted: false });

      return {
        messages,
        total,
        hasMore: offset + messages.length < total
      };

    } catch (error) {
      logger.error('Failed to get messages', { error: (error as Error).message, discussionId });
      throw error;
    }
  }

  // ===== TURN MANAGEMENT =====

  async advanceTurn(discussionId: string, forcedBy?: string): Promise<void> {
    try {
      logger.debug('Advancing turn', { discussionId, forcedBy });

      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        throw new Error(`Discussion not found: ${discussionId}`);
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
            turnNumber: (discussion.state?.currentTurn?.turnNumber || 0) + 1
          }
        }
      });

      // Emit turn changed event
      await this.emitDiscussionEvent(discussionId, DiscussionEventType.TURN_CHANGED, {
        previousParticipantId: discussion.state?.currentTurn?.participantId,
        nextParticipantId,
        turnNumber: (discussion.state?.currentTurn?.turnNumber || 0) + 1,
        forcedBy
      });

      logger.debug('Turn advanced successfully', { discussionId, nextParticipantId });

    } catch (error) {
      logger.error('Failed to advance turn', { error: (error as Error).message, discussionId });
      throw error;
    }
  }

  // ===== SEARCH AND ANALYTICS =====

  private buildDiscussionSearchQuery(filters: DiscussionSearchFilters): {
    conditions: Record<string, any>;
    textSearchQuery?: string;
  } {
    const conditions: Record<string, any> = {};
    let textSearchQuery: string | undefined;

    // Handle text search across multiple fields
    if (filters.query) {
      textSearchQuery = `%${filters.query}%`;
      // We'll handle this in the searchDiscussions method with a custom query
    }

    if (filters.status && filters.status.length > 0) {
      conditions.status = filters.status.length === 1 ? filters.status[0] : filters.status;
    }

    if (filters.visibility && filters.visibility.length > 0) {
      conditions.visibility = filters.visibility.length === 1 ? filters.visibility[0] : filters.visibility;
    }

    if (filters.createdBy && filters.createdBy.length > 0) {
      conditions.created_by = filters.createdBy.length === 1 ? filters.createdBy[0] : filters.createdBy;
    }

    if (filters.organizationId) {
      conditions.organization_id = filters.organizationId;
    }

    if (filters.teamId) {
      conditions.team_id = filters.teamId;
    }

    // Date range filters
    if (filters.createdAfter) {
      conditions.created_at_gte = filters.createdAfter;
    }

    if (filters.createdBefore) {
      conditions.created_at_lte = filters.createdBefore;
    }

    return { conditions, textSearchQuery };
  }

  async searchDiscussions(filters: DiscussionSearchFilters, limit = 20, offset = 0): Promise<{
    discussions: Discussion[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const { conditions, textSearchQuery } = this.buildDiscussionSearchQuery(filters);
      
      let discussions: Discussion[];
      let total: number;

      if (textSearchQuery) {
        // Custom query for text search
        const searchQuery = `
          SELECT * FROM discussions 
          WHERE (
            title ILIKE $1 OR 
            topic ILIKE $1 OR 
            description ILIKE $1
          )
          ${Object.keys(conditions).length > 0 ? 'AND' : ''}
          ${this.buildWhereClause(conditions, 2)}
          ORDER BY created_at DESC
          LIMIT $${Object.keys(conditions).length + 2}
          OFFSET $${Object.keys(conditions).length + 3}
        `;

        const countQuery = `
          SELECT COUNT(*) as count FROM discussions 
          WHERE (
            title ILIKE $1 OR 
            topic ILIKE $1 OR 
            description ILIKE $1
          )
          ${Object.keys(conditions).length > 0 ? 'AND' : ''}
          ${this.buildWhereClause(conditions, 2)}
        `;

        const params = [textSearchQuery, ...Object.values(conditions), limit, offset];
        const countParams = [textSearchQuery, ...Object.values(conditions)];

        const [searchResult, countResult] = await Promise.all([
          this.databaseService.query<Discussion>(searchQuery, params),
          this.databaseService.query(countQuery, countParams)
        ]);

        discussions = searchResult.rows;
        total = parseInt(countResult.rows[0].count);
      } else {
        // Use the standard findMany method
        discussions = await this.databaseService.findMany<Discussion>('discussions', conditions, {
          limit,
          offset,
          orderBy: 'created_at DESC'
        });

        total = await this.databaseService.count('discussions', conditions);
      }

      return {
        discussions,
        total,
        hasMore: offset + discussions.length < total
      };

    } catch (error) {
      logger.error('Failed to search discussions', { error: (error as Error).message, filters });
      throw error;
    }
  }

  private buildWhereClause(conditions: Record<string, any>, startIndex: number): string {
    if (Object.keys(conditions).length === 0) return '';

    const clauses: string[] = [];
    let paramIndex = startIndex;

    for (const [key, value] of Object.entries(conditions)) {
      if (key.endsWith('_gte')) {
        const column = key.replace('_gte', '');
        clauses.push(`${column} >= $${paramIndex++}`);
      } else if (key.endsWith('_lte')) {
        const column = key.replace('_lte', '');
        clauses.push(`${column} <= $${paramIndex++}`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
        clauses.push(`${key} IN (${placeholders})`);
      } else {
        clauses.push(`${key} = $${paramIndex++}`);
      }
    }

    return clauses.join(' AND ');
  }

  async getDiscussionAnalytics(discussionId: string, timeframe?: {
    start: Date;
    end: Date;
  }): Promise<DiscussionAnalytics | null> {
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
          end: discussion.endedAt || new Date()
        },
        overview: {
          totalMessages: discussion.analytics?.totalMessages || 0,
          totalParticipants: discussion.participants?.length || 0,
          averageMessageLength: discussion.analytics?.averageMessageLength || 0,
          totalDuration: discussion.actualDuration || 0,
          engagementScore: discussion.state?.engagementScore || 0,
          consensusLevel: discussion.state?.consensusLevel || 0,
          objectivesAchieved: discussion.outcomes?.length || 0,
          actionItemsCreated: discussion.state?.actionItems?.length || 0
        },
        participation: {
          distribution: discussion.analytics?.participationDistribution || {},
          balance: discussion.state?.metrics?.participationBalance || 0,
          dominanceIndex: 0,
          silenceRatio: 0
        },
        communication: {
          averageResponseTime: discussion.state?.metrics?.averageResponseTime || 0,
          messageFrequency: [],
          sentimentProgression: [],
          topicEvolution: []
        },
        outcomes: {
          decisionsReached: discussion.state?.decisions?.length || 0,
          consensusAchieved: (discussion.state?.consensusLevel || 0) >= 0.8,
          actionItemsGenerated: discussion.state?.actionItems?.length || 0,
          keyInsights: discussion.state?.keyPoints?.map((kp: any) => kp.point) || [],
          unresolvedIssues: []
        },
        quality: {
          coherenceScore: discussion.state?.metrics?.qualityScore || 0,
          relevanceScore: 0,
          productivityScore: 0,
          satisfactionScore: undefined
        }
      };

    } catch (error) {
      logger.error('Failed to get discussion analytics', { error: (error as Error).message, discussionId });
      return null;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private async validateDiscussionRequest(request: CreateDiscussionRequest): Promise<void> {
    if (!request.title || request.title.trim().length === 0) {
      throw new Error('Discussion title is required');
    }

    if (!request.topic || request.topic.trim().length === 0) {
      throw new Error('Discussion topic is required');
    }

    if (!request.initialParticipants || request.initialParticipants.length < 2) {
      throw new Error('Discussion requires at least 2 initial participants');
    }

    // Validate personas exist
    for (const participant of request.initialParticipants) {
      if (participant.personaId) {
        const persona = await this.personaService.getPersona(participant.personaId);
        if (!persona) {
          throw new Error(`Persona not found: ${participant.personaId}`);
        }
      } else {
        throw new Error('Participant personaId is required');
      }
    }
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
          turnNumber: 1
        }
      }
    });
  }

  private async determineNextParticipant(discussion: Discussion): Promise<string | undefined> {
    const activeParticipants = (discussion.participants || []).filter((p: DiscussionParticipant) => p.isActive);
    if (activeParticipants.length === 0) return undefined;

    // Simple round-robin for now
    // In a full implementation, this would use the turn strategy configuration
    const currentIndex = discussion.state?.currentTurn?.participantId ? 
      activeParticipants.findIndex((p: DiscussionParticipant) => p.id === discussion.state?.currentTurn?.participantId) : -1;
    
    const nextIndex = (currentIndex + 1) % activeParticipants.length;
    return activeParticipants[nextIndex]?.id;
  }

  private async checkTurnAdvancement(discussionId: string): Promise<void> {
    // Check if turn should automatically advance based on strategy
    // This would implement various turn advancement rules
    // For now, this is a placeholder
  }

  private async analyzeMessageSentiment(content: string): Promise<{
    sentiment: MessageSentiment;
    confidence: number;
  }> {
    // Placeholder sentiment analysis
    // In a real implementation, this would use NLP services
    return {
      sentiment: MessageSentiment.NEUTRAL,
      confidence: 0.5
    };
  }

  private estimateTokenCount(content: string): number {
    // Simple token estimation
    return Math.ceil(content.split(/\s+/).length * 1.3);
  }

  private extractMentions(content: string, participants: DiscussionParticipant[]): string[] {
    // Extract @mentions from content
    const mentions: string[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionedName = match[1];
      // Find participant by name or agent ID
      const participant = participants.find(
        (p: DiscussionParticipant) => p.agentId && p.agentId.toLowerCase().includes(mentionedName.toLowerCase())
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

  private async updateDiscussionAnalytics(discussionId: string, message: DiscussionMessage): Promise<void> {
    // Update real-time analytics based on new message
    // This would update various metrics and statistics
  }

  private async calculateFinalAnalytics(discussionId: string): Promise<any> {
    // Calculate comprehensive final analytics for completed discussion
    const discussion = await this.getDiscussion(discussionId);
    if (!discussion) return {};

    return {
      ...discussion.analytics,
      totalMessages: discussion.state?.messageCount || 0,
      uniqueParticipants: discussion.participants?.length || 0,
      // Additional final calculations would go here
    };
  }

  private async generateDiscussionSummary(discussionId: string): Promise<DiscussionSummary | null> {
    // Generate AI-powered discussion summary
    // This would use LLM services to create comprehensive summaries
    return null;
  }

  private async emitDiscussionEvent(
    discussionId: string, 
    type: DiscussionEventType, 
    data: any,
    participantId?: string
  ): Promise<void> {
    if (!this.enableRealTimeEvents) return;

    try {
      const event: DiscussionEvent = {
        id: crypto.randomUUID(),
        discussionId,
        type,
        participantId,
        data,
        timestamp: new Date()
      };

      await this.eventBusService.publish('discussion.event', event);

    } catch (error) {
      logger.error('Failed to emit discussion event', { 
        error: (error as Error).message, 
        discussionId, 
        type 
      });
    }
  }
} 