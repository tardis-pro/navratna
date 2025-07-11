import { 
  Discussion, 
  DiscussionParticipant, 
  TurnStrategy, 
  TurnStrategyConfig 
} from '@uaip/types';
import { logger } from '@uaip/utils';

export interface TurnStrategyInterface {
  strategy: TurnStrategy;
  
  getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    config?: TurnStrategyConfig
  ): Promise<DiscussionParticipant | null>;
  
  canParticipantTakeTurn(
    participant: DiscussionParticipant,
    discussion: Discussion,
    config?: TurnStrategyConfig
  ): Promise<boolean>;
  
  shouldAdvanceTurn(
    discussion: Discussion,
    currentParticipant: DiscussionParticipant,
    config?: TurnStrategyConfig
  ): Promise<boolean>;
  
  getEstimatedTurnDuration(
    participant: DiscussionParticipant,
    discussion: Discussion,
    config?: TurnStrategyConfig
  ): Promise<number>;
}

export class RoundRobinStrategy implements TurnStrategyInterface {
  public readonly strategy = TurnStrategy.ROUND_ROBIN;
  private readonly strategyType = TurnStrategy.ROUND_ROBIN;

  async getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    config?: TurnStrategyConfig
  ): Promise<DiscussionParticipant | null> {
    try {
      // Filter active participants
      const activeParticipants = participants.filter(p => 
        p.isActive
      );

      if (activeParticipants.length === 0) {
        logger.warn('No active participants available for round robin', {
          discussionId: discussion.id,
          totalParticipants: participants.length
        });
        return null;
      }

      // Sort participants by join order for consistent round robin
      activeParticipants.sort((a, b) => 
        new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
      );

      const currentTurnNumber = discussion.state.currentTurn.turnNumber;
      const nextIndex = currentTurnNumber % activeParticipants.length;
      const nextParticipant = activeParticipants[nextIndex];

      logger.debug('Round robin next participant selected', {
        discussionId: discussion.id,
        currentTurnNumber,
        nextIndex,
        nextParticipantId: nextParticipant.id,
        totalActiveParticipants: activeParticipants.length
      });

      return nextParticipant;
    } catch (error) {
      logger.error('Error in round robin strategy getNextParticipant', {
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

      // In round robin, any active participant can take turn when it's their turn
      return true;
    } catch (error) {
      logger.error('Error checking if participant can take turn', {
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
        // No turn start time, should advance
        return true;
      }

      // Check if turn timeout has been reached
      const turnDuration = now.getTime() - new Date(turnStartTime).getTime();
      const timeoutMs = (discussion.settings.turnTimeout || 30) * 1000;
      
      if (turnDuration >= timeoutMs) {
        logger.info('Turn timeout reached, advancing turn', {
          discussionId: discussion.id,
          participantId: currentParticipant.id,
          turnDuration: turnDuration / 1000,
          timeoutSeconds: timeoutMs / 1000
        });
        return true;
      }

      // Check if participant has indicated they're done (this would be handled by message analysis)
      // For round robin, we typically wait for timeout or explicit turn passing
      
      return false;
    } catch (error) {
      logger.error('Error checking if turn should advance', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        participantId: currentParticipant.id
      });
      return true; // Default to advancing on error
    }
  }

  async getEstimatedTurnDuration(
    participant: DiscussionParticipant,
    discussion: Discussion,
    config?: TurnStrategyConfig
  ): Promise<number> {
    try {
      // Base duration from discussion settings (no timeout in config for round robin)
      let baseDuration = discussion.settings.turnTimeout || 30;

      // Adjust based on participant's historical performance
      if (participant.messageCount > 0) {
        // Calculate average response time based on activity
        const avgResponseTime = this.calculateAverageResponseTime(participant);
        if (avgResponseTime > 0) {
          // Use historical data but cap it within reasonable bounds
          baseDuration = Math.min(Math.max(avgResponseTime, 30), 1800); // 30 seconds to 30 minutes
        }
      }

      // Adjust based on discussion complexity or topic
      if (discussion.topic && discussion.topic.length > 500) {
        // Complex topics might need more time
        baseDuration *= 1.2;
      }

      // Adjust based on participant preferences
      if (participant.preferences?.responseDelay) {
        baseDuration += participant.preferences.responseDelay;
      }

      logger.debug('Estimated turn duration calculated', {
        participantId: participant.id,
        discussionId: discussion.id,
        estimatedDuration: baseDuration,
        baseDuration: discussion.settings.turnTimeout || 30
      });

      return Math.round(baseDuration);
    } catch (error) {
      logger.error('Error calculating estimated turn duration', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id
      });
      return discussion.settings.turnTimeout || 30;
    }
  }

  private calculateAverageResponseTime(participant: DiscussionParticipant): number {
    // This would typically query message history to calculate actual response times
    // For now, return a default based on message count as a proxy
    if (participant.messageCount === 0) return 0;
    
    // Simulate calculation - in real implementation, this would analyze message timestamps
    const baseTime = 60; // 1 minute base
    const efficiency = Math.min(participant.messageCount / 10, 1); // More messages = more efficient
    return baseTime * (1 - efficiency * 0.3); // Up to 30% reduction for active participants
  }

  getStrategyType(): TurnStrategy {
    return this.strategyType;
  }

  getStrategyDescription(): string {
    return 'Round Robin: Participants take turns in a fixed order based on join time';
  }

  getStrategyConfig(): TurnStrategyConfig {
    return {
      strategy: this.strategyType,
      config: {
        type: 'round_robin',
        skipInactive: true,
        maxSkips: 3
      }
    };
  }
} 