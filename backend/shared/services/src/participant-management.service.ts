import { v4 as uuidv4 } from 'uuid';
import { logger } from '@uaip/utils';
import { DatabaseService } from './database/index.js';
import { DiscussionParticipant } from './entities/discussionParticipant.entity.js';

/**
 * Enterprise Participant Management Service
 *
 * Handles the complex mapping between agents, personas, users, and discussion participants.
 * This service is designed to handle enterprise-scale scenarios like 10 Claude Opus models
 * collaborating on massive projects.
 *
 * Key Responsibilities:
 * - Maintain unique participant identity per discussion
 * - Prevent duplicate participants
 * - Handle complex agent-to-participant mappings
 * - Support multiple participant types
 * - Provide enterprise-grade identity management
 */
export class ParticipantManagementService {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Create or retrieve a participant for an agent in a discussion
   *
   * This method ensures that:
   * - Each agent gets a unique participant ID per discussion
   * - No duplicate participants are created
   * - Agent identity is properly maintained
   * - Enterprise-scale collaboration is supported
   */
  async createAgentParticipant(options: {
    discussionId: string;
    agentId: string;
    displayName?: string;
    roleInDiscussion?:
      | 'moderator'
      | 'participant'
      | 'observer'
      | 'facilitator'
      | 'expert'
      | 'critic';
    permissions?: string[];
    turnOrder?: number;
    turnWeight?: number;
    participationConfig?: Record<string, any>;
    behavioralConstraints?: Record<string, any>;
    contextAwareness?: Record<string, any>;
  }): Promise<DiscussionParticipant> {
    const {
      discussionId,
      agentId,
      displayName,
      roleInDiscussion = 'participant',
      permissions = ['speak', 'listen', 'react'],
      turnOrder,
      turnWeight = 1.0,
      participationConfig,
      behavioralConstraints,
      contextAwareness,
    } = options;

    try {
      // Check if participant already exists for this agent in this discussion
      const existingParticipants = await this.databaseService.findMany<DiscussionParticipant>(
        DiscussionParticipant,
        {
          discussionId,
          participantType: 'agent',
          agentId,
        }
      );
      const existingParticipant = existingParticipants[0] || null;

      if (existingParticipant) {
        logger.info('Agent participant already exists, returning existing', {
          discussionId,
          agentId,
          participantId: existingParticipant.participantId,
        });
        return existingParticipant;
      }

      // Generate unique participant ID
      const participantId = uuidv4();

      // Create new participant with enterprise-grade configuration
      const participant = await this.databaseService.create<DiscussionParticipant>(
        DiscussionParticipant,
        {
          // Core Identity
          discussionId,
          participantType: 'agent',
          participantId,
          agentId,
          displayName,

          // Role & Permissions
          roleInDiscussion,
          permissions,

          // Turn Management
          turnOrder,
          turnWeight,
          canInitiateTurns: true,
          canModerate: roleInDiscussion === 'moderator',
          maxConsecutiveTurns: roleInDiscussion === 'moderator' ? 5 : 3,

          // Advanced Configuration
          participationConfig,
          behavioralConstraints,
          contextAwareness,

          // Lifecycle
          joinedAt: new Date(),
          isActive: true,
          isMuted: false,

          // Analytics
          messageCount: 0,
          expertiseTags: [],
          topics: [],
          interruptionCount: 0,
          questionsAsked: 0,
          questionsAnswered: 0,

          // Timestamps
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      logger.info('Created new agent participant', {
        discussionId,
        agentId,
        participantId: participant.participantId,
        roleInDiscussion,
        permissions: permissions.length,
      });

      return participant;
    } catch (error) {
      logger.error('Error creating agent participant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        agentId,
      });
      throw error;
    }
  }

  /**
   * Get participant by their unique participant ID
   */
  async getParticipantById(participantId: string): Promise<DiscussionParticipant | null> {
    try {
      // Use 'id' (primary key) instead of 'participantId' field for lookup
      const participants = await this.databaseService.findMany<DiscussionParticipant>(
        DiscussionParticipant,
        { id: participantId }
      );
      return participants[0] || null;
    } catch (error) {
      logger.error('Error getting participant by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId,
      });
      return null;
    }
  }

