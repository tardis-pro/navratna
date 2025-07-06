import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/shared-services';

export interface LearningInteraction {
  id: string;
  agentId: string;
  userId: string;
  type: 'execution' | 'feedback' | 'correction' | 'observation';
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  success: boolean;
  feedback?: string;
  metrics: {
    accuracy?: number;
    efficiency?: number;
    userSatisfaction?: number;
    responseTime?: number;
  };
  context: {
    timestamp: Date;
    sessionId: string;
    environment: string;
    complexity: 'low' | 'medium' | 'high';
  };
  tags: string[];
}

export interface LearningResult {
  learningOutcome: 'processed' | 'pattern_detected' | 'improvement_identified' | 'knowledge_updated';
  insights: string[];
  updatedKnowledge: boolean;
  confidence: number;
  recommendations: string[];
  patterns: {
    identified: string[];
    frequency: Record<string, number>;
    correlations: Array<{
      factor1: string;
      factor2: string;
      strength: number;
    }>;
  };
  performance: {
    baseline: Record<string, number>;
    current: Record<string, number>;
    improvement: Record<string, number>;
  };
}

export class AgentLearningService {
  private eventBusService: EventBusService;
  private interactionCache: Map<string, LearningInteraction[]> = new Map();

  constructor() {
    this.eventBusService = EventBusService.getInstance();
  }

  async processLearningData(params: {
    agentId: string;
    executionData: Record<string, unknown>;
    feedback?: string;
    metrics?: Record<string, number>;
    context?: Record<string, unknown>;
  }): Promise<LearningResult> {
    try {
      logger.info('Processing learning data', { agentId: params.agentId });

      // Create learning interaction record
      const interaction = await this.createInteraction(params);

      // Store interaction
      await this.storeInteraction(interaction);

      // Analyze patterns
      const patterns = await this.analyzePatterns(params.agentId);

      // Extract insights
      const insights = await this.extractInsights(interaction, patterns);

      // Update knowledge base
      const knowledgeUpdated = await this.updateKnowledge(params.agentId, insights, patterns);

      // Calculate performance metrics
      const performance = await this.calculatePerformance(params.agentId);

      // Generate recommendations
      const recommendations = this.generateRecommendations(insights, performance, patterns);

      const result: LearningResult = {
        learningOutcome: this.determineLearningOutcome(insights, patterns, knowledgeUpdated),
        insights,
        updatedKnowledge: knowledgeUpdated,
        confidence: this.calculateLearningConfidence(interaction, patterns),
        recommendations,
        patterns: {
          identified: patterns.map(p => p.description),
          frequency: this.calculatePatternFrequency(patterns),
          correlations: this.findCorrelations(patterns)
        },
        performance
      };

      // Emit learning event
      await this.eventBusService.publish('agent.learning.completed', {
        agentId: params.agentId,
        interaction,
        result,
        timestamp: new Date()
      });

      logger.info('Learning data processed successfully', { 
        agentId: params.agentId, 
        outcome: result.learningOutcome,
        insightCount: insights.length 
      });

      return result;
    } catch (error) {
      logger.error('Failed to process learning data', { error, agentId: params.agentId });
      throw error;
    }
  }

  private async createInteraction(params: {
    agentId: string;
    executionData: Record<string, unknown>;
    feedback?: string;
    metrics?: Record<string, number>;
    context?: Record<string, unknown>;
  }): Promise<LearningInteraction> {
    const interaction: LearningInteraction = {
      id: `interaction_${Date.now()}_${params.agentId}`,
      agentId: params.agentId,
      userId: params.context?.userId as string || 'system',
      type: params.feedback ? 'feedback' : 'execution',
      input: params.executionData,
      output: params.executionData.result as Record<string, unknown> || {},
      success: !params.executionData.error,
      feedback: params.feedback,
      metrics: {
        accuracy: params.metrics?.accuracy || this.calculateAccuracy(params.executionData),
        efficiency: params.metrics?.efficiency || this.calculateEfficiency(params.executionData),
        userSatisfaction: params.metrics?.userSatisfaction || 0.8,
        responseTime: params.metrics?.responseTime || Date.now() - (params.context?.startTime as number || Date.now())
      },
      context: {
        timestamp: new Date(),
        sessionId: params.context?.sessionId as string || 'default',
        environment: params.context?.environment as string || 'production',
        complexity: this.assessComplexity(params.executionData)
      },
      tags: this.generateTags(params.executionData, params.feedback)
    };

    return interaction;
  }

