import {
  Discussion,
  DiscussionParticipant,
  TurnStrategy,
  TurnStrategyConfig,
  ParticipantRole,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { TurnStrategyInterface } from './round_robin_strategy.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type ModeratorSelection = { participantId: string; moderatorId: string; timestamp: Date };
function isModeratorSelection(v: unknown): v is ModeratorSelection {
  return isRecord(v) && typeof v['participantId'] === 'string' && typeof v['moderatorId'] === 'string';
}

type ModeratorTurnAdvance = { moderatorId: string; timestamp: Date };
function isModeratorTurnAdvance(v: unknown): v is ModeratorTurnAdvance {
  return isRecord(v) && typeof v['moderatorId'] === 'string';
}

export class ModeratedStrategy implements TurnStrategyInterface {
  public readonly strategy = TurnStrategy.MODERATED;
  private readonly strategyType = TurnStrategy.MODERATED;
  private debatePhases: Map<string, 'thesis' | 'antithesis' | 'synthesis'> = new Map();

  async getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    _config?: TurnStrategyConfig
  ): Promise<DiscussionParticipant | null> {
    try {
      const activeParticipants = participants.filter((p) => p.isActive);
      if (activeParticipants.length === 0) {
        return null;
      }

      const moderators = activeParticipants.filter((p) => p.role === ParticipantRole.MODERATOR);
      const nonModerators = activeParticipants.filter((p) => p.role !== ParticipantRole.MODERATOR);

      // Check if there's a pending moderator selection in discussion state
      const pendingSelection = this.getPendingModeratorSelection(discussion);
      if (pendingSelection) {
        const selectedParticipant = participants.find(
          (p) => p.id === pendingSelection.participantId
        );
        if (selectedParticipant && selectedParticipant.isActive) {
          logger.info('Moderator selected next participant', {
            discussionId: discussion.id,
            selectedParticipantId: selectedParticipant.id,
            moderatorId: pendingSelection.moderatorId,
          });
          return selectedParticipant;
        }
      }

      const phase = this.getCurrentDebatePhase(discussion.id);
      this.advanceDebatePhase(discussion.id);

      const selectedParticipant = this.selectParticipantForDebatePhase(
        discussion,
        phase,
        nonModerators,
        moderators
      );

      logger.debug('Debate phase participant selected', {
        discussionId: discussion.id,
        phase,
        selectedParticipantId: selectedParticipant?.id,
      });

      return selectedParticipant;
    } catch (error) {
      logger.error('Error in moderated strategy getNextParticipant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        participantCount: participants.length,
      });
      return null;
    }
  }

  private getCurrentDebatePhase(discussionId: string): 'thesis' | 'antithesis' | 'synthesis' {
    return this.debatePhases.get(discussionId) || 'thesis';
  }

  private advanceDebatePhase(discussionId: string): void {
    const current = this.getCurrentDebatePhase(discussionId);
    if (current === 'thesis') {
      this.debatePhases.set(discussionId, 'antithesis');
      return;
    }

    if (current === 'antithesis') {
      this.debatePhases.set(discussionId, 'synthesis');
      return;
    }

    this.debatePhases.set(discussionId, 'thesis');
  }

  private selectParticipantForDebatePhase(
    discussion: Discussion,
    phase: 'thesis' | 'antithesis' | 'synthesis',
    nonModerators: DiscussionParticipant[],
    moderators: DiscussionParticipant[]
  ): DiscussionParticipant | null {
    if (phase === 'thesis') {
      const thesisPool = nonModerators.length > 0 ? nonModerators : moderators;
      return this.selectMostExpert(thesisPool);
    }

    if (phase === 'antithesis') {
      const antithesisPool = nonModerators.length > 0 ? nonModerators : moderators;
      return this.selectMostOpposed(antithesisPool, discussion.state.currentTurn.participantId);
    }

    if (moderators.length > 0) {
      return moderators[0];
    }

    const synthesisPool = nonModerators.length > 0 ? nonModerators : moderators;
    return this.selectMostBalancedContributor(synthesisPool);
  }

  private selectMostExpert(participants: DiscussionParticipant[]): DiscussionParticipant | null {
    if (participants.length === 0) {
      return null;
    }

    return participants
      .slice()
      .sort((a, b) => this.getExpertiseScore(b) - this.getExpertiseScore(a))[0];
  }

  private selectMostOpposed(
    participants: DiscussionParticipant[],
    currentParticipantId?: string
  ): DiscussionParticipant | null {
    if (participants.length === 0) {
      return null;
    }

    const withAgreementScore = participants
      .filter((participant) => participant.id !== currentParticipantId)
      .map((participant) => ({
        participant,
        agreementScore: this.getAgreementScore(participant),
      }))
      .sort((a, b) => a.agreementScore - b.agreementScore);

    if (withAgreementScore.length > 0) {
      return withAgreementScore[0].participant;
    }

    return (
      participants.find((participant) => participant.id !== currentParticipantId) || participants[0]
    );
  }

  private selectMostBalancedContributor(
    participants: DiscussionParticipant[]
  ): DiscussionParticipant | null {
    if (participants.length === 0) {
      return null;
    }

    const averageMessages =
      participants.reduce((sum, participant) => sum + (participant.messageCount || 0), 0) /
      participants.length;

    return participants.slice().sort((a, b) => {
      const aDistance = Math.abs((a.messageCount || 0) - averageMessages);
      const bDistance = Math.abs((b.messageCount || 0) - averageMessages);
      return aDistance - bDistance;
    })[0];
  }

  private getExpertiseScore(participant: DiscussionParticipant): number {
    let score = 0.5;

    if (participant.role === ParticipantRole.FACILITATOR) {
      score += 0.25;
    }

    if (participant.role === ParticipantRole.MODERATOR) {
      score += 0.15;
    }

    score += Math.min((participant.messageCount || 0) * 0.03, 0.25);
    return score;
  }

  private getAgreementScore(participant: DiscussionParticipant): number {
    const metadata = participant.metadata;
    const raw = metadata?.['agreementScore'];
    if (typeof raw === 'number') {
      return raw;
    }

    return 0.5;
  }

  async canParticipantTakeTurn(
    participant: DiscussionParticipant,
    discussion: Discussion,
    _config?: TurnStrategyConfig
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
      if (_config?.config.type === 'moderated' && _config.config.requireApproval) {
        // For moderated strategy, check if participant has permission
        // Note: MODERATOR role was already handled above, so check for other privileged roles
        return participant.role === ParticipantRole.FACILITATOR;
      }

      return true;
    } catch (error) {
      logger.error('Error checking if participant can take turn in moderated strategy', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id,
      });
      return false;
    }
  }

  async shouldAdvanceTurn(
    discussion: Discussion,
    currentParticipant: DiscussionParticipant,
    _config?: TurnStrategyConfig
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
          moderatorId: moderatorAdvance.moderatorId,
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
          timeoutSeconds: timeoutMs / 1000,
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
        participantId: currentParticipant.id,
      });
      return true;
    }
  }

  async getEstimatedTurnDuration(
    participant: DiscussionParticipant,
    discussion: Discussion,
    _config?: TurnStrategyConfig
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
        baseDuration: discussion.settings.turnTimeout || 600,
      });

      return Math.round(baseDuration);
    } catch (error) {
      logger.error('Error calculating estimated turn duration for moderated strategy', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id,
      });
      return discussion.settings.turnTimeout || 600;
    }
  }

  // Helper methods for moderated strategy specific logic

  private getPendingModeratorSelection(
    discussion: Discussion
  ): { participantId: string; moderatorId: string; timestamp: Date } | null {
    // This would check discussion state for pending moderator selections
    // For now, return null - in real implementation, this would check discussion.state.metadata
    const metadata = discussion.metadata;
    const sel = metadata?.['pendingModeratorSelection'];
    if (isModeratorSelection(sel)) return sel;
    return null;
  }

  private hasModeratorApproval(
    participant: DiscussionParticipant,
    _discussion: Discussion
  ): boolean {
    // Check if participant has received moderator approval
    // This would typically be stored in discussion state or participant metadata
    const metadata = _discussion.metadata;
    const rawApprovals = metadata?.['moderatorApprovals'];
    const approvals = Array.isArray(rawApprovals)
      ? rawApprovals.filter((x): x is string => typeof x === 'string')
      : [];
    return approvals.includes(participant.id ?? '');
  }

  private hasModeratorAdvancedTurn(
    discussion: Discussion
  ): { moderatorId: string; timestamp: Date } | null {
    // Check if moderator has explicitly advanced the turn
    const metadata = discussion.metadata;
    const adv = metadata?.['moderatorTurnAdvance'];
    if (isModeratorTurnAdvance(adv)) return adv;
    return null;
  }

  private hasParticipantIndicatedCompletion(
    participant: DiscussionParticipant,
    _discussion: Discussion
  ): boolean {
    // Check if participant has indicated they're done with their turn
    // This could be through specific keywords, commands, or explicit signals
    const metadata = participant.metadata;
    return metadata?.['turnCompleted'] === true;
  }

  // Public methods for moderator actions

  async selectNextParticipant(
    moderatorId: string,
    selectedParticipantId: string,
    discussion: Discussion
  ): Promise<boolean> {
    try {
      // Validate moderator permissions
      const moderator = discussion.participants.find((p) => p.id === moderatorId);
      if (!moderator || moderator.role !== ParticipantRole.MODERATOR) {
        logger.warn('Non-moderator attempted to select next participant', {
          moderatorId,
          discussionId: discussion.id,
        });
        return false;
      }

      // Validate selected participant
      const selectedParticipant = discussion.participants.find(
        (p) => p.id === selectedParticipantId
      );
      if (!selectedParticipant || !selectedParticipant.isActive) {
        logger.warn('Invalid participant selected by moderator', {
          moderatorId,
          selectedParticipantId,
          discussionId: discussion.id,
        });
        return false;
      }

      // Store the selection in discussion metadata
      // In real implementation, this would update the discussion state
      logger.info('Moderator selected next participant', {
        moderatorId,
        selectedParticipantId,
        discussionId: discussion.id,
      });

      return true;
    } catch (error) {
      logger.error('Error in moderator participant selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        moderatorId,
        selectedParticipantId,
        discussionId: discussion.id,
      });
      return false;
    }
  }

  async advanceTurn(moderatorId: string, discussion: Discussion): Promise<boolean> {
    try {
      // Validate moderator permissions
      const moderator = discussion.participants.find((p) => p.id === moderatorId);
      if (!moderator || moderator.role !== ParticipantRole.MODERATOR) {
        logger.warn('Non-moderator attempted to advance turn', {
          moderatorId,
          discussionId: discussion.id,
        });
        return false;
      }

      // Store the advance action in discussion metadata
      logger.info('Moderator advanced turn', {
        moderatorId,
        discussionId: discussion.id,
      });

      return true;
    } catch (error) {
      logger.error('Error in moderator turn advance', {
        error: error instanceof Error ? error.message : 'Unknown error',
        moderatorId,
        discussionId: discussion.id,
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
        autoAdvance: false,
      },
    };
  }
}
