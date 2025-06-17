import { 
  Discussion, 
  DiscussionParticipant, 
  TurnStrategy, 
  TurnStrategyConfig 
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { TurnStrategyInterface } from '../strategies/RoundRobinStrategy.js';
import { RoundRobinStrategy } from '../strategies/RoundRobinStrategy.js';
import { ModeratedStrategy } from '../strategies/ModeratedStrategy.js';
import { ContextAwareStrategy } from '../strategies/ContextAwareStrategy.js';

export class TurnStrategyService {
  private strategies: Map<TurnStrategy, TurnStrategyInterface>;
  private defaultStrategy: TurnStrategy = TurnStrategy.ROUND_ROBIN;

  constructor() {
    this.strategies = new Map();
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    try {
      // Register all available strategies
      this.strategies.set(TurnStrategy.ROUND_ROBIN, new RoundRobinStrategy());
      this.strategies.set(TurnStrategy.MODERATED, new ModeratedStrategy());
      this.strategies.set(TurnStrategy.CONTEXT_AWARE, new ContextAwareStrategy());

      logger.info('Turn strategies initialized', {
        availableStrategies: Array.from(this.strategies.keys()),
        defaultStrategy: this.defaultStrategy
      });
    } catch (error) {
      logger.error('Error initializing turn strategies', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get the next participant based on the discussion's turn strategy
   */
  async getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    config?: TurnStrategyConfig
  ): Promise<DiscussionParticipant | null> {
    try {
      const strategy = this.getStrategy(discussion.turnStrategy.strategy);
      const nextParticipant = await strategy.getNextParticipant(discussion, participants, config);

      logger.debug('Next participant determined', {
        discussionId: discussion.id,
        strategy: discussion.turnStrategy.strategy,
        nextParticipantId: nextParticipant?.id,
        totalParticipants: participants.length,
        activeParticipants: participants.filter(p => p.isActive).length
      });

      return nextParticipant;
    } catch (error) {
      logger.error('Error getting next participant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        strategy: discussion.turnStrategy.strategy
      });
      
      // Fallback to default strategy
      return await this.fallbackToDefaultStrategy(discussion, participants, config);
    }
  }

  /**
   * Check if a participant can take a turn
   */
  async canParticipantTakeTurn(
    participant: DiscussionParticipant,
    discussion: Discussion,
    config?: TurnStrategyConfig
  ): Promise<boolean> {
    try {
      const strategy = this.getStrategy(discussion.turnStrategy.strategy);
      const canTakeTurn = await strategy.canParticipantTakeTurn(participant, discussion, config);

      logger.debug('Participant turn eligibility checked', {
        participantId: participant.id,
        discussionId: discussion.id,
        strategy: discussion.turnStrategy.strategy,
        canTakeTurn,
        participantRole: participant.role,
        isActive: participant.isActive
      });

      return canTakeTurn;
    } catch (error) {
      logger.error('Error checking participant turn eligibility', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id,
        strategy: discussion.turnStrategy.strategy
      });
      return false;
    }
  }

  /**
   * Check if the current turn should advance
   */
  async shouldAdvanceTurn(
    discussion: Discussion,
    currentParticipant: DiscussionParticipant,
    config?: TurnStrategyConfig
  ): Promise<boolean> {
    try {
      const strategy = this.getStrategy(discussion.turnStrategy.strategy);
      const shouldAdvance = await strategy.shouldAdvanceTurn(discussion, currentParticipant, config);

      logger.debug('Turn advance check completed', {
        discussionId: discussion.id,
        participantId: currentParticipant.id,
        strategy: discussion.turnStrategy.strategy,
        shouldAdvance,
        turnStartTime: discussion.state.currentTurn.startedAt,
        turnNumber: discussion.state.currentTurn.turnNumber
      });

      return shouldAdvance;
    } catch (error) {
      logger.error('Error checking if turn should advance', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        participantId: currentParticipant.id,
        strategy: discussion.turnStrategy.strategy
      });
      return true; // Default to advancing on error
    }
  }

  /**
   * Get estimated turn duration for a participant
   */
  async getEstimatedTurnDuration(
    participant: DiscussionParticipant,
    discussion: Discussion,
    config?: TurnStrategyConfig
  ): Promise<number> {
    try {
      const strategy = this.getStrategy(discussion.turnStrategy.strategy);
      const duration = await strategy.getEstimatedTurnDuration(participant, discussion, config);

      logger.debug('Turn duration estimated', {
        participantId: participant.id,
        discussionId: discussion.id,
        strategy: discussion.turnStrategy.strategy,
        estimatedDuration: duration,
        participantRole: participant.role
      });

      return duration;
    } catch (error) {
      logger.error('Error estimating turn duration', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id,
        strategy: discussion.turnStrategy.strategy
      });
      return discussion.settings.turnTimeout || 300;
    }
  }

  /**
   * Advance to the next turn
   */
  async advanceTurn(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    config?: TurnStrategyConfig
  ): Promise<{
    nextParticipant: DiscussionParticipant | null;
    turnNumber: number;
    estimatedDuration: number;
  }> {
    try {
      // Get next participant
      const nextParticipant = await this.getNextParticipant(discussion, participants, config);
      
      // Calculate new turn number
      const turnNumber = (discussion.state.currentTurn.turnNumber) + 1;
      
      // Get estimated duration for next participant
      const estimatedDuration = nextParticipant 
        ? await this.getEstimatedTurnDuration(nextParticipant, discussion, config)
        : 0;

      logger.info('Turn advanced', {
        discussionId: discussion.id,
        previousTurnNumber: discussion.state.currentTurn.turnNumber,
        newTurnNumber: turnNumber,
        nextParticipantId: nextParticipant?.id,
        estimatedDuration,
        strategy: discussion.turnStrategy.strategy
      });

      return {
        nextParticipant,
        turnNumber,
        estimatedDuration
      };
    } catch (error) {
      logger.error('Error advancing turn', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        strategy: discussion.turnStrategy.strategy
      });
      throw error;
    }
  }

  /**
   * Get available turn strategies
   */
  getAvailableStrategies(): Array<{
    type: TurnStrategy;
    description: string;
    config: Partial<TurnStrategyConfig>;
  }> {
    const strategies = [];
    
    for (const [type, strategy] of this.strategies) {
      strategies.push({
        type,
        description: (strategy as any).getStrategyDescription?.() || `${type} strategy`,
        config: (strategy as any).getStrategyConfig?.() || {}
      });
    }

    return strategies;
  }

  /**
   * Validate turn strategy configuration
   */
  validateStrategyConfig(
    strategyType: TurnStrategy,
    config: TurnStrategyConfig
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Basic validation
      if (!this.strategies.has(strategyType)) {
        errors.push(`Unknown strategy type: ${strategyType}`);
        return { isValid: false, errors };
      }

      // Validate that strategy matches config type
      if (config.strategy !== strategyType) {
        errors.push(`Strategy type mismatch: expected ${strategyType}, got ${config.strategy}`);
      }

      // Strategy-specific validation based on config type
      switch (config.config.type) {
        case 'round_robin':
          if (config.config.maxSkips < 0) {
            errors.push('Max skips cannot be negative');
          }
          break;

        case 'moderated':
          if (!config.config.moderatorId) {
            errors.push('Moderated strategy requires a moderator ID');
          }
          break;

        case 'context_aware':
          if (config.config.relevanceThreshold < 0 || config.config.relevanceThreshold > 1) {
            errors.push('Relevance threshold must be between 0 and 1');
          }
          if (config.config.expertiseWeight < 0 || config.config.expertiseWeight > 1) {
            errors.push('Expertise weight must be between 0 and 1');
          }
          if (config.config.engagementWeight < 0 || config.config.engagementWeight > 1) {
            errors.push('Engagement weight must be between 0 and 1');
          }
          break;

        case 'priority_based':
          if (!config.config.priorities || config.config.priorities.length === 0) {
            errors.push('Priority-based strategy requires participant priorities');
          }
          break;

        case 'free_form':
          if (config.config.cooldownPeriod < 0) {
            errors.push('Cooldown period cannot be negative');
          }
          break;

        case 'expertise_driven':
          if (!config.config.topicKeywords || config.config.topicKeywords.length === 0) {
            errors.push('Expertise-driven strategy requires topic keywords');
          }
          if (config.config.expertiseThreshold < 0 || config.config.expertiseThreshold > 1) {
            errors.push('Expertise threshold must be between 0 and 1');
          }
          break;
      }

      return { isValid: errors.length === 0, errors };
    } catch (error) {
      logger.error('Error validating strategy config', {
        error: error instanceof Error ? error.message : 'Unknown error',
        strategyType,
        config
      });
      return { isValid: false, errors: ['Validation error occurred'] };
    }
  }

  /**
   * Get strategy-specific actions for moderators
   */
  async getModeratorActions(
    discussion: Discussion,
    moderatorId: string
  ): Promise<Array<{
    action: string;
    description: string;
    available: boolean;
    reason?: string;
  }>> {
    const actions = [];

    try {
      const strategy = this.getStrategy(discussion.turnStrategy.strategy);

      // Common actions
      actions.push({
        action: 'advance_turn',
        description: 'Advance to next turn',
        available: true
      });

      actions.push({
        action: 'pause_discussion',
        description: 'Pause the discussion',
        available: discussion.status === 'active'
      });

      actions.push({
        action: 'resume_discussion',
        description: 'Resume the discussion',
        available: discussion.status === 'paused'
      });

      // Strategy-specific actions
      if (discussion.turnStrategy.strategy === TurnStrategy.MODERATED) {
        const moderatedStrategy = strategy as ModeratedStrategy;
        
        actions.push({
          action: 'select_next_participant',
          description: 'Select the next participant to speak',
          available: true
        });

        actions.push({
          action: 'grant_speaking_permission',
          description: 'Grant speaking permission to a participant',
          available: true
        });
      }

      return actions;
    } catch (error) {
      logger.error('Error getting moderator actions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        moderatorId
      });
      return [];
    }
  }

  /**
   * Execute moderator action
   */
  async executeModeratorAction(
    action: string,
    discussion: Discussion,
    moderatorId: string,
    params?: any
  ): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const strategy = this.getStrategy(discussion.turnStrategy.strategy);

      switch (action) {
        case 'advance_turn':
          // This would be handled by the discussion orchestration service
          return { success: true, message: 'Turn advance initiated' };

        case 'select_next_participant':
          if (discussion.turnStrategy.strategy === TurnStrategy.MODERATED && params?.participantId) {
            const moderatedStrategy = strategy as ModeratedStrategy;
            const success = await moderatedStrategy.selectNextParticipant(
              moderatorId,
              params.participantId,
              discussion
            );
            return { 
              success, 
              message: success ? 'Participant selected' : 'Failed to select participant' 
            };
          }
          return { success: false, message: 'Invalid action for current strategy' };

        default:
          return { success: false, message: 'Unknown moderator action' };
      }
    } catch (error) {
      logger.error('Error executing moderator action', {
        error: error instanceof Error ? error.message : 'Unknown error',
        action,
        discussionId: discussion.id,
        moderatorId
      });
      return { success: false, message: 'Action execution failed' };
    }
  }

  // Private helper methods

  private getStrategy(strategyType: TurnStrategy): TurnStrategyInterface {
    const strategy = this.strategies.get(strategyType);
    if (!strategy) {
      logger.warn('Strategy not found, using default', {
        requestedStrategy: strategyType,
        defaultStrategy: this.defaultStrategy
      });
      return this.strategies.get(this.defaultStrategy)!;
    }
    return strategy;
  }

  private async fallbackToDefaultStrategy(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    config?: TurnStrategyConfig
  ): Promise<DiscussionParticipant | null> {
    try {
      logger.warn('Falling back to default strategy', {
        discussionId: discussion.id,
        originalStrategy: discussion.turnStrategy.strategy,
        fallbackStrategy: this.defaultStrategy
      });

      const defaultStrategy = this.strategies.get(this.defaultStrategy);
      if (!defaultStrategy) {
        logger.error('Default strategy not available');
        return null;
      }

      return await defaultStrategy.getNextParticipant(discussion, participants, config);
    } catch (error) {
      logger.error('Error in fallback strategy', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id
      });
      return null;
    }
  }

  /**
   * Get strategy statistics and performance metrics
   */
  getStrategyMetrics(strategyType: TurnStrategy): {
    usage: number;
    averageTurnDuration: number;
    successRate: number;
  } {
    // This would typically query metrics from a database
    // For now, return placeholder data
    return {
      usage: 0,
      averageTurnDuration: 0,
      successRate: 1.0
    };
  }

  /**
   * Update strategy configuration for a discussion
   */
  async updateStrategyConfig(
    discussion: Discussion,
    newConfig: Partial<TurnStrategyConfig>
  ): Promise<{ success: boolean; errors: string[] }> {
    try {
      // Validate the new configuration
      const fullConfig = { ...discussion.turnStrategy, ...newConfig } as TurnStrategyConfig;
      const validation = this.validateStrategyConfig(discussion.turnStrategy.strategy, fullConfig);

      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      logger.info('Strategy configuration updated', {
        discussionId: discussion.id,
        strategy: discussion.turnStrategy.strategy,
        updatedFields: Object.keys(newConfig)
      });

      return { success: true, errors: [] };
    } catch (error) {
      logger.error('Error updating strategy configuration', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id
      });
      return { success: false, errors: ['Configuration update failed'] };
    }
  }
} 