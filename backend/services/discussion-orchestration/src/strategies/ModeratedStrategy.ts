import { 
  Discussion, 
  DiscussionParticipant, 
  TurnStrategy, 
  TurnStrategyConfig,
  ParticipantRole 
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { TurnStrategyInterface } from './RoundRobinStrategy.js';

export class ModeratedStrategy implements TurnStrategyInterface {
  private readonly strategyType = TurnStrategy.MODERATED;

  async getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    config?: TurnStrategyConfig
  ): Promise<DiscussionParticipant | null> {
    try {
      // In moderated strategy, the moderator decides who goes next
      // This method would typically be called after moderator selection
      
      // Find moderators
      const moderators = participants.filter(p => 
        p.role === ParticipantRole.MODERATOR && p.isActive
      );

      if (moderators.length === 0) {
        logger.warn('No active moderators found for moderated discussion', {
          discussionId: discussion.id,
          totalParticipants: participants.length
        });
        
        // Fallback: auto-assign first active participant as moderator
        const activeParticipants = participants.filter(p => p.isActive);
        if (activeParticipants.length > 0) {
          logger.info('Auto-assigning moderator role', {
            discussionId: discussion.id,
            newModeratorId: activeParticipants[0].id
          });
          return activeParticipants[0];
        }
        return null;
      }

      // Check if there's a pending moderator selection in discussion state
      const pendingSelection = this.getPendingModeratorSelection(discussion);
      if (pendingSelection) {
        const selectedParticipant = participants.find(p => p.id === pendingSelection.participantId);
        if (selectedParticipant && selectedParticipant.isActive) {
          logger.info('Moderator selected next participant', {
            discussionId: discussion.id,
            selectedParticipantId: selectedParticipant.id,
            moderatorId: pendingSelection.moderatorId
          });
          return selectedParticipant;
        }
      }

      // If no pending selection, return the moderator to make the selection
      const primaryModerator = moderators[0]; // Use first moderator as primary
      
      logger.debug('Returning moderator for participant selection', {
        discussionId: discussion.id,
        moderatorId: primaryModerator.id
      });

      return primaryModerator;
    } catch (error) {
      logger.error('Error in moderated strategy getNextParticipant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        participantCount: participants.length
      });
      return null;
    }
  }

  async canParticipantTakeTurn(
    participant: DiscussionParticipant,
    discussion: Discussion,
    config?: TurnStrategyConfig
  ): Promise<boolean> {
    try {
      // Basic checks
      if (!participant.isActive) {
        return false;
      }

      // No permissions check needed - using isActive instead

      // Check if participant is in the discussion
      if (participant.discussionId !== discussion.id) {
        return false;
      }

      // In moderated strategy, participants need moderator approval
      if (participant.role === ParticipantRole.MODERATOR) {
        // Moderators can always take turns
        return true;
      }

      // Check if this participant has been selected by moderator
      const pendingSelection = this.getPendingModeratorSelection(discussion);
      if (pendingSelection && pendingSelection.participantId === participant.id) {
        return true;
      }

      // Check if moderator approval is required for this strategy
      if (config?.config.type === 'moderated' && config.config.requireApproval) {
        // For moderated strategy, check if participant has permission
        // Note: MODERATOR role was already handled above, so check for other privileged roles
        return participant.role === ParticipantRole.FACILITATOR;
      }

      return true;
    } catch (error) {
      logger.error('Error checking if participant can take turn in moderated strategy', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id
      });
      return false;
    }
  }

  async shouldAdvanceTurn(
    discussion: Discussion,
    currentParticipant: DiscussionParticipant,
    config?: TurnStrategyConfig
  ): Promise<boolean> {
    try {
      const now = new Date();
      const turnStartTime = discussion.state.currentTurn.startedAt;
      
      if (!turnStartTime) {
        return true;
      }

      // Check if moderator has explicitly advanced the turn
      const moderatorAdvance = this.hasModeratorAdvancedTurn(discussion);
      if (moderatorAdvance) {
        logger.info('Moderator explicitly advanced turn', {
          discussionId: discussion.id,
          participantId: currentParticipant.id,
          moderatorId: moderatorAdvance.moderatorId
        });
        return true;
      }

      // Check timeout (longer timeout for moderated discussions)
      const turnDuration = now.getTime() - new Date(turnStartTime).getTime();
      const timeoutMs = (discussion.settings.turnTimeout || 600) * 1000; // Default 10 minutes
      
      if (turnDuration >= timeoutMs) {
        logger.info('Turn timeout reached in moderated discussion', {
          discussionId: discussion.id,
          participantId: currentParticipant.id,
          turnDuration: turnDuration / 1000,
          timeoutSeconds: timeoutMs / 1000
        });
        return true;
      }

      // Check if participant has indicated completion
      if (this.hasParticipantIndicatedCompletion(currentParticipant, discussion)) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error checking if turn should advance in moderated strategy', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        participantId: currentParticipant.id
      });
      return true;
    }
  }

  async getEstimatedTurnDuration(
    participant: DiscussionParticipant,
    discussion: Discussion,
    config?: TurnStrategyConfig
  ): Promise<number> {
    try {
      // Base duration (longer for moderated discussions)
      let baseDuration = discussion.settings.turnTimeout || 600; // 10 minutes default

      // Moderators might need more time to facilitate
      if (participant.role === ParticipantRole.MODERATOR) {
        baseDuration *= 1.5;
      }

      // Adjust based on participant expertise and role
      if (participant.role === ParticipantRole.FACILITATOR) {
        baseDuration *= 1.3; // Facilitators might need more time for detailed responses
      }

      // Adjust based on discussion complexity
      if (discussion.participants.length > 5) {
        baseDuration *= 1.2; // More participants = more complex coordination
      }

      // Adjust based on participant preferences
      if (participant.preferences?.responseDelay) {
        baseDuration += participant.preferences.responseDelay;
      }

      logger.debug('Estimated turn duration calculated for moderated strategy', {
        participantId: participant.id,
        discussionId: discussion.id,
        participantRole: participant.role,
        estimatedDuration: baseDuration,
        baseDuration: discussion.settings.turnTimeout || 600
      });

      return Math.round(baseDuration);
    } catch (error) {
      logger.error('Error calculating estimated turn duration for moderated strategy', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id
      });
      return discussion.settings.turnTimeout || 600;
    }
  }

  // Helper methods for moderated strategy specific logic

  private getPendingModeratorSelection(discussion: Discussion): {  participantId: string; moderatorId: string; timestamp: Date } | null {
    // This would check discussion state for pending moderator selections
    // For now, return null - in real implementation, this would check discussion.state.metadata
    const metadata = discussion.metadata as any;
    return metadata?.pendingModeratorSelection || null;
  }

  private hasModeratorApproval(participant: DiscussionParticipant, discussion: Discussion): boolean {
    // Check if participant has received moderator approval
    // This would typically be stored in discussion state or participant metadata
    const metadata = discussion.metadata as any;
    const approvals = metadata?.moderatorApprovals || [];
    return approvals.includes(participant.id);
  }

  private hasModeratorAdvancedTurn(discussion: Discussion): { moderatorId: string; timestamp: Date } | null {
    // Check if moderator has explicitly advanced the turn
    const metadata = discussion.metadata as any;
    return metadata?.moderatorTurnAdvance || null;
  }

  private hasParticipantIndicatedCompletion(participant: DiscussionParticipant, discussion: Discussion): boolean {
    // Check if participant has indicated they're done with their turn
    // This could be through specific keywords, commands, or explicit signals
    const metadata = participant.metadata as any;
    return metadata?.turnCompleted === true;
  }

  // Public methods for moderator actions

  async selectNextParticipant(
    moderatorId: string,
    selectedParticipantId: string,
    discussion: Discussion
  ): Promise<boolean> {
    try {
      // Validate moderator permissions
      const moderator = discussion.participants.find(p => p.id === moderatorId);
      if (!moderator || moderator.role !== ParticipantRole.MODERATOR) {
        logger.warn('Non-moderator attempted to select next participant', {
          moderatorId,
          discussionId: discussion.id
        });
        return false;
      }

      // Validate selected participant
      const selectedParticipant = discussion.participants.find(p => p.id === selectedParticipantId);
      if (!selectedParticipant || !selectedParticipant.isActive) {
        logger.warn('Invalid participant selected by moderator', {
          moderatorId,
          selectedParticipantId,
          discussionId: discussion.id
        });
        return false;
      }

      // Store the selection in discussion metadata
      // In real implementation, this would update the discussion state
      logger.info('Moderator selected next participant', {
        moderatorId,
        selectedParticipantId,
        discussionId: discussion.id
      });

      return true;
    } catch (error) {
      logger.error('Error in moderator participant selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        moderatorId,
        selectedParticipantId,
        discussionId: discussion.id
      });
      return false;
    }
  }

  async advanceTurn(moderatorId: string, discussion: Discussion): Promise<boolean> {
    try {
      // Validate moderator permissions
      const moderator = discussion.participants.find(p => p.id === moderatorId);
      if (!moderator || moderator.role !== ParticipantRole.MODERATOR) {
        logger.warn('Non-moderator attempted to advance turn', {
          moderatorId,
          discussionId: discussion.id
        });
        return false;
      }

      // Store the advance action in discussion metadata
      logger.info('Moderator advanced turn', {
        moderatorId,
        discussionId: discussion.id
      });

      return true;
    } catch (error) {
      logger.error('Error in moderator turn advance', {
        error: error instanceof Error ? error.message : 'Unknown error',
        moderatorId,
        discussionId: discussion.id
      });
      return false;
    }
  }

  getStrategyType(): TurnStrategy {
    return this.strategyType;
  }

  getStrategyDescription(): string {
    return 'Moderated: A moderator controls turn flow and participant selection';
  }

  getStrategyConfig(): TurnStrategyConfig {
    return {
      strategy: this.strategyType,
      config: {
        type: 'moderated',
        moderatorId: '',
        requireApproval: true,
        autoAdvance: false
      }
    };
  }
} 