  /**
   * Get all participants for a discussion
   */
  async getDiscussionParticipants(discussionId: string): Promise<DiscussionParticipant[]> {
    try {
      return await this.databaseService.findMany<DiscussionParticipant>(
        DiscussionParticipant,
        { discussionId },
        { order: { joinedAt: 'ASC' } }
      );
    } catch (error) {
      logger.error('Error getting discussion participants', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
      });
      return [];
    }
  }

  /**
   * Get active participants for a discussion (for turn management)
   */
  async getActiveParticipants(discussionId: string): Promise<DiscussionParticipant[]> {
    try {
      return await this.databaseService.findMany<DiscussionParticipant>(
        DiscussionParticipant,
        {
          discussionId,
          isActive: true,
          isMuted: false,
        },
        { order: { turnOrder: 'ASC', joinedAt: 'ASC' } }
      );
    } catch (error) {
      logger.error('Error getting active participants', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
      });
      return [];
    }
  }

  /**
   * Update participant message count and activity
   */
  async updateParticipantActivity(
    participantId: string,
    messageData: {
      messageCount?: number;
      lastMessageAt?: Date;
      contributionScore?: number;
      engagementLevel?: number;
    }
  ): Promise<void> {
    try {
      // First find the participant to get the database ID
      const participant = await this.getParticipantById(participantId);
      if (!participant) {
        logger.error('Participant not found for activity update', { participantId });
        return;
      }

      await this.databaseService.update<DiscussionParticipant>(
        DiscussionParticipant,
        participant.id,
        {
          ...messageData,
          updatedAt: new Date(),
        }
      );

      logger.debug('Updated participant activity', {
        participantId,
        messageCount: messageData.messageCount,
      });
    } catch (error) {
      logger.error('Error updating participant activity', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId,
      });
    }
  }

  /**
   * Get participant by agent ID for a specific discussion
   */
  async getParticipantByAgentId(
    discussionId: string,
    agentId: string
  ): Promise<DiscussionParticipant | null> {
    try {
      const participants = await this.databaseService.findMany<DiscussionParticipant>(
        DiscussionParticipant,
        {
          discussionId,
          participantType: 'agent',
          agentId,
        }
      );
      return participants[0] || null;
    } catch (error) {
      logger.error('Error getting participant by agent ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        agentId,
      });
      return null;
    }
  }

  /**
   * Create multiple agent participants for a discussion (batch operation)
   */
  async createMultipleAgentParticipants(
    discussionId: string,
    agentConfigs: Array<{
      agentId: string;
      displayName?: string;
      roleInDiscussion?:
        | 'moderator'
        | 'participant'
        | 'observer'
        | 'facilitator'
        | 'expert'
        | 'critic';
      permissions?: string[];
      turnOrder?: number;
      turnWeight?: number;
      participationConfig?: Record<string, any>;
      behavioralConstraints?: Record<string, any>;
      contextAwareness?: Record<string, any>;
    }>
  ): Promise<DiscussionParticipant[]> {
    const participants: DiscussionParticipant[] = [];

    for (const config of agentConfigs) {
      try {
        const participant = await this.createAgentParticipant({
          discussionId,
          ...config,
        });
        participants.push(participant);
      } catch (error) {
        logger.error('Error creating agent participant in batch', {
          error: error instanceof Error ? error.message : 'Unknown error',
          discussionId,
          agentId: config.agentId,
        });
        // Continue with other participants even if one fails
      }
    }

    logger.info('Created multiple agent participants', {
      discussionId,
      totalRequested: agentConfigs.length,
      totalCreated: participants.length,
    });

    return participants;
  }

  /**
   * Remove participant from discussion
   */
  async removeParticipant(participantId: string): Promise<void> {
    try {
      // First find the participant to get the database ID
      const participant = await this.getParticipantById(participantId);
      if (!participant) {
        logger.error('Participant not found for removal', { participantId });
        return;
      }

      await this.databaseService.update<DiscussionParticipant>(
        DiscussionParticipant,
        participant.id,
        {
          isActive: false,
          leftAt: new Date(),
          updatedAt: new Date(),
        }
      );

      logger.info('Removed participant from discussion', { participantId });
    } catch (error) {
      logger.error('Error removing participant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId,
      });
      throw error;
    }
  }

  /**
   * Get participant statistics for analytics
   */
  async getParticipantStats(participantId: string): Promise<{
    messageCount: number;
    contributionScore: number;
    engagementLevel: number;
    averageResponseTime: number;
    topTopics: string[];
  } | null> {
    try {
      const participant = await this.getParticipantById(participantId);
      if (!participant) return null;

      return {
        messageCount: participant.messageCount,
        contributionScore: participant.contributionScore || 0,
        engagementLevel: participant.engagementLevel || 0,
        averageResponseTime: participant.totalSpeakingTimeMs || 0,
        topTopics: participant.topics || [],
      };
    } catch (error) {
      logger.error('Error getting participant stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId,
      });
      return null;
    }
  }
}
