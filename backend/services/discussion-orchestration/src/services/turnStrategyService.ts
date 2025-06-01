import { 
  Discussion, 
  DiscussionParticipant, 
  TurnStrategy, 
  TurnStrategyConfig 
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { TurnStrategyInterface } from '@/strategies/RoundRobinStrategy';
import { RoundRobinStrategy } from '@/strategies/RoundRobinStrategy';
import { ModeratedStrategy } from '@/strategies/ModeratedStrategy';
import { ContextAwareStrategy } from '@/strategies/ContextAwareStrategy';

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
      const strategy = this.getStrategy(discussion.turnStrategy);
      const nextParticipant = await strategy.getNextParticipant(discussion, participants, config);

      logger.debug('Next participant determined', {
        discussionId: discussion.id,
        strategy: discussion.turnStrategy,
        nextParticipantId: nextParticipant?.id,
        totalParticipants: participants.length,
        activeParticipants: participants.filter(p => p.isActive).length
      });

      return nextParticipant;
    } catch (error) {
      logger.error('Error getting next participant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        strategy: discussion.turnStrategy
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
      const strategy = this.getStrategy(discussion.turnStrategy);
      const canTakeTurn = await strategy.canParticipantTakeTurn(participant, discussion, config);

      logger.debug('Participant turn eligibility checked', {
        participantId: participant.id,
        discussionId: discussion.id,
        strategy: discussion.turnStrategy,
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
        strategy: discussion.turnStrategy
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
      const strategy = this.getStrategy(discussion.turnStrategy);
      const shouldAdvance = await strategy.shouldAdvanceTurn(discussion, currentParticipant, config);

      logger.debug('Turn advance check completed', {
        discussionId: discussion.id,
        participantId: currentParticipant.id,
        strategy: discussion.turnStrategy,
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
        strategy: discussion.turnStrategy
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
      const strategy = this.getStrategy(discussion.turnStrategy);
      const duration = await strategy.getEstimatedTurnDuration(participant, discussion, config);

      logger.debug('Turn duration estimated', {
        participantId: participant.id,
        discussionId: discussion.id,
        strategy: discussion.turnStrategy,
        estimatedDuration: duration,
        participantRole: participant.role
      });

      return duration;
    } catch (error) {
      logger.error('Error estimating turn duration', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id,
        strategy: discussion.turnStrategy
      });
      return config?.timeout || discussion.settings.turnTimeout || 300;
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
      const turnNumber = (discussion.state.currentTurn.turnNumber || 0) + 1;
      
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
        strategy: discussion.turnStrategy
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
        strategy: discussion.turnStrategy
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

      // Timeout validation
      if (config.timeout !== undefined) {
        if (config.timeout < 10) {
          errors.push('Timeout must be at least 10 seconds');
        }
        if (config.timeout > 3600) {
          errors.push('Timeout cannot exceed 1 hour');
        }
      }

      // Strategy-specific validation
      switch (strategyType) {
        case TurnStrategy.MODERATED:
          if (config.restrictions?.requiresModeratorApproval === false) {
            errors.push('Moderated strategy requires moderator approval');
          }
          break;

        case TurnStrategy.CONTEXT_AWARE:
          if (config.contextAware) {
            if (config.contextAware.minRelevanceThreshold < 0 || config.contextAware.minRelevanceThreshold > 1) {
              errors.push('Relevance threshold must be between 0 and 1');
            }
            if (config.contextAware.minEngagementThreshold < 0 || config.contextAware.minEngagementThreshold > 1) {
              errors.push('Engagement threshold must be between 0 and 1');
            }
          }
          break;
      }

      // Restrictions validation
      if (config.restrictions) {
        if (config.restrictions.cooldownPeriod !== undefined && config.restrictions.cooldownPeriod < 0) {
          errors.push('Cooldown period cannot be negative');
        }
        if (config.restrictions.maxMessagesPerTurn !== undefined && config.restrictions.maxMessagesPerTurn < 1) {
          errors.push('Max messages per turn must be at least 1');
        }
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
      const strategy = this.getStrategy(discussion.turnStrategy);

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
      if (discussion.turnStrategy === TurnStrategy.MODERATED) {
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
      const strategy = this.getStrategy(discussion.turnStrategy);

      switch (action) {
        case 'advance_turn':
          // This would be handled by the discussion orchestration service
          return { success: true, message: 'Turn advance initiated' };

        case 'select_next_participant':
          if (discussion.turnStrategy === TurnStrategy.MODERATED && params?.participantId) {
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
        originalStrategy: discussion.turnStrategy,
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
      const fullConfig = { ...discussion.settings.turnStrategyConfig, ...newConfig } as TurnStrategyConfig;
      const validation = this.validateStrategyConfig(discussion.turnStrategy, fullConfig);

      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }

      logger.info('Strategy configuration updated', {
        discussionId: discussion.id,
        strategy: discussion.turnStrategy,
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