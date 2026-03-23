import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/infra/database';
<<<<<<< HEAD:apps/shared/services/src/participant_management_service.ts
import type { DiscussionParticipant } from './database/drizzle/schemas/intelligence_schema';

const PARTICIPANTS_TABLE = 'discussion_participants';

type ParticipantRoleInDiscussion = 'moderator' | 'participant' | 'observer' | 'facilitator' | 'expert' | 'critic';

type BaseParticipantOptions = {
  discussionId: string;
  displayName?: string;
  roleInDiscussion?: ParticipantRoleInDiscussion;
  permissions?: string[];
  turnOrder?: number;
  turnWeight?: number;
  participationConfig?: Record<string, unknown>;
  behavioralConstraints?: Record<string, unknown>;
  contextAwareness?: Record<string, unknown>;
};
=======
import type { DiscussionParticipant } from './database/drizzle/schemas/intelligence.schema';

const PARTICIPANTS_TABLE = 'discussion_participants';
>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/participant-management.service.ts

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

  private async createOrFindParticipant(
    discussionId: string,
    participantType: 'agent' | 'user',
    participantId: string,
    participantIdField: 'agentId' | 'userId',
    roleInDiscussion: string,
    meta: {
      displayName?: string;
      permissions?: string[];
      turnOrder?: number;
      turnWeight?: number;
      participationConfig?: Record<string, unknown>;
      behavioralConstraints?: Record<string, unknown>;
      contextAwareness?: Record<string, unknown>;
    }
  ): Promise<DiscussionParticipant> {
    const existingParticipants = await this.databaseService.findMany<DiscussionParticipant>(
      PARTICIPANTS_TABLE,
      { discussionId, participantType, [participantIdField]: participantId }
    );
    const existing = existingParticipants[0] || null;

    if (existing) {
      const nextMetadata = {
        ...((existing.metadata as Record<string, unknown>) || {}),
        ...(meta.displayName !== undefined ? { displayName: meta.displayName } : {}),
        ...(meta.permissions !== undefined ? { permissions: meta.permissions } : {}),
        ...(meta.turnOrder !== undefined ? { turnOrder: meta.turnOrder } : {}),
        ...(meta.turnWeight !== undefined ? { turnWeight: meta.turnWeight } : {}),
        ...(meta.participationConfig !== undefined
          ? { participationConfig: meta.participationConfig }
          : {}),
        ...(meta.behavioralConstraints !== undefined
          ? { behavioralConstraints: meta.behavioralConstraints }
          : {}),
        ...(meta.contextAwareness !== undefined ? { contextAwareness: meta.contextAwareness } : {}),
      };

      const hasMetadataChanges =
        JSON.stringify(nextMetadata) !== JSON.stringify((existing.metadata as Record<string, unknown>) || {});

      if (hasMetadataChanges) {
        const updatedParticipant = await this.databaseService.update<DiscussionParticipant>(
          PARTICIPANTS_TABLE,
          existing.id,
          {
            metadata: nextMetadata,
            updatedAt: new Date(),
          }
        );

        if (updatedParticipant) {
          logger.info(`${participantType} participant already exists, metadata refreshed`, {
            discussionId,
            [participantIdField]: participantId,
            participantId: existing.id,
          });
          return updatedParticipant;
        }
      }

      logger.info(`${participantType} participant already exists, returning existing`, {
        discussionId,
        [participantIdField]: participantId,
        participantId: existing.id,
      });
      return existing;
    }

    const participant = await this.databaseService.create<DiscussionParticipant>(PARTICIPANTS_TABLE, {
      discussionId,
      participantType,
      [participantIdField]: participantId,
      role: roleInDiscussion,
      joinedAt: new Date(),
      isActive: true,
      turnCount: 0,
      messageCount: 0,
      metadata: {
        displayName: meta.displayName,
        permissions: meta.permissions,
        turnOrder: meta.turnOrder,
        turnWeight: meta.turnWeight,
        participationConfig: meta.participationConfig,
        behavioralConstraints: meta.behavioralConstraints,
        contextAwareness: meta.contextAwareness,
      },
    });

    logger.info(`Created new ${participantType} participant`, {
      discussionId,
      [participantIdField]: participantId,
      participantId: participant.id,
      roleInDiscussion,
    });

    return participant;
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
  async createAgentParticipant(options: BaseParticipantOptions & { agentId: string }): Promise<DiscussionParticipant> {
    const {
      discussionId,
      agentId,
      displayName: _displayName,
      roleInDiscussion = 'participant',
      permissions: _permissions,
      turnOrder: _turnOrder,
      turnWeight: _turnWeight,
      participationConfig,
      behavioralConstraints,
      contextAwareness,
    } = options;

    try {
<<<<<<< HEAD:apps/shared/services/src/participant_management_service.ts
      return await this.createOrFindParticipant(
        discussionId, 'agent', agentId, 'agentId', roleInDiscussion,
        {
          displayName: _displayName,
          permissions: _permissions,
          turnOrder: _turnOrder,
          turnWeight: _turnWeight,
          participationConfig,
          behavioralConstraints,
          contextAwareness,
        }
      );
=======
      // Check if participant already exists for this agent in this discussion
      const existingParticipants = await this.databaseService.findMany<DiscussionParticipant>(
        PARTICIPANTS_TABLE,
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
          participantId: existingParticipant.id,
        });
        return existingParticipant;
      }

      // Create new participant
      const participant = await this.databaseService.create<DiscussionParticipant>(
        PARTICIPANTS_TABLE,
        {
          discussionId,
          participantType: 'agent',
          agentId,
          role: roleInDiscussion,
          joinedAt: new Date(),
          isActive: true,
          turnCount: 0,
          messageCount: 0,
          metadata: {
            participationConfig,
            behavioralConstraints,
            contextAwareness,
          },
        }
      );

      logger.info('Created new agent participant', {
        discussionId,
        agentId,
        participantId: participant.id,
        roleInDiscussion,
      });

      return participant;
>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/participant-management.service.ts
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
   * Create or retrieve a participant for a user in a discussion
   */
  async createUserParticipant(options: BaseParticipantOptions & { userId: string }): Promise<DiscussionParticipant> {
    const {
      discussionId,
      userId,
      displayName: _displayName,
      roleInDiscussion = 'participant',
      permissions: _permissions,
      turnOrder: _turnOrder,
      turnWeight: _turnWeight,
      participationConfig,
      behavioralConstraints,
      contextAwareness,
    } = options;

    try {
<<<<<<< HEAD:apps/shared/services/src/participant_management_service.ts
      return await this.createOrFindParticipant(
        discussionId, 'user', userId, 'userId', roleInDiscussion,
        {
          displayName: _displayName,
          permissions: _permissions,
          turnOrder: _turnOrder,
          turnWeight: _turnWeight,
          participationConfig,
          behavioralConstraints,
          contextAwareness,
        }
      );
=======
      const existingParticipants = await this.databaseService.findMany<DiscussionParticipant>(
        PARTICIPANTS_TABLE,
        {
          discussionId,
          participantType: 'user',
          userId,
        }
      );
      const existingParticipant = existingParticipants[0] || null;

      if (existingParticipant) {
        logger.info('User participant already exists, returning existing', {
          discussionId,
          userId,
          participantId: existingParticipant.id,
        });
        return existingParticipant;
      }

      const participant = await this.databaseService.create<DiscussionParticipant>(
        PARTICIPANTS_TABLE,
        {
          discussionId,
          participantType: 'user',
          userId,
          role: roleInDiscussion,
          joinedAt: new Date(),
          isActive: true,
          turnCount: 0,
          messageCount: 0,
          metadata: {
            participationConfig,
            behavioralConstraints,
            contextAwareness,
          },
        }
      );

      logger.info('Created new user participant', {
        discussionId,
        userId,
        participantId: participant.id,
        roleInDiscussion,
      });

      return participant;
>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/participant-management.service.ts
    } catch (error) {
      logger.error('Error creating user participant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get participant by their unique ID
   */
  async getParticipantById(participantId: string): Promise<DiscussionParticipant | null> {
    try {
      const participants = await this.databaseService.findMany<DiscussionParticipant>(
        PARTICIPANTS_TABLE,
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
        PARTICIPANTS_TABLE,
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
        PARTICIPANTS_TABLE,
        {
          discussionId,
          isActive: true,
        },
        { order: { joinedAt: 'ASC' } }
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
      const participant = await this.getParticipantById(participantId);
      if (!participant) {
        logger.error('Participant not found for activity update', { participantId });
        return;
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (messageData.messageCount !== undefined) {
        updateData.messageCount = messageData.messageCount;
      }
      if (messageData.lastMessageAt !== undefined) {
        updateData.metadata = {
<<<<<<< HEAD:apps/shared/services/src/participant_management_service.ts
          ...((participant.metadata as Record<string, unknown>) || {}),
=======
          ...(participant.metadata as Record<string, unknown> || {}),
>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/participant-management.service.ts
          lastMessageAt: messageData.lastMessageAt,
          contributionScore: messageData.contributionScore,
          engagementLevel: messageData.engagementLevel,
        };
      }

      await this.databaseService.update<DiscussionParticipant>(
        PARTICIPANTS_TABLE,
        participant.id,
        updateData
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
        PARTICIPANTS_TABLE,
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
    agentConfigs: Array<Omit<BaseParticipantOptions, 'discussionId'> & { agentId: string }>
  ): Promise<DiscussionParticipant[]> {
    const settledResults = await Promise.allSettled(
      agentConfigs.map((config) =>
        this.createAgentParticipant({
          discussionId,
          ...config,
        })
      )
    );

    const participants = settledResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [result.value];
      }

      logger.error('Error creating agent participant in batch', {
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        discussionId,
        agentId: agentConfigs[index].agentId,
      });

      return [];
    });

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
      const participant = await this.getParticipantById(participantId);
      if (!participant) {
        logger.error('Participant not found for removal', { participantId });
        return;
      }

<<<<<<< HEAD:apps/shared/services/src/participant_management_service.ts
      await this.databaseService.update<DiscussionParticipant>(PARTICIPANTS_TABLE, participant.id, {
        isActive: false,
        leftAt: new Date(),
        updatedAt: new Date(),
      });
=======
      await this.databaseService.update<DiscussionParticipant>(
        PARTICIPANTS_TABLE,
        participant.id,
        {
          isActive: false,
          leftAt: new Date(),
          updatedAt: new Date(),
        }
      );
>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/participant-management.service.ts

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

      const metadata = (participant.metadata || {}) as Record<string, unknown>;

      return {
        messageCount: participant.messageCount,
        contributionScore: (metadata.contributionScore as number) || 0,
        engagementLevel: (metadata.engagementLevel as number) || 0,
        averageResponseTime: (metadata.totalSpeakingTimeMs as number) || 0,
        topTopics: (metadata.topics as string[]) || [],
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
