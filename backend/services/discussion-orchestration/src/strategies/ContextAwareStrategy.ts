import { 
  Discussion, 
  DiscussionParticipant, 
  TurnStrategy, 
  TurnStrategyConfig,
  ParticipantRole,
  DiscussionMessage 
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { TurnStrategyInterface } from '@/strategies/RoundRobinStrategy';

interface ContextAnalysis {
  topicRelevance: Map<string, number>; // participant ID -> relevance score
  expertiseMatch: Map<string, number>; // participant ID -> expertise match score
  engagementLevel: Map<string, number>; // participant ID -> engagement score
  conversationFlow: {
    lastSpeakers: string[];
    topicShifts: number;
    questionsPending: string[];
    consensusLevel: number;
  };
  recommendations: {
    nextSpeaker: string;
    reason: string;
    confidence: number;
    alternatives: Array<{  participantId: number; score: number; reason: string }>;
  };
}

export class ContextAwareStrategy implements TurnStrategyInterface {
  private readonly strategyType = TurnStrategy.CONTEXT_AWARE;
  private contextCache = new Map<string, { analysis: ContextAnalysis; timestamp: Date }>();
  private readonly cacheTimeout = 30000; // 30 seconds

  async getNextParticipant(
    discussion: Discussion,
    participants: DiscussionParticipant[],
    config?: TurnStrategyConfig
  ): Promise<DiscussionParticipant | null> {
    try {
      // Get active participants
      const activeParticipants = participants.filter(p => 
        p.isActive && 
        p.permissions?.canSendMessages !== false
      );

      if (activeParticipants.length === 0) {
        logger.warn('No active participants available for context-aware strategy', {
          discussionId: discussion.id,
          totalParticipants: participants.length
        });
        return null;
      }

      if (activeParticipants.length === 1) {
        return activeParticipants[0];
      }

      // Analyze discussion context
      const contextAnalysis = await this.analyzeDiscussionContext(discussion, activeParticipants);
      
      // Find the recommended next participant
      const recommendedParticipantId = contextAnalysis.recommendations.nextSpeaker;
      const nextParticipant = activeParticipants.find(p => p.id === recommendedParticipantId);

      if (!nextParticipant) {
        // Fallback to highest scoring alternative
        const alternatives = contextAnalysis.recommendations.alternatives;
        if (alternatives.length > 0) {
          const fallbackParticipant = activeParticipants.find(p => p.id === alternatives[0].participantId);
          if (fallbackParticipant) {
            logger.info('Using fallback participant for context-aware strategy', {
              discussionId: discussion.id,
              recommendedId: recommendedParticipantId,
              fallbackId: fallbackParticipant.id,
              reason: alternatives[0].reason
            });
            return fallbackParticipant;
          }
        }

        // Final fallback to round-robin
        const currentTurnNumber = discussion.state.currentTurn.turnNumber || 0;
        const fallbackIndex = currentTurnNumber % activeParticipants.length;
        return activeParticipants[fallbackIndex];
      }

      logger.info('Context-aware strategy selected next participant', {
        discussionId: discussion.id,
        selectedParticipantId: nextParticipant.id,
        reason: contextAnalysis.recommendations.reason,
        confidence: contextAnalysis.recommendations.confidence,
        alternatives: contextAnalysis.recommendations.alternatives.length
      });

      return nextParticipant;
    } catch (error) {
      logger.error('Error in context-aware strategy getNextParticipant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id,
        participantCount: participants.length
      });
      
      // Fallback to round-robin on error
      const activeParticipants = participants.filter(p => p.isActive);
      if (activeParticipants.length > 0) {
        const currentTurnNumber = discussion.state.currentTurn.turnNumber || 0;
        const fallbackIndex = currentTurnNumber % activeParticipants.length;
        return activeParticipants[fallbackIndex];
      }
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

      if (participant.permissions?.canSendMessages === false) {
        return false;
      }

      if (participant.discussionId !== discussion.id) {
        return false;
      }

      // Context-aware specific checks
      const contextAnalysis = await this.getOrCreateContextAnalysis(discussion, [participant]);
      
      // Check if participant is contextually relevant
      const relevanceScore = contextAnalysis.topicRelevance.get(participant.id) || 0;
      const minRelevanceThreshold = (config?.config.type === 'context_aware' ? config.config.relevanceThreshold : 0.3);
      
      if (relevanceScore < minRelevanceThreshold) {
        logger.debug('Participant below relevance threshold', {
          participantId: participant.id,
          discussionId: discussion.id,
          relevanceScore,
          threshold: minRelevanceThreshold
        });
        return false;
      }

      // Check engagement level
      const engagementScore = contextAnalysis.engagementLevel.get(participant.id) || 0;
      const minEngagementThreshold = (config?.config.type === 'context_aware' ? config.config.engagementWeight : 0.2);
      
      if (engagementScore < minEngagementThreshold) {
        logger.debug('Participant below engagement threshold', {
          participantId: participant.id,
          discussionId: discussion.id,
          engagementScore,
          threshold: minEngagementThreshold
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking if participant can take turn in context-aware strategy', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id
      });
      return true; // Default to allowing on error
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

      // Analyze context to determine if turn should advance
      const contextAnalysis = await this.getOrCreateContextAnalysis(discussion, [currentParticipant]);
      
      // Check if participant has addressed pending questions or topics
      const hasAddressedPendingItems = await this.hasAddressedPendingItems(
        currentParticipant, 
        discussion, 
        contextAnalysis
      );

      if (hasAddressedPendingItems) {
        logger.info('Participant has addressed pending items, advancing turn', {
          discussionId: discussion.id,
          participantId: currentParticipant.id
        });
        return true;
      }

      // Check if another participant is more contextually relevant now
      const shouldYieldToMoreRelevant = await this.shouldYieldToMoreRelevantParticipant(
        currentParticipant,
        discussion,
        contextAnalysis,
        config
      );

      if (shouldYieldToMoreRelevant) {
        logger.info('More relevant participant available, advancing turn', {
          discussionId: discussion.id,
          currentParticipantId: currentParticipant.id
        });
        return true;
      }

      // Check timeout with context-aware adjustments
      const turnDuration = now.getTime() - new Date(turnStartTime).getTime();
      const baseTimeout = discussion.settings.turnTimeout || 300;
      
      // Adjust timeout based on context
      const adjustedTimeout = this.calculateContextAwareTimeout(
        baseTimeout,
        currentParticipant,
        contextAnalysis
      );
      
      if (turnDuration >= adjustedTimeout * 1000) {
        logger.info('Context-aware timeout reached, advancing turn', {
          discussionId: discussion.id,
          participantId: currentParticipant.id,
          turnDuration: turnDuration / 1000,
          adjustedTimeout,
          baseTimeout
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error checking if turn should advance in context-aware strategy', {
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
      const baseDuration = discussion.settings.turnTimeout || 300;
      
      // Get context analysis
      const contextAnalysis = await this.getOrCreateContextAnalysis(discussion, [participant]);
      
      // Calculate context-aware duration
      const adjustedDuration = this.calculateContextAwareTimeout(
        baseDuration,
        participant,
        contextAnalysis
      );

      logger.debug('Context-aware turn duration calculated', {
        participantId: participant.id,
        discussionId: discussion.id,
        baseDuration,
        adjustedDuration,
        relevanceScore: contextAnalysis.topicRelevance.get(participant.id),
        expertiseScore: contextAnalysis.expertiseMatch.get(participant.id)
      });

      return Math.round(adjustedDuration);
    } catch (error) {
      logger.error('Error calculating context-aware turn duration', {
        error: error instanceof Error ? error.message : 'Unknown error',
        participantId: participant.id,
        discussionId: discussion.id
      });
      return discussion.settings.turnTimeout || 300;
    }
  }

  // Context analysis methods

  private async analyzeDiscussionContext(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<ContextAnalysis> {
    try {
      // Check cache first
      const cached = this.contextCache.get(discussion.id);
      if (cached && (new Date().getTime() - cached.timestamp.getTime()) < this.cacheTimeout) {
        return cached.analysis;
      }

      // Analyze topic relevance
      const topicRelevance = await this.analyzeTopicRelevance(discussion, participants);
      
      // Analyze expertise match
      const expertiseMatch = await this.analyzeExpertiseMatch(discussion, participants);
      
      // Analyze engagement levels
      const engagementLevel = await this.analyzeEngagementLevel(discussion, participants);
      
      // Analyze conversation flow
      const conversationFlow = await this.analyzeConversationFlow(discussion);
      
      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        participants,
        topicRelevance,
        expertiseMatch,
        engagementLevel,
        conversationFlow
      );

      const analysis: ContextAnalysis = {
        topicRelevance,
        expertiseMatch,
        engagementLevel,
        conversationFlow,
        recommendations
      };

      // Cache the analysis
      this.contextCache.set(discussion.id, {
        analysis,
        timestamp: new Date()
      });

      return analysis;
    } catch (error) {
      logger.error('Error analyzing discussion context', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: discussion.id
      });
      
      // Return default analysis on error
      return this.getDefaultContextAnalysis(participants);
    }
  }

  private async analyzeTopicRelevance(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<Map<string, number>> {
    const relevanceMap = new Map<string, number>();
    
    // This would typically use NLP/AI to analyze topic relevance
    // For now, use a simplified heuristic based on participant expertise and recent messages
    
    for (const participant of participants) {
      let relevanceScore = 0.5; // Base score
      
      // Boost score based on expertise match with discussion topic
      if (discussion.topic) {
        // Simplified keyword matching - in real implementation, use semantic analysis
        const topicKeywords = discussion.topic.toLowerCase().split(' ');
        const participantExpertise = participant.personaId ? 
          await this.getParticipantExpertise(participant.personaId) : [];
        
        const expertiseMatch = participantExpertise.some(expertise =>
          topicKeywords.some(keyword => expertise.toLowerCase().includes(keyword))
        );
        
        if (expertiseMatch) {
          relevanceScore += 0.3;
        }
      }
      
      // Adjust based on recent participation
      if (participant.messageCount > 0) {
        relevanceScore += Math.min(participant.messageCount * 0.05, 0.2);
      }
      
      relevanceMap.set(participant.id, Math.min(relevanceScore, 1.0));
    }
    
    return relevanceMap;
  }

  private async analyzeExpertiseMatch(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<Map<string, number>> {
    const expertiseMap = new Map<string, number>();
    
    for (const participant of participants) {
      let expertiseScore = 0.5; // Base score
      
      // Boost for expert role
      if (participant.role === ParticipantRole.EXPERT) {
        expertiseScore += 0.3;
      }
      
      // Boost for moderator role
      if (participant.role === ParticipantRole.MODERATOR) {
        expertiseScore += 0.2;
      }
      
      // Boost based on historical performance in similar discussions
      // This would query historical data in real implementation
      expertiseScore += Math.random() * 0.2; // Placeholder
      
      expertiseMap.set(participant.id, Math.min(expertiseScore, 1.0));
    }
    
    return expertiseMap;
  }

  private async analyzeEngagementLevel(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<Map<string, number>> {
    const engagementMap = new Map<string, number>();
    
    for (const participant of participants) {
      let engagementScore = 0.5; // Base score
      
      // Recent activity boost
      if (participant.lastActiveAt) {
        const timeSinceActive = new Date().getTime() - new Date(participant.lastActiveAt).getTime();
        const hoursSinceActive = timeSinceActive / (1000 * 60 * 60);
        
        if (hoursSinceActive < 1) {
          engagementScore += 0.3;
        } else if (hoursSinceActive < 24) {
          engagementScore += 0.1;
        }
      }
      
      // Message frequency boost
      const messageRatio = participant.messageCount / Math.max(discussion.state.messageCount, 1);
      engagementScore += Math.min(messageRatio * 0.3, 0.2);
      
      engagementMap.set(participant.id, Math.min(engagementScore, 1.0));
    }
    
    return engagementMap;
  }

  private async analyzeConversationFlow(discussion: Discussion): Promise<ContextAnalysis['conversationFlow']> {
    // This would analyze recent messages to understand conversation flow
    // For now, return simplified analysis
    
    return {
      lastSpeakers: [], // Would contain recent speaker IDs
      topicShifts: 0, // Number of topic changes detected
      questionsPending: [], // Unanswered questions
      consensusLevel: discussion.state.consensusLevel || 0
    };
  }

  private async generateRecommendations(
    participants: DiscussionParticipant[],
    topicRelevance: Map<string, number>,
    expertiseMatch: Map<string, number>,
    engagementLevel: Map<string, number>,
    conversationFlow: ContextAnalysis['conversationFlow']
  ): Promise<ContextAnalysis['recommendations']> {
    
    // Calculate composite scores for each participant
    const participantScores = participants.map(participant => {
      const relevance = topicRelevance.get(participant.id) || 0;
      const expertise = expertiseMatch.get(participant.id) || 0;
      const engagement = engagementLevel.get(participant.id) || 0;
      
      // Weighted composite score
      const compositeScore = (relevance * 0.4) + (expertise * 0.3) + (engagement * 0.3);
      
      return {
        participantId: participant.id,
        score: compositeScore,
        reason: this.generateRecommendationReason(relevance, expertise, engagement)
      };
    });
    
    // Sort by score
    participantScores.sort((a, b) => b.score - a.score);
    
    const topChoice = participantScores[0];
    const alternatives = participantScores.slice(1, 4); // Top 3 alternatives
    
    return {
      nextSpeaker: topChoice.participantId,
      reason: topChoice.reason,
      confidence: topChoice.score,
      alternatives
    };
  }

  private generateRecommendationReason(relevance: number, expertise: number, engagement: number): string {
    const factors = [];
    
    if (relevance > 0.7) factors.push('high topic relevance');
    if (expertise > 0.7) factors.push('strong expertise match');
    if (engagement > 0.7) factors.push('high engagement level');
    
    if (factors.length === 0) {
      return 'balanced participant selection';
    }
    
    return `Selected based on ${factors.join(', ')}`;
  }

  // Helper methods

  private async getOrCreateContextAnalysis(
    discussion: Discussion,
    participants: DiscussionParticipant[]
  ): Promise<ContextAnalysis> {
    const cached = this.contextCache.get(discussion.id);
    if (cached && (new Date().getTime() - cached.timestamp.getTime()) < this.cacheTimeout) {
      return cached.analysis;
    }
    
    return await this.analyzeDiscussionContext(discussion, participants);
  }

  private async getParticipantExpertise(personaId: number): Promise<string[]> {
    // This would fetch persona expertise from the persona service
    // For now, return empty array
    return [];
  }

  private async hasAddressedPendingItems(
    participant: DiscussionParticipant,
    discussion: Discussion,
    contextAnalysis: ContextAnalysis
  ): Promise<boolean> {
    // This would analyze recent messages to see if pending questions/topics were addressed
    return false;
  }

  private async shouldYieldToMoreRelevantParticipant(
    currentParticipant: DiscussionParticipant,
    discussion: Discussion,
    contextAnalysis: ContextAnalysis,
    config?: TurnStrategyConfig
  ): Promise<boolean> {
    const currentRelevance = contextAnalysis.topicRelevance.get(currentParticipant.id) || 0;
    const threshold = 0.3; // Default threshold since config.contextAware doesn't exist
    
    // Check if any other participant has significantly higher relevance
    for (const [participantId, relevance] of contextAnalysis.topicRelevance) {
      if (participantId !== currentParticipant.id && relevance > currentRelevance + threshold) {
        return true;
      }
    }
    
    return false;
  }

  private calculateContextAwareTimeout(
    baseTimeout: number,
    participant: DiscussionParticipant,
    contextAnalysis: ContextAnalysis
  ): number {
    let adjustedTimeout = baseTimeout;
    
    const relevance = contextAnalysis.topicRelevance.get(participant.id) || 0.5;
    const expertise = contextAnalysis.expertiseMatch.get(participant.id) || 0.5;
    
    // Give more time to highly relevant/expert participants
    if (relevance > 0.8 || expertise > 0.8) {
      adjustedTimeout *= 1.5;
    } else if (relevance < 0.3 && expertise < 0.3) {
      adjustedTimeout *= 0.7;
    }
    
    return adjustedTimeout;
  }

  private getDefaultContextAnalysis(participants: DiscussionParticipant[]): ContextAnalysis {
    const defaultMap = new Map<string, number>();
    participants.forEach(p => defaultMap.set(p.id, 0.5));
    
    return {
      topicRelevance: defaultMap,
      expertiseMatch: defaultMap,
      engagementLevel: defaultMap,
      conversationFlow: {
        lastSpeakers: [],
        topicShifts: 0,
        questionsPending: [],
        consensusLevel: 0
      },
      recommendations: {
        nextSpeaker: participants[0]?.Id || 0,
        reason: 'Default selection',
        confidence: 0.5,
        alternatives: []
      }
    };
  }

  getStrategyType(): TurnStrategy {
    return this.strategyType;
  }

  getStrategyDescription(): string {
    return 'Context Aware: AI-driven turn selection based on topic relevance, expertise, and engagement';
  }

  getStrategyConfig(): Partial<TurnStrategyConfig> {
    return {
      strategy: this.strategyType,
      config: {
        type: 'context_aware',
        relevanceThreshold: 0.3,
        expertiseWeight: 0.4,
        engagementWeight: 0.3
      }
    };
  }
} 