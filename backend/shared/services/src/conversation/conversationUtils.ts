import {
  PersonaConversationContext as ConversationContext,
  ConversationState,
  MessageHistoryItem,
  ContributionScore,
  Persona
} from '@uaip/types';

/**
 * Shared Conversation Utilities
 * 
 * Common conversation analysis functions used across Agent Intelligence 
 * and Discussion Orchestration services to avoid duplication.
 */
export class ConversationUtils {
  /**
   * Analyze conversation flow quality and diversity
   */
  static analyzeConversationFlow(
    messageHistory: MessageHistoryItem[],
    contributionScores: ContributionScore[]
  ): {
    flowQuality: number; // 0-1 score
    suggestions: string[];
    diversityScore: number; // 0-1 score for speaker diversity
    engagementScore: number; // 0-1 score for overall engagement
    balanceScore: number; // 0-1 score for participant balance
  } {
    if (messageHistory.length < 3) {
      return {
        flowQuality: 1.0,
        suggestions: [],
        diversityScore: 1.0,
        engagementScore: 1.0,
        balanceScore: 1.0
      };
    }

    const recentSpeakers = messageHistory.slice(-10).map(m => m.speaker);
    const uniqueSpeakers = new Set(recentSpeakers);
    const diversityScore = uniqueSpeakers.size / Math.min(10, recentSpeakers.length);

    // Check for back-to-back speakers (conversation stagnation)
    let backToBackCount = 0;
    for (let i = 1; i < recentSpeakers.length; i++) {
      if (recentSpeakers[i] === recentSpeakers[i - 1]) {
        backToBackCount++;
      }
    }

    // Check for dominating speakers
    const speakerCounts = recentSpeakers.reduce((acc, speaker) => {
      acc[speaker] = (acc[speaker] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxContributions = Math.max(...Object.values(speakerCounts));
    const dominationScore = maxContributions / recentSpeakers.length;
    const balanceScore = Math.max(0, 1 - dominationScore);

    // Calculate engagement from contribution scores
    const avgContributionScore = contributionScores.length > 0 
      ? contributionScores.reduce((sum, cs) => sum + cs.score, 0) / contributionScores.length
      : 2.5;
    const engagementScore = Math.min(1, avgContributionScore / 5); // Normalize to 0-1

    // Calculate overall flow quality
    const flowQuality = Math.max(0, 
      (diversityScore * 0.3) + 
      (balanceScore * 0.3) + 
      (engagementScore * 0.2) + 
      (Math.max(0, 1 - (backToBackCount * 0.15)) * 0.2)
    );

    // Generate actionable suggestions
    const suggestions: string[] = [];

    if (diversityScore < 0.4) {
      suggestions.push("Low speaker diversity detected. Consider encouraging more participants to join the conversation.");
    }

    if (backToBackCount > 3) {
      suggestions.push("Too many consecutive messages from the same speaker. Encourage speaker transitions for better flow.");
    }

    if (dominationScore > 0.7) {
      suggestions.push("One participant is dominating the conversation. Balance participation across all speakers.");
    }

    if (avgContributionScore < 1.5) {
      suggestions.push("Low engagement detected. Consider introducing new topics or asking open-ended questions.");
    }

    if (balanceScore < 0.3) {
      suggestions.push("Unbalanced participation. Encourage quieter participants to share their perspectives.");
    }

    return {
      flowQuality,
      suggestions,
      diversityScore,
      engagementScore,
      balanceScore
    };
  }

  /**
   * Get comprehensive conversation insights and metrics
   */
  static getConversationInsights(
    messageHistory: MessageHistoryItem[],
    conversationState: ConversationState
  ): {
    totalMessages: number;
    uniqueParticipants: number;
    averageMessageLength: number;
    conversationEnergy: number;
    topContributors: Array<{ speaker: string; count: number; percentage: number }>;
    topicStability: string;
    emotionalTone: string;
    messageFrequency?: number; // messages per minute
    longestSilence?: number; // seconds
    participationDistribution?: 'balanced' | 'unbalanced' | 'dominated';
  } {
    const totalMessages = messageHistory.length;
    const uniqueParticipants = new Set(messageHistory.map(m => m.speaker)).size;
    const averageMessageLength = totalMessages > 0 
      ? messageHistory.reduce((sum, m) => sum + m.content.length, 0) / totalMessages 
      : 0;

    // Calculate speaker contributions
    const speakerCounts = messageHistory.reduce((acc, msg) => {
      acc[msg.speaker] = (acc[msg.speaker] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topContributors = Object.entries(speakerCounts)
      .map(([speaker, count]) => ({
        speaker,
        count: Number(count),
        percentage: (Number(count) / totalMessages) * 100
      }))
      .sort((a, b) => b.count - a.count);

    // Calculate message frequency (messages per minute)
    let messageFrequency = 0;
    if (messageHistory.length > 1) {
      const firstMessage = new Date(messageHistory[0].timestamp);
      const lastMessage = new Date(messageHistory[messageHistory.length - 1].timestamp);
      const durationMinutes = (lastMessage.getTime() - firstMessage.getTime()) / (1000 * 60);
      messageFrequency = durationMinutes > 0 ? totalMessages / durationMinutes : 0;
    }

    // Calculate longest silence between messages
    let longestSilence = 0;
    for (let i = 1; i < messageHistory.length; i++) {
      const timeDiff = (new Date(messageHistory[i].timestamp).getTime() - 
                       new Date(messageHistory[i - 1].timestamp).getTime()) / 1000;
      longestSilence = Math.max(longestSilence, timeDiff);
    }

    // Determine participation distribution
    let participationDistribution: 'balanced' | 'unbalanced' | 'dominated' = 'balanced';
    if (topContributors.length > 0) {
      const topPercentage = topContributors[0].percentage;
      if (topPercentage > 60) {
        participationDistribution = 'dominated';
      } else if (topPercentage > 40 || (topContributors.length > 1 && topContributors[1].percentage < 10)) {
        participationDistribution = 'unbalanced';
      }
    }

    // Analyze emotional tone from recent messages
    const emotionalTone = this.analyzeEmotionalTone(messageHistory.slice(-5));

    return {
      totalMessages,
      uniqueParticipants,
      averageMessageLength,
      conversationEnergy: conversationState.conversationEnergy,
      topContributors,
      topicStability: conversationState.topicStability,
      emotionalTone,
      messageFrequency,
      longestSilence,
      participationDistribution
    };
  }

  /**
   * Analyze emotional tone from message content
   */
  static analyzeEmotionalTone(messages: MessageHistoryItem[]): string {
    const emotionalWords = {
      positive: [
        'excited', 'great', 'love', 'excellent', 'amazing', 'fantastic', 
        'wonderful', 'brilliant', 'awesome', 'perfect', 'outstanding',
        'agree', 'yes', 'absolutely', 'definitely', 'exactly'
      ],
      negative: [
        'concerned', 'worried', 'problem', 'issue', 'difficult', 'frustrated',
        'confused', 'disagree', 'wrong', 'bad', 'terrible', 'awful',
        'no', 'never', 'impossible', 'failed', 'error'
      ],
      neutral: [
        'think', 'consider', 'analyze', 'suggest', 'propose', 'maybe',
        'perhaps', 'possible', 'likely', 'might', 'could', 'should'
      ]
    };

    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;

    messages.forEach(msg => {
      const content = msg.content.toLowerCase();
      
      emotionalWords.positive.forEach(word => {
        if (content.includes(word)) positiveCount++;
      });
      
      emotionalWords.negative.forEach(word => {
        if (content.includes(word)) negativeCount++;
      });
      
      emotionalWords.neutral.forEach(word => {
        if (content.includes(word)) neutralCount++;
      });
    });

    const total = positiveCount + negativeCount + neutralCount;
    if (total === 0) return 'neutral';

    const positiveRatio = positiveCount / total;
    const negativeRatio = negativeCount / total;

    if (positiveRatio > 0.4) return 'positive';
    if (negativeRatio > 0.4) return 'negative';
    if (positiveRatio > negativeRatio * 1.5) return 'positive';
    if (negativeRatio > positiveRatio * 1.5) return 'negative';
    
    return 'neutral';
  }

  /**
   * Detect topic shifts in conversation
   */
  static detectTopicShift(
    messageHistory: MessageHistoryItem[],
    windowSize: number = 5
  ): {
    shiftDetected: boolean;
    confidence: number;
    newTopic: string | null;
    previousTopic: string | null;
  } {
    if (messageHistory.length < windowSize * 2) {
      return {
        shiftDetected: false,
        confidence: 0,
        newTopic: null,
        previousTopic: null
      };
    }

    const recent = messageHistory.slice(-windowSize);
    const previous = messageHistory.slice(-windowSize * 2, -windowSize);

    // Simple keyword-based topic shift detection
    const recentWords = this.extractKeywords(recent.map(m => m.content).join(' '));
    const previousWords = this.extractKeywords(previous.map(m => m.content).join(' '));

    const overlap = recentWords.filter(word => previousWords.includes(word)).length;
    const maxWords = Math.max(recentWords.length, previousWords.length);
    const similarity = maxWords > 0 ? overlap / maxWords : 1;

    const shiftDetected = similarity < 0.3; // Low similarity indicates topic shift
    const confidence = shiftDetected ? (1 - similarity) : similarity;

    return {
      shiftDetected,
      confidence,
      newTopic: shiftDetected ? recentWords.slice(0, 3).join(' ') : null,
      previousTopic: shiftDetected ? previousWords.slice(0, 3).join(' ') : null
    };
  }

  /**
   * Extract meaningful keywords from text
   */
  private static extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'to', 'are', 'as',
      'was', 'will', 'be', 'have', 'has', 'had', 'do', 'did', 'does',
      'can', 'could', 'should', 'would', 'may', 'might', 'must',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
      'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their'
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 10); // Top 10 keywords
  }

  /**
   * Initialize default conversation state
   */
  static initializeConversationState(): ConversationState {
    return {
      activePersonaId: null,
      lastSpeakerContinuityCount: 0,
      recentContributors: [],
      conversationEnergy: 0.5,
      needsClarification: false,
      topicStability: 'stable'
    };
  }

  /**
   * Create conversation context from recent messages
   */
  static createConversationContext(
    messageHistory: MessageHistoryItem[],
    conversationState: ConversationState
  ): ConversationContext {
    const recent = messageHistory.slice(-5);
    const topicShift = this.detectTopicShift(messageHistory);
    
    return {
      recentTopics: this.extractKeywords(recent.map(m => m.content).join(' ')),
      speakerHistory: recent.map(m => m.speaker),
      keyPoints: this.extractKeyPointsByTopic(recent),
      conversationMomentum: 'exploring',
      lastSpeakerContribution: recent.reduce((acc, msg) => {
        acc[msg.speaker] = msg.content;
        return acc;
      }, {} as Record<string, string>),
      lastSpeakerContinuityCount: conversationState.lastSpeakerContinuityCount,
      topicShiftDetected: topicShift.shiftDetected,
      overallTone: 'collaborative',
      emotionalContext: this.analyzeEmotionalTone(recent) as any
    };
  }

  /**
   * Calculate message cadence (messages per minute over last 10 messages)
   */
  private static calculateMessageCadence(messageHistory: MessageHistoryItem[]): number {
    if (messageHistory.length < 2) return 0;
    
    const recent = messageHistory.slice(-10);
    if (recent.length < 2) return 0;

    const firstTime = new Date(recent[0].timestamp).getTime();
    const lastTime = new Date(recent[recent.length - 1].timestamp).getTime();
    const durationMinutes = (lastTime - firstTime) / (1000 * 60);
    
    return durationMinutes > 0 ? recent.length / durationMinutes : 0;
  }

  /**
   * Get the speaker who has contributed most in recent messages
   */
  private static getDominantSpeaker(recentMessages: MessageHistoryItem[]): string | undefined {
    if (recentMessages.length === 0) return undefined;
    
    const counts = recentMessages.reduce((acc, msg) => {
      acc[msg.speaker] = (acc[msg.speaker] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts)
      .sort(([,a], [,b]) => b - a)[0]?.[0];
  }

  /**
   * Extract key points organized by topic
   */
  private static extractKeyPointsByTopic(messages: MessageHistoryItem[]): Record<string, string[]> {
    const keyPoints: Record<string, string[]> = {};
    
    messages.forEach(msg => {
      const topic = msg.topic || 'general';
      if (!keyPoints[topic]) {
        keyPoints[topic] = [];
      }
      
      // Extract first sentence as key point
      const sentences = msg.content.split(/[.!?]+/);
      if (sentences.length > 0 && sentences[0].trim().length > 10) {
        keyPoints[topic].push(sentences[0].trim());
      }
    });
    
    return keyPoints;
  }
}