  private async storeInteraction(interaction: LearningInteraction): Promise<void> {
    // Cache interaction for pattern analysis
    const agentInteractions = this.interactionCache.get(interaction.agentId) || [];
    agentInteractions.push(interaction);
    
    // Keep only last 100 interactions per agent
    if (agentInteractions.length > 100) {
      agentInteractions.shift();
    }
    
    this.interactionCache.set(interaction.agentId, agentInteractions);

    // In a real implementation, this would store to database
    logger.debug('Interaction stored', { 
      agentId: interaction.agentId, 
      interactionId: interaction.id 
    });
  }

  private async analyzePatterns(agentId: string): Promise<Array<{
    type: string;
    description: string;
    frequency: number;
    confidence: number;
    examples: string[];
  }>> {
    const interactions = this.interactionCache.get(agentId) || [];
    const patterns: Array<{
      type: string;
      description: string;
      frequency: number;
      confidence: number;
      examples: string[];
    }> = [];

    if (interactions.length < 5) {
      return patterns; // Need minimum interactions for pattern detection
    }

    // Analyze success patterns
    const successRate = interactions.filter(i => i.success).length / interactions.length;
    if (successRate > 0.8) {
      patterns.push({
        type: 'high_success_rate',
        description: 'Consistently successful executions',
        frequency: successRate,
        confidence: 0.9,
        examples: interactions.filter(i => i.success).slice(0, 3).map(i => i.id)
      });
    }

    // Analyze response time patterns
    const avgResponseTime = interactions.reduce((sum, i) => sum + (i.metrics.responseTime || 0), 0) / interactions.length;
    if (avgResponseTime < 1000) { // Less than 1 second
      patterns.push({
        type: 'fast_response',
        description: 'Consistently fast response times',
        frequency: 1.0,
        confidence: 0.8,
        examples: ['Average response time: ' + avgResponseTime + 'ms']
      });
    }

    // Analyze error patterns
    const errorTypes = interactions
      .filter(i => !i.success)
      .map(i => i.output.error)
      .filter(Boolean);
    
    if (errorTypes.length > 0) {
      const errorFrequency = errorTypes.length / interactions.length;
      patterns.push({
        type: 'error_pattern',
        description: 'Recurring error types detected',
        frequency: errorFrequency,
        confidence: 0.7,
        examples: Array.from(new Set(errorTypes)).slice(0, 3) as string[]
      });
    }

    // Analyze complexity patterns
    const complexityDistribution = interactions.reduce((acc, i) => {
      acc[i.context.complexity] = (acc[i.context.complexity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostCommonComplexity = Object.entries(complexityDistribution)
      .sort(([,a], [,b]) => b - a)[0];

    if (mostCommonComplexity && mostCommonComplexity[1] > interactions.length * 0.6) {
      patterns.push({
        type: 'complexity_preference',
        description: `Primarily handles ${mostCommonComplexity[0]} complexity tasks`,
        frequency: mostCommonComplexity[1] / interactions.length,
        confidence: 0.8,
        examples: [`${mostCommonComplexity[1]} out of ${interactions.length} interactions`]
      });
    }

    return patterns;
  }

  private async extractInsights(
    interaction: LearningInteraction, 
    patterns: Array<any>
  ): Promise<string[]> {
    const insights: string[] = [];

    // Performance insights
    if (interaction.metrics.accuracy && interaction.metrics.accuracy > 0.9) {
      insights.push('High accuracy achieved in recent execution');
    }

    if (interaction.metrics.efficiency && interaction.metrics.efficiency > 0.8) {
      insights.push('Efficient resource utilization demonstrated');
    }

    // Pattern-based insights
    patterns.forEach(pattern => {
      switch (pattern.type) {
        case 'high_success_rate':
          insights.push('Agent demonstrates consistent reliability');
          break;
        case 'fast_response':
          insights.push('Agent optimized for quick responses');
          break;
        case 'error_pattern':
          insights.push('Recurring error patterns identified - consider optimization');
          break;
        case 'complexity_preference':
          insights.push(`Agent specializes in ${pattern.description}`);
          break;
      }
    });

    // Feedback insights
    if (interaction.feedback) {
      if (interaction.feedback.toLowerCase().includes('good') || 
          interaction.feedback.toLowerCase().includes('helpful')) {
        insights.push('Positive user feedback received');
      } else if (interaction.feedback.toLowerCase().includes('error') || 
                 interaction.feedback.toLowerCase().includes('wrong')) {
        insights.push('User feedback indicates areas for improvement');
      }
    }

    // Tag-based insights
    if (interaction.tags.includes('creative')) {
      insights.push('Creative problem-solving approach identified');
    }
    if (interaction.tags.includes('analytical')) {
      insights.push('Strong analytical capabilities demonstrated');
    }

    return insights;
  }

  private async updateKnowledge(
    agentId: string, 
    insights: string[], 
    patterns: Array<any>
  ): Promise<boolean> {
    try {
      // In a real implementation, this would update the knowledge graph
      // For now, we simulate knowledge updates
      
      if (insights.length > 0 || patterns.length > 0) {
        logger.debug('Knowledge updated for agent', { 
          agentId, 
          insightCount: insights.length, 
          patternCount: patterns.length 
        });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to update knowledge', { error, agentId });
      return false;
    }
  }

  private async calculatePerformance(agentId: string): Promise<{
    baseline: Record<string, number>;
    current: Record<string, number>;
    improvement: Record<string, number>;
  }> {
    const interactions = this.interactionCache.get(agentId) || [];
    
    if (interactions.length === 0) {
      return {
        baseline: {},
        current: {},
        improvement: {}
      };
    }

    // Calculate current performance
    const current = {
      successRate: interactions.filter(i => i.success).length / interactions.length,
      avgAccuracy: interactions.reduce((sum, i) => sum + (i.metrics.accuracy || 0), 0) / interactions.length,
      avgEfficiency: interactions.reduce((sum, i) => sum + (i.metrics.efficiency || 0), 0) / interactions.length,
      avgResponseTime: interactions.reduce((sum, i) => sum + (i.metrics.responseTime || 0), 0) / interactions.length,
      avgUserSatisfaction: interactions.reduce((sum, i) => sum + (i.metrics.userSatisfaction || 0), 0) / interactions.length
    };

    // Use first quarter as baseline
    const baselineInteractions = interactions.slice(0, Math.max(1, Math.floor(interactions.length / 4)));
    const baseline = {
      successRate: baselineInteractions.filter(i => i.success).length / baselineInteractions.length,
      avgAccuracy: baselineInteractions.reduce((sum, i) => sum + (i.metrics.accuracy || 0), 0) / baselineInteractions.length,
      avgEfficiency: baselineInteractions.reduce((sum, i) => sum + (i.metrics.efficiency || 0), 0) / baselineInteractions.length,
      avgResponseTime: baselineInteractions.reduce((sum, i) => sum + (i.metrics.responseTime || 0), 0) / baselineInteractions.length,
      avgUserSatisfaction: baselineInteractions.reduce((sum, i) => sum + (i.metrics.userSatisfaction || 0), 0) / baselineInteractions.length
    };

    // Calculate improvement
    const improvement = {
      successRate: current.successRate - baseline.successRate,
      avgAccuracy: current.avgAccuracy - baseline.avgAccuracy,
      avgEfficiency: current.avgEfficiency - baseline.avgEfficiency,
      avgResponseTime: baseline.avgResponseTime - current.avgResponseTime, // Lower is better
      avgUserSatisfaction: current.avgUserSatisfaction - baseline.avgUserSatisfaction
    };

    return { baseline, current, improvement };
  }

  private generateRecommendations(
    insights: string[], 
    performance: any, 
    patterns: Array<any>
  ): string[] {
    const recommendations: string[] = [];

    // Performance-based recommendations
    if (performance.improvement.successRate < 0) {
      recommendations.push('Consider reviewing and optimizing error handling procedures');
    }

    if (performance.improvement.avgResponseTime > 1000) {
      recommendations.push('Response time has increased - investigate performance optimization opportunities');
    }

    if (performance.current.avgUserSatisfaction < 0.7) {
      recommendations.push('User satisfaction is below optimal - review response quality and relevance');
    }

    // Pattern-based recommendations
    patterns.forEach(pattern => {
      if (pattern.type === 'error_pattern' && pattern.frequency > 0.2) {
        recommendations.push(`Address recurring ${pattern.description} to improve reliability`);
      }
    });

    // Insight-based recommendations
    if (insights.some(insight => insight.includes('optimization'))) {
      recommendations.push('Continue optimization efforts based on identified improvement areas');
    }

    if (insights.some(insight => insight.includes('positive feedback'))) {
      recommendations.push('Maintain current successful approaches that generate positive feedback');
    }

    // Default recommendations if none generated
    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring performance and gathering user feedback');
      recommendations.push('Explore opportunities for capability enhancement');
    }

    return recommendations;
  }

  private determineLearningOutcome(
    insights: string[], 
    patterns: Array<any>, 
    knowledgeUpdated: boolean
  ): 'processed' | 'pattern_detected' | 'improvement_identified' | 'knowledge_updated' {
    if (knowledgeUpdated) return 'knowledge_updated';
    if (insights.some(i => i.includes('improvement') || i.includes('optimization'))) return 'improvement_identified';
    if (patterns.length > 0) return 'pattern_detected';
    return 'processed';
  }

  private calculateLearningConfidence(interaction: LearningInteraction, patterns: Array<any>): number {
    let confidence = 0.6; // Base confidence

    // Strong patterns increase confidence
    if (patterns.length > 2) confidence += 0.2;

    // Recent success increases confidence
    if (interaction.success) confidence += 0.1;

    // High accuracy increases confidence
    if (interaction.metrics.accuracy && interaction.metrics.accuracy > 0.8) confidence += 0.1;

    // User feedback increases confidence
    if (interaction.feedback) confidence += 0.05;

    return Math.min(confidence, 0.95);
  }

  private calculatePatternFrequency(patterns: Array<any>): Record<string, number> {
    return patterns.reduce((acc, pattern) => {
      acc[pattern.type] = pattern.frequency;
      return acc;
    }, {});
  }

  private findCorrelations(patterns: Array<any>): Array<{
    factor1: string;
    factor2: string;
    strength: number;
  }> {
    const correlations: Array<{
      factor1: string;
      factor2: string;
      strength: number;
    }> = [];

    // Simple correlation detection
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const pattern1 = patterns[i];
        const pattern2 = patterns[j];
        
        // Calculate correlation strength based on frequency similarity
        const strength = 1 - Math.abs(pattern1.frequency - pattern2.frequency);
        
        if (strength > 0.7) {
          correlations.push({
            factor1: pattern1.type,
            factor2: pattern2.type,
            strength
          });
        }
      }
    }

    return correlations;
  }

  private calculateAccuracy(executionData: Record<string, unknown>): number {
    // Simple heuristic for accuracy calculation
    if (executionData.error) return 0;
    if (executionData.result) return 0.9;
    return 0.7;
  }

  private calculateEfficiency(executionData: Record<string, unknown>): number {
    // Simple heuristic for efficiency calculation
    const startTime = executionData.startTime as number;
    const endTime = executionData.endTime as number;
    
    if (startTime && endTime) {
      const duration = endTime - startTime;
      if (duration < 1000) return 0.95; // Very fast
      if (duration < 5000) return 0.8;  // Fast
      if (duration < 10000) return 0.6; // Moderate
      return 0.4; // Slow
    }
    
    return 0.7; // Default
  }

  private assessComplexity(executionData: Record<string, unknown>): 'low' | 'medium' | 'high' {
    // Simple heuristic for complexity assessment
    const dataSize = JSON.stringify(executionData).length;
    
    if (dataSize > 5000) return 'high';
    if (dataSize > 1000) return 'medium';
    return 'low';
  }

  private generateTags(executionData: Record<string, unknown>, feedback?: string): string[] {
    const tags: string[] = [];

    // Execution-based tags
    if (executionData.analysis) tags.push('analytical');
    if (executionData.creation) tags.push('creative');
    if (executionData.planning) tags.push('strategic');
    if (executionData.execution) tags.push('operational');

    // Feedback-based tags
    if (feedback) {
      if (feedback.toLowerCase().includes('creative')) tags.push('creative');
      if (feedback.toLowerCase().includes('helpful')) tags.push('helpful');
      if (feedback.toLowerCase().includes('fast')) tags.push('efficient');
      if (feedback.toLowerCase().includes('accurate')) tags.push('precise');
    }

    // Default tags
    if (tags.length === 0) {
      tags.push('general');
    }

    return tags;
  }